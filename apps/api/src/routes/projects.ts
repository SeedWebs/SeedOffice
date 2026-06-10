import { costSatang } from '@seedoffice/core'
import { clients, createDb, milestones, payments, projects, PROJECT_STATUSES, tasks, timeEntries, users, type Project } from '@seedoffice/db'
import { asc, eq, isNull, ne } from 'drizzle-orm'
import { healthOf } from './finance'
import { Hono } from 'hono'
import { z } from 'zod'
import { writeAudit } from '../lib/audit'
import { teamOnly } from '../middleware/roles'
import type { AppEnv } from '../types'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** vendor ห้ามเห็นการเงินโปรเจกต์ (SPEC §2/§4.8) — ตัดที่ server เสมอ */
function serialize<
  T extends {
    quotedSatang?: number | null
    paidPct?: number | null
    health?: string | null
    usagePct?: number | null
  },
>(p: T, role: string) {
  if (role === 'vendor') {
    const rest: Partial<T> = { ...p }
    delete rest.quotedSatang
    delete rest.paidPct
    delete rest.health
    delete rest.usagePct
    return rest
  }
  return p
}

export const projectRoutes = new Hono<AppEnv>()

  // ลิสต์ทั้งหมด (รวม archived — lightbox ใช้ค้น) · vendor ถูกตัดข้อมูลเงิน
  // งานต่อเนื่อง: แนบ todo เปิดอยู่ที่ใกล้กำหนดสุด (ตาราง "เรียงตาม todo ที่ต้องส่งก่อน")
  .get('/', async (c) => {
    const db = createDb(c.env.DB)
    const rows = await db
      .select({ project: projects, clientName: clients.name })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .orderBy(asc(projects.name))
    const openTasks = await db
      .select({
        projectId: tasks.projectId,
        title: tasks.title,
        dueDate: tasks.dueDate,
        assigneeName: users.name,
      })
      .from(tasks)
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .where(ne(tasks.status, 'done'))
    const firstOpen = new Map<string, (typeof openTasks)[number]>()
    for (const t of openTasks) {
      const cur = firstOpen.get(t.projectId)
      if (!cur || (t.dueDate ?? '9999') < (cur.dueDate ?? '9999')) firstOpen.set(t.projectId, t)
    }
    // %ลูกค้าจ่าย + จุดสี health ต่อโปรเจกต์ (→ card · vendor ถูกตัดที่ serialize)
    const allPayments = await db
      .select({ projectId: payments.projectId, amountSatang: payments.amountSatang, paidAt: payments.paidAt })
      .from(payments)
    const paidPctOf = (projectId: string): number | null => {
      const mine = allPayments.filter((p) => p.projectId === projectId)
      const total = mine.reduce((s, p) => s + p.amountSatang, 0)
      if (total === 0) return null
      return Math.round((mine.filter((p) => p.paidAt).reduce((s, p) => s + p.amountSatang, 0) / total) * 100)
    }
    const allEntries = await db
      .select({ projectId: timeEntries.projectId, minutes: timeEntries.minutes, rateSnapshotSatang: timeEntries.rateSnapshotSatang })
      .from(timeEntries)
      .where(isNull(timeEntries.deletedAt))
    const allMilestones = await db
      .select({ projectId: milestones.projectId, budgetSatang: milestones.budgetSatang, status: milestones.status })
      .from(milestones)
    const role = c.get('user').role
    return c.json(
      rows.map((r) => {
        const cost = costSatang(allEntries.filter((e) => e.projectId === r.project.id))
        const h = healthOf(
          cost,
          r.project.quotedSatang,
          allMilestones.filter((m) => m.projectId === r.project.id),
        )
        return serialize(
          {
            ...r.project,
            clientName: r.clientName,
            openTodo: firstOpen.get(r.project.id) ?? null,
            paidPct: paidPctOf(r.project.id),
            health: h.health,
            usagePct: h.usagePct,
          },
          role,
        )
      }),
    )
  })

  .get('/:id', async (c) => {
    const db = createDb(c.env.DB)
    const row = (
      await db
        .select({ project: projects, clientName: clients.name })
        .from(projects)
        .leftJoin(clients, eq(projects.clientId, clients.id))
        .where(eq(projects.id, c.req.param('id')))
        .limit(1)
    )[0]
    if (!row) return c.json({ error: 'not_found' }, 404)
    return c.json(serialize({ ...row.project, clientName: row.clientName }, c.get('user').role))
  })

  // สร้างโปรเจกต์ (owner+member) — ลูกค้าใหม่พิมพ์ชื่อ = สร้าง client ให้เลย
  .post('/', teamOnly, async (c) => {
    const body = z
      .object({
        name: z.string().min(1),
        logo: z.string().max(8).optional(),
        type: z.enum(['project', 'recurring']),
        status: z.enum(PROJECT_STATUSES).optional(),
        clientId: z.string().optional(),
        clientName: z.string().min(1).optional(), // ใช้เมื่อไม่มี clientId
        quotedSatang: z.number().int().nonnegative().optional(),
        recurringPeriod: z.enum(['monthly', 'yearly']).optional(),
        startDate: isoDate.optional(),
        dueDate: isoDate.optional(),
        code: z.string().max(12).optional(),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? 'invalid' }, 400)
    const d = body.data
    const db = createDb(c.env.DB)

    let clientId = d.clientId ?? null
    if (!clientId && d.clientName) {
      const existing = (
        await db.select().from(clients).where(eq(clients.name, d.clientName)).limit(1)
      )[0]
      clientId =
        existing?.id ??
        (await db.insert(clients).values({ name: d.clientName }).returning())[0]?.id ??
        null
    }

    const inserted = await db
      .insert(projects)
      .values({
        name: d.name,
        logo: d.logo,
        code: d.code,
        type: d.type,
        status: d.status ?? (d.type === 'recurring' ? 'ma' : 'dev'),
        clientId,
        quotedSatang: d.type === 'project' ? (d.quotedSatang ?? null) : null,
        billingType: d.type === 'recurring' ? 'recurring' : 'fixed',
        recurringPeriod: d.type === 'recurring' ? (d.recurringPeriod ?? 'monthly') : null,
        startDate: d.startDate,
        dueDate: d.dueDate,
      })
      .returning()
    const p = inserted[0]
    if (!p) return c.json({ error: 'insert_failed' }, 500)
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'project.create',
      entity: 'project',
      entityId: p.id,
      meta: { name: p.name, quotedSatang: p.quotedSatang },
    })
    return c.json(p, 201)
  })

  // แก้โปรเจกต์ (owner+member) — เปลี่ยนงบ = ข้อมูลเงิน → audit before/after
  .patch('/:id', teamOnly, async (c) => {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        logo: z.string().max(8).optional(),
        code: z.string().max(12).nullable().optional(),
        status: z.enum(PROJECT_STATUSES).optional(),
        clientId: z.string().nullable().optional(),
        quotedSatang: z.number().int().nonnegative().nullable().optional(),
        recurringPeriod: z.enum(['monthly', 'yearly']).nullable().optional(),
        startDate: isoDate.nullable().optional(),
        dueDate: isoDate.nullable().optional(),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const before = (
      await db.select().from(projects).where(eq(projects.id, c.req.param('id'))).limit(1)
    )[0]
    if (!before) return c.json({ error: 'not_found' }, 404)
    const updated = await db
      .update(projects)
      .set(body.data)
      .where(eq(projects.id, before.id))
      .returning()
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'project.update',
      entity: 'project',
      entityId: before.id,
      meta: {
        before: { status: before.status, quotedSatang: before.quotedSatang },
        after: body.data,
      },
    })
    return c.json(serialize(updated[0] as Project, c.get('user').role))
  })

// (picker ลูกค้าย้ายไปใช้ GET /api/clients ของ CRM — routes/clients.ts)
