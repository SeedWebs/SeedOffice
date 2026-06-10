import { clientNotes, createDb, recurringServices, SERVICE_CATEGORIES } from '@seedoffice/db'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { writeAudit } from '../lib/audit'
import type { AppEnv } from '../types'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** แก้/ลบ บริการต่อเนื่อง + โน้ตลูกค้า — mount ใต้ teamOnly */
export const crmItemRoutes = new Hono<AppEnv>()

  .patch('/services/:id', async (c) => {
    const body = z
      .object({
        label: z.string().min(1).optional(),
        category: z.enum(SERVICE_CATEGORIES).optional(),
        period: z.enum(['monthly', 'yearly']).optional(),
        amountSatang: z.number().int().positive().optional(),
        nextDueDate: isoDate.nullable().optional(),
        status: z.enum(['active', 'cancelled']).optional(),
        note: z.string().nullable().optional(),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const before = (
      await db.select().from(recurringServices).where(eq(recurringServices.id, c.req.param('id'))).limit(1)
    )[0]
    if (!before) return c.json({ error: 'not_found' }, 404)
    const updated = await db
      .update(recurringServices)
      .set(body.data)
      .where(eq(recurringServices.id, before.id))
      .returning()
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'recurring_service.update',
      entity: 'recurring_service',
      entityId: before.id,
      meta: {
        before: { amountSatang: before.amountSatang, nextDueDate: before.nextDueDate, status: before.status },
        after: body.data,
      },
    })
    return c.json(updated[0])
  })

  .delete('/services/:id', async (c) => {
    const db = createDb(c.env.DB)
    const before = (
      await db.select().from(recurringServices).where(eq(recurringServices.id, c.req.param('id'))).limit(1)
    )[0]
    if (!before) return c.json({ error: 'not_found' }, 404)
    await db.delete(recurringServices).where(eq(recurringServices.id, before.id))
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'recurring_service.delete',
      entity: 'recurring_service',
      entityId: before.id,
      meta: { label: before.label, amountSatang: before.amountSatang },
    })
    return c.json({ ok: true })
  })

  .post('/clients/:id/notes', async (c) => {
    const body = z.object({ body: z.string().min(1).max(1000) }).safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const me = c.get('user')
    const inserted = await db
      .insert(clientNotes)
      .values({ clientId: c.req.param('id'), body: body.data.body, createdBy: me.id })
      .returning()
    return c.json({ ...inserted[0], byName: me.name }, 201)
  })

  .delete('/notes/:id', async (c) => {
    const db = createDb(c.env.DB)
    await db.delete(clientNotes).where(eq(clientNotes.id, c.req.param('id')))
    return c.json({ ok: true })
  })
