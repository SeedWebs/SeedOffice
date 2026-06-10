import { clients, createDb, projects, PROJECT_STATUSES, type Project } from '@seedoffice/db'
import { asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { writeAudit } from '../lib/audit'
import { teamOnly } from '../middleware/roles'
import type { AppEnv } from '../types'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** vendor ห้ามเห็นการเงินโปรเจกต์ (SPEC §2/§4.8) — ตัดที่ server เสมอ */
function serialize(p: Project & { clientName?: string | null }, role: string) {
  if (role === 'vendor') {
    const rest: Partial<typeof p> = { ...p }
    delete rest.quotedSatang
    return rest
  }
  return p
}

export const projectRoutes = new Hono<AppEnv>()

  // ลิสต์ทั้งหมด (รวม archived — lightbox ใช้ค้น) · vendor ถูกตัดข้อมูลเงิน
  .get('/', async (c) => {
    const db = createDb(c.env.DB)
    const rows = await db
      .select({ project: projects, clientName: clients.name })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .orderBy(asc(projects.name))
    const role = c.get('user').role
    return c.json(rows.map((r) => serialize({ ...r.project, clientName: r.clientName }, role)))
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

/** รายชื่อลูกค้า (picker) — owner+member */
export const clientPickerRoutes = new Hono<AppEnv>().get('/', teamOnly, async (c) => {
  const db = createDb(c.env.DB)
  return c.json(
    await db
      .select({ id: clients.id, name: clients.name, logo: clients.logo })
      .from(clients)
      .where(eq(clients.status, 'active'))
      .orderBy(asc(clients.name)),
  )
})
