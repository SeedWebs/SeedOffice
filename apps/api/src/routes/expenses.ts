import { bkkDateOf } from '@seedoffice/core'
import { createDb, EXPENSE_CATEGORIES, expenses, projects, users } from '@seedoffice/db'
import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { writeAudit } from '../lib/audit'
import { ownerOnly } from '../middleware/roles'
import type { AppEnv } from '../types'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024
const monthRange = (month: string) => ({ from: `${month}-01`, to: `${month}-31` }) // YYYY-MM

const satangToBahtStr = (satang: number) => (satang / 100).toFixed(2)

/** เงินสดย่อย (SPEC §4.9) — mount ด้วย requireAuth + teamOnly (vendor ❌ ตาม matrix) */
export const expenseRoutes = new Hono<AppEnv>()

  // ลงค่าใช้จ่าย (multipart: ฟิลด์ + ใบเสร็จ optional) — member/owner ลงของตัวเอง
  .post('/', async (c) => {
    const form = await c.req.formData()
    const parsed = z
      .object({
        expenseDate: isoDate,
        amountSatang: z.coerce.number().int().positive(),
        category: z.enum(EXPENSE_CATEGORIES),
        description: z.string().min(1).max(300),
        paidBy: z.enum(['company', 'self']),
        projectId: z.string().optional(),
      })
      .safeParse({
        expenseDate: form.get('expenseDate'),
        amountSatang: form.get('amountSatang'),
        category: form.get('category'),
        description: form.get('description'),
        paidBy: form.get('paidBy'),
        projectId: form.get('projectId') || undefined,
      })
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'invalid' }, 400)

    let receiptKey: string | null = null
    const file = form.get('receipt')
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_RECEIPT_BYTES) return c.json({ error: 'file_too_large' }, 413)
      if (!/^image\/(png|jpeg|webp|avif)$|^application\/pdf$/.test(file.type))
        return c.json({ error: 'invalid_type', message: 'รับเฉพาะรูปหรือ PDF' }, 415)
      receiptKey = `receipts/${crypto.randomUUID()}-${file.name.replaceAll('/', '_').slice(0, 100)}`
      await c.env.FILES.put(receiptKey, file.stream(), { httpMetadata: { contentType: file.type } })
    }

    const db = createDb(c.env.DB)
    const me = c.get('user')
    const inserted = await db
      .insert(expenses)
      .values({ userId: me.id, receiptKey, ...parsed.data })
      .returning()
    await writeAudit(c.env, {
      actorId: me.id,
      action: 'expense.create',
      entity: 'expense',
      entityId: inserted[0]?.id ?? '',
      meta: { amountSatang: parsed.data.amountSatang, category: parsed.data.category },
    })
    return c.json(inserted[0], 201)
  })

  // ลิสต์ของเดือน (default เดือนนี้) — member เห็นของตัวเอง · owner เห็นทั้งหมด
  .get('/', async (c) => {
    const db = createDb(c.env.DB)
    const me = c.get('user')
    const month = c.req.query('month') ?? bkkDateOf(Date.now()).slice(0, 7)
    const { from, to } = monthRange(month)
    const conds = [gte(expenses.expenseDate, from), lte(expenses.expenseDate, to)]
    if (me.role !== 'owner') conds.push(eq(expenses.userId, me.id))
    const rows = await db
      .select({ expense: expenses, userName: users.name, projectName: projects.name })
      .from(expenses)
      .leftJoin(users, eq(expenses.userId, users.id))
      .leftJoin(projects, eq(expenses.projectId, projects.id))
      .where(and(...conds))
      .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))

    // ยอดค้างคืน (ทั้งหมด ไม่จำกัดเดือน): จ่ายเองแล้ว approved แต่ยังไม่คืน · owner เห็นรวม / member เห็นของตัวเอง
    const owedConds = [eq(expenses.paidBy, 'self'), eq(expenses.status, 'approved')]
    if (me.role !== 'owner') owedConds.push(eq(expenses.userId, me.id))
    const owed = await db
      .select({ amountSatang: expenses.amountSatang })
      .from(expenses)
      .where(and(...owedConds))

    return c.json({
      month,
      rows: rows.map((r) => ({ ...r.expense, userName: r.userName, projectName: r.projectName })),
      owedSatang: owed.reduce((s, r) => s + r.amountSatang, 0),
    })
  })

  // เปลี่ยนสถานะ (owner): approve / reject / reimbursed — ทุกครั้ง audit
  .patch('/:id/status', ownerOnly, async (c) => {
    const body = z
      .object({ status: z.enum(['approved', 'rejected', 'reimbursed']) })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const before = (
      await db.select().from(expenses).where(eq(expenses.id, c.req.param('id'))).limit(1)
    )[0]
    if (!before) return c.json({ error: 'not_found' }, 404)
    // ลำดับสถานะ: reimbursed ได้เฉพาะจาก approved (และต้องเป็นเงินที่จ่ายเอง)
    if (body.data.status === 'reimbursed' && before.status !== 'approved')
      return c.json({ error: 'must_approve_first' }, 409)
    const me = c.get('user')
    const updated = await db
      .update(expenses)
      .set({ status: body.data.status, approvedBy: me.id, approvedAt: new Date() })
      .where(eq(expenses.id, before.id))
      .returning()
    await writeAudit(c.env, {
      actorId: me.id,
      action: `expense.${body.data.status}`,
      entity: 'expense',
      entityId: before.id,
      meta: { before: before.status, amountSatang: before.amountSatang, userId: before.userId },
    })
    return c.json(updated[0])
  })

  // ใบเสร็จ (เจ้าของรายการ หรือ owner)
  .get('/:id/receipt', async (c) => {
    const db = createDb(c.env.DB)
    const me = c.get('user')
    const row = (
      await db.select().from(expenses).where(eq(expenses.id, c.req.param('id'))).limit(1)
    )[0]
    if (!row?.receiptKey) return c.json({ error: 'not_found' }, 404)
    if (me.role !== 'owner' && row.userId !== me.id) return c.json({ error: 'forbidden' }, 403)
    const obj = await c.env.FILES.get(row.receiptKey)
    if (!obj) return c.json({ error: 'object_missing' }, 404)
    const mime = obj.httpMetadata?.contentType ?? 'application/octet-stream'
    return new Response(obj.body, {
      headers: { 'content-type': mime, 'cache-control': 'private, max-age=3600' },
    })
  })

  // CSV เข้า FlowAccount (owner) — เดือนที่เลือก
  .get('/export', ownerOnly, async (c) => {
    const db = createDb(c.env.DB)
    const month = c.req.query('month') ?? bkkDateOf(Date.now()).slice(0, 7)
    const { from, to } = monthRange(month)
    const rows = await db
      .select({ expense: expenses, userName: users.name, projectName: projects.name })
      .from(expenses)
      .leftJoin(users, eq(expenses.userId, users.id))
      .leftJoin(projects, eq(expenses.projectId, projects.id))
      .where(and(gte(expenses.expenseDate, from), lte(expenses.expenseDate, to)))
      .orderBy(expenses.expenseDate)
    const header = ['วันที่', 'รายละเอียด', 'หมวด', 'จำนวน(บาท)', 'จ่ายโดย', 'คนลง', 'โปรเจกต์', 'สถานะ']
    const lines = rows.map((r) =>
      [
        r.expense.expenseDate,
        r.expense.description,
        r.expense.category,
        satangToBahtStr(r.expense.amountSatang),
        r.expense.paidBy === 'self' ? 'ออกเอง' : 'บริษัท',
        r.userName ?? '',
        r.projectName ?? '',
        r.expense.status,
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(','),
    )
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'expense.export',
      entity: 'expense',
      entityId: month,
      meta: { rows: lines.length },
    })
    return new Response('﻿' + [header.join(','), ...lines].join('\n'), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="expenses-${month}.csv"`,
      },
    })
  })
