import { bkkDateOf, type AdjustmentKind } from '@seedoffice/core'
import {
  ADJUSTMENT_KINDS,
  createDb,
  payAdjustments,
  payCycleClosures,
  payNotes,
  payslips,
  users,
} from '@seedoffice/db'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { writeAudit } from '../lib/audit'
import { cycleFor, isCycleClosed, payrollOf } from '../lib/payroll-core'
import type { AppEnv } from '../types'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

async function teamPayroll(env: Env, date: string) {
  const db = createDb(env.DB)
  const cycle = await cycleFor(env, date)
  const team = await db.select().from(users).where(eq(users.status, 'active'))
  const rows = await Promise.all(
    team.map(async (u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      ...(await payrollOf(env, u.id, cycle)),
    })),
  )
  const closed = (
    await db.select().from(payCycleClosures).where(eq(payCycleClosures.cycleStart, cycle.start)).limit(1)
  )[0]
  return { cycle, rows, closed: !!closed }
}

const satangToBahtStr = (satang: number) => (satang / 100).toFixed(2)

/** payroll ทั้งทีม — mount ใต้ /api/admin (ownerOnly อยู่แล้ว) */
export const payrollAdminRoutes = new Hono<AppEnv>()

  .get('/payroll', async (c) => {
    const data = await teamPayroll(c.env, c.req.query('date') ?? bkkDateOf(Date.now()))
    return c.json(data)
  })

  // เพิ่มรายการรายได้/หัก ต่อคนต่องวด (เงินพิเศษ = ลับ — เห็นเฉพาะเจ้าตัว+owner โดย design ของ endpoints)
  .post('/payroll/adjustments', async (c) => {
    const body = z
      .object({
        userId: z.string(),
        cycleStart: isoDate,
        kind: z.enum(ADJUSTMENT_KINDS),
        amountSatang: z.number().int().positive(),
        note: z.string().max(300).optional(),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    if (await isCycleClosed(c.env, body.data.cycleStart))
      return c.json({ error: 'cycle_closed', message: 'งวดนี้ปิดแล้ว แก้ย้อนหลังไม่ได้' }, 409)
    const db = createDb(c.env.DB)
    const inserted = await db
      .insert(payAdjustments)
      .values({ ...body.data, createdBy: c.get('user').id })
      .returning()
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'pay_adjustment.create',
      entity: 'pay_adjustment',
      entityId: inserted[0]?.id ?? '',
      meta: { userId: body.data.userId, kind: body.data.kind, amountSatang: body.data.amountSatang },
    })
    return c.json(inserted[0], 201)
  })

  .delete('/payroll/adjustments/:id', async (c) => {
    const db = createDb(c.env.DB)
    const before = (
      await db.select().from(payAdjustments).where(eq(payAdjustments.id, c.req.param('id'))).limit(1)
    )[0]
    if (!before) return c.json({ error: 'not_found' }, 404)
    if (await isCycleClosed(c.env, before.cycleStart))
      return c.json({ error: 'cycle_closed' }, 409)
    await db.delete(payAdjustments).where(eq(payAdjustments.id, before.id))
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'pay_adjustment.delete',
      entity: 'pay_adjustment',
      entityId: before.id,
      meta: { userId: before.userId, kind: before.kind, amountSatang: before.amountSatang },
    })
    return c.json({ ok: true })
  })

  // โน้ตถึงพนักงาน (เจ้าตัว+owner) — upsert ต่อคนต่องวด
  .put('/payroll/notes', async (c) => {
    const body = z
      .object({ userId: z.string(), cycleStart: isoDate, body: z.string().max(1000) })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const me = c.get('user')
    const existing = (
      await db
        .select()
        .from(payNotes)
        .where(and(eq(payNotes.userId, body.data.userId), eq(payNotes.cycleStart, body.data.cycleStart)))
        .limit(1)
    )[0]
    if (body.data.body.trim() === '') {
      if (existing) await db.delete(payNotes).where(eq(payNotes.id, existing.id))
      return c.json({ ok: true, deleted: true })
    }
    if (existing) {
      await db
        .update(payNotes)
        .set({ body: body.data.body, updatedBy: me.id, updatedAt: new Date() })
        .where(eq(payNotes.id, existing.id))
    } else {
      await db.insert(payNotes).values({ ...body.data, updatedBy: me.id })
    }
    return c.json({ ok: true })
  })

  // CSV สำหรับทำรายการธนาคารวันที่ 25 (ยอดเป็นบาททศนิยม 2 ตำแหน่ง)
  .get('/payroll/export', async (c) => {
    const data = await teamPayroll(c.env, c.req.query('date') ?? bkkDateOf(Date.now()))
    const kindSum = (row: (typeof data.rows)[number], kind: AdjustmentKind) =>
      row.adjustments.filter((a) => a.kind === kind).reduce((s, a) => s + a.amountSatang, 0)
    const header = [
      'ชื่อ', 'อีเมล', 'role', 'ชั่วโมง', 'manual%',
      'เงินเดือน', 'เบี้ยเลี้ยง', 'ค่าสึกหรอ', 'เงินพิเศษ', 'เงินได้อื่นๆ',
      'ประกันสังคม', 'ภาษีหักณที่จ่าย', 'รายการหักอื่นๆ', 'สุทธิ',
    ]
    const lines = data.rows
      .filter((r) => r.minutesTotal > 0 || r.netSatang !== 0)
      .map((r) =>
        [
          r.name, r.email, r.role,
          (r.minutesTotal / 60).toFixed(1),
          `${Math.round(r.manualRatio * 100)}%`,
          satangToBahtStr(r.baseSatang),
          satangToBahtStr(kindSum(r, 'allowance')),
          satangToBahtStr(kindSum(r, 'depreciation')),
          satangToBahtStr(kindSum(r, 'bonus')),
          satangToBahtStr(kindSum(r, 'other_income')),
          satangToBahtStr(kindSum(r, 'sso')),
          satangToBahtStr(kindSum(r, 'wht')),
          satangToBahtStr(kindSum(r, 'other_deduction')),
          satangToBahtStr(r.netSatang),
        ]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(','),
      )
    const csv = '﻿' + [header.join(','), ...lines].join('\n') // BOM ให้ Excel อ่านไทยถูก
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'payroll.export',
      entity: 'pay_cycle',
      entityId: data.cycle.start,
      meta: { rows: lines.length },
    })
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="payroll-${data.cycle.start}.csv"`,
      },
    })
  })

  // ปิดงวด → snapshot payslips ทุกคนที่มียอด + ลงทะเบียนงวดปิด (ห้ามแก้ย้อนหลัง)
  .post('/payroll/close', async (c) => {
    const body = z.object({ date: isoDate }).safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const data = await teamPayroll(c.env, body.data.date)
    if (data.closed) return c.json({ error: 'already_closed' }, 409)

    const db = createDb(c.env.DB)
    const me = c.get('user')
    let count = 0
    for (const r of data.rows) {
      if (r.minutesTotal === 0 && r.netSatang === 0) continue
      await db.insert(payslips).values({
        userId: r.userId,
        cycleStart: data.cycle.start,
        cycleEnd: data.cycle.end,
        payDate: data.cycle.payDate,
        minutesTotal: r.minutesTotal,
        baseSatang: r.baseSatang,
        incomeSatang: r.incomeSatang,
        deductionSatang: r.deductionSatang,
        netSatang: r.netSatang,
        linesJson: { adjustments: r.adjustments, byProject: r.byProject, manualRatio: r.manualRatio },
        ownerNote: r.ownerNote,
      })
      count++
    }
    await db.insert(payCycleClosures).values({
      cycleStart: data.cycle.start,
      cycleEnd: data.cycle.end,
      closedBy: me.id,
    })
    await writeAudit(c.env, {
      actorId: me.id,
      action: 'pay_cycle.close',
      entity: 'pay_cycle',
      entityId: data.cycle.start,
      meta: { payslips: count },
    })
    return c.json({ ok: true, payslips: count })
  })
