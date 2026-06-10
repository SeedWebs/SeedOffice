import { createDb, milestones, payments } from '@seedoffice/db'
import { and, asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { writeAudit } from '../lib/audit'
import type { AppEnv } from '../types'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** งวดงาน + งวดจ่าย — mount ด้วย requireAuth + teamOnly (vendor 403 ทั้ง subtree · SPEC §4.8) */
export const financeRoutes = new Hono<AppEnv>()

  // การเงินของโปรเจกต์: milestones + payments + %จ่าย
  .get('/projects/:id/finance', async (c) => {
    const db = createDb(c.env.DB)
    const projectId = c.req.param('id')
    const ms = await db
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, projectId))
      .orderBy(asc(milestones.sortOrder))
    const pays = await db
      .select()
      .from(payments)
      .where(eq(payments.projectId, projectId))
      .orderBy(asc(payments.installmentNo))
    const total = pays.reduce((s, p) => s + p.amountSatang, 0)
    const paid = pays.filter((p) => p.paidAt).reduce((s, p) => s + p.amountSatang, 0)
    return c.json({
      milestones: ms,
      payments: pays,
      totalSatang: total,
      paidSatang: paid,
      paidPct: total > 0 ? Math.round((paid / total) * 100) : null,
    })
  })

  .post('/projects/:id/milestones', async (c) => {
    const body = z
      .object({
        name: z.string().min(1),
        budgetSatang: z.number().int().nonnegative().optional(),
        dueDate: isoDate.optional(),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const projectId = c.req.param('id')
    const siblings = await db.select().from(milestones).where(eq(milestones.projectId, projectId))
    const inserted = await db
      .insert(milestones)
      .values({ projectId, sortOrder: siblings.length, ...body.data })
      .returning()
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'milestone.create',
      entity: 'milestone',
      entityId: inserted[0]?.id ?? '',
      meta: { projectId, ...body.data },
    })
    return c.json(inserted[0], 201)
  })

  .patch('/milestones/:id', async (c) => {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        budgetSatang: z.number().int().nonnegative().nullable().optional(),
        dueDate: isoDate.nullable().optional(),
        status: z.enum(['planned', 'active', 'done']).optional(),
        sortOrder: z.number().int().optional(),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const before = (
      await db.select().from(milestones).where(eq(milestones.id, c.req.param('id'))).limit(1)
    )[0]
    if (!before) return c.json({ error: 'not_found' }, 404)
    const updated = await db
      .update(milestones)
      .set(body.data)
      .where(eq(milestones.id, before.id))
      .returning()
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'milestone.update',
      entity: 'milestone',
      entityId: before.id,
      meta: { before: { budgetSatang: before.budgetSatang, status: before.status }, after: body.data },
    })
    return c.json(updated[0])
  })

  .delete('/milestones/:id', async (c) => {
    const db = createDb(c.env.DB)
    const before = (
      await db.select().from(milestones).where(eq(milestones.id, c.req.param('id'))).limit(1)
    )[0]
    if (!before) return c.json({ error: 'not_found' }, 404)
    await db.delete(milestones).where(eq(milestones.id, before.id))
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'milestone.delete',
      entity: 'milestone',
      entityId: before.id,
      meta: { name: before.name },
    })
    return c.json({ ok: true })
  })

  .post('/projects/:id/payments', async (c) => {
    const body = z
      .object({
        label: z.string().optional(),
        amountSatang: z.number().int().positive(),
        dueDate: isoDate.optional(),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const projectId = c.req.param('id')
    const siblings = await db.select().from(payments).where(eq(payments.projectId, projectId))
    const inserted = await db
      .insert(payments)
      .values({ projectId, installmentNo: siblings.length + 1, ...body.data })
      .returning()
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'payment.create',
      entity: 'payment',
      entityId: inserted[0]?.id ?? '',
      meta: { projectId, amountSatang: body.data.amountSatang },
    })
    return c.json(inserted[0], 201)
  })

  // แก้งวดจ่าย / ติ๊กรับเงินแล้ว (paidAt) — เงินจริง audit เสมอ
  .patch('/payments/:id', async (c) => {
    const body = z
      .object({
        label: z.string().nullable().optional(),
        amountSatang: z.number().int().positive().optional(),
        dueDate: isoDate.nullable().optional(),
        paidAt: isoDate.nullable().optional(),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const before = (
      await db.select().from(payments).where(eq(payments.id, c.req.param('id'))).limit(1)
    )[0]
    if (!before) return c.json({ error: 'not_found' }, 404)
    const updated = await db
      .update(payments)
      .set(body.data)
      .where(eq(payments.id, before.id))
      .returning()
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'payment.update',
      entity: 'payment',
      entityId: before.id,
      meta: {
        before: { amountSatang: before.amountSatang, paidAt: before.paidAt },
        after: body.data,
      },
    })
    return c.json(updated[0])
  })

  .delete('/payments/:id', async (c) => {
    const db = createDb(c.env.DB)
    const before = (
      await db.select().from(payments).where(eq(payments.id, c.req.param('id'))).limit(1)
    )[0]
    if (!before) return c.json({ error: 'not_found' }, 404)
    await db.delete(payments).where(and(eq(payments.id, before.id)))
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'payment.delete',
      entity: 'payment',
      entityId: before.id,
      meta: { amountSatang: before.amountSatang, installmentNo: before.installmentNo },
    })
    return c.json({ ok: true })
  })
