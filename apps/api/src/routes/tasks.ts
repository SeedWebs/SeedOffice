import { bkkDateOf } from '@seedoffice/core'
import { createDb, projects, taskGroups, tasks, taskStars, TASK_STATUSES, users } from '@seedoffice/db'
import { and, asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { writeAudit } from '../lib/audit'
import { teamOnly } from '../middleware/roles'
import type { AppEnv } from '../types'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const taskPatchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  estimateMinutes: z.number().int().nonnegative().nullable().optional(),
  startDate: isoDate.nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  groupId: z.string().optional(),
  sortOrder: z.number().int().optional(),
})

/** board ของโปรเจกต์ + CRUD group/task — vendor อ่านได้ แก้ไม่ได้ (teamOnly เฉพาะ mutation) */
export const taskRoutes = new Hono<AppEnv>()

  // board เต็มของโปรเจกต์ (groups + tasks + ชื่อผู้รับผิดชอบ + ดาววันนี้ของฉัน)
  .get('/projects/:id/board', async (c) => {
    const db = createDb(c.env.DB)
    const projectId = c.req.param('id')
    const me = c.get('user')
    const today = bkkDateOf(Date.now())
    const groups = await db
      .select()
      .from(taskGroups)
      .where(eq(taskGroups.projectId, projectId))
      .orderBy(asc(taskGroups.sortOrder))
    const rows = await db
      .select({ task: tasks, assigneeName: users.name })
      .from(tasks)
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .where(eq(tasks.projectId, projectId))
      .orderBy(asc(tasks.sortOrder))
    const myStars = await db
      .select({ taskId: taskStars.taskId })
      .from(taskStars)
      .where(and(eq(taskStars.userId, me.id), eq(taskStars.forDate, today)))
    const starred = new Set(myStars.map((s) => s.taskId))
    return c.json({
      groups: groups.map((g) => ({
        ...g,
        tasks: rows
          .filter((r) => r.task.groupId === g.id)
          .map((r) => ({ ...r.task, assigneeName: r.assigneeName, starredToday: starred.has(r.task.id) })),
      })),
    })
  })

  .post('/projects/:id/groups', teamOnly, async (c) => {
    const body = z.object({ name: z.string().min(1) }).safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const projectId = c.req.param('id')
    const exists = (await db.select().from(projects).where(eq(projects.id, projectId)).limit(1))[0]
    if (!exists) return c.json({ error: 'not_found' }, 404)
    const siblings = await db.select().from(taskGroups).where(eq(taskGroups.projectId, projectId))
    const g = await db
      .insert(taskGroups)
      .values({ projectId, name: body.data.name, sortOrder: siblings.length })
      .returning()
    return c.json(g[0], 201)
  })

  .patch('/groups/:id', teamOnly, async (c) => {
    const body = z
      .object({ name: z.string().min(1).optional(), sortOrder: z.number().int().optional() })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const updated = await db
      .update(taskGroups)
      .set(body.data)
      .where(eq(taskGroups.id, c.req.param('id')))
      .returning()
    if (!updated[0]) return c.json({ error: 'not_found' }, 404)
    return c.json(updated[0])
  })

  .delete('/groups/:id', teamOnly, async (c) => {
    const db = createDb(c.env.DB)
    const groupTasks = await db.select().from(tasks).where(eq(tasks.groupId, c.req.param('id')))
    if (groupTasks.length > 0) return c.json({ error: 'group_not_empty' }, 409)
    await db.delete(taskGroups).where(eq(taskGroups.id, c.req.param('id')))
    return c.json({ ok: true })
  })

  .post('/groups/:id/tasks', teamOnly, async (c) => {
    const body = z
      .object({
        title: z.string().min(1),
        assigneeId: z.string().optional(),
        estimateMinutes: z.number().int().nonnegative().optional(),
        startDate: isoDate.optional(),
        dueDate: isoDate.optional(),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const group = (
      await db.select().from(taskGroups).where(eq(taskGroups.id, c.req.param('id'))).limit(1)
    )[0]
    if (!group) return c.json({ error: 'not_found' }, 404)
    const siblings = await db.select().from(tasks).where(eq(tasks.groupId, group.id))
    const me = c.get('user')
    const t = await db
      .insert(tasks)
      .values({
        projectId: group.projectId,
        groupId: group.id,
        sortOrder: siblings.length,
        createdBy: me.id,
        ...body.data,
      })
      .returning()
    const created = t[0]
    if (!created) return c.json({ error: 'insert_failed' }, 500)
    await writeAudit(c.env, {
      actorId: me.id,
      action: 'task.create',
      entity: 'task',
      entityId: created.id,
      meta: { title: created.title, groupId: group.id },
    })
    return c.json(created, 201)
  })

  .patch('/tasks/:id', teamOnly, async (c) => {
    const body = taskPatchSchema.safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const before = (await db.select().from(tasks).where(eq(tasks.id, c.req.param('id'))).limit(1))[0]
    if (!before) return c.json({ error: 'not_found' }, 404)

    const patch: Record<string, unknown> = { ...body.data }
    if (body.data.status === 'done' && before.status !== 'done') patch.completedAt = new Date()
    if (body.data.status && body.data.status !== 'done') patch.completedAt = null

    const updated = await db.update(tasks).set(patch).where(eq(tasks.id, before.id)).returning()

    const me = c.get('user')
    const action =
      body.data.status && body.data.status !== before.status
        ? 'task.status'
        : 'assigneeId' in body.data && body.data.assigneeId !== before.assigneeId
          ? 'task.assign'
          : 'task.update'
    await writeAudit(c.env, {
      actorId: me.id,
      action,
      entity: 'task',
      entityId: before.id,
      meta: {
        title: before.title,
        before: { status: before.status, assigneeId: before.assigneeId },
        after: body.data,
      },
    })
    return c.json(updated[0])
  })

  .delete('/tasks/:id', teamOnly, async (c) => {
    const db = createDb(c.env.DB)
    const before = (await db.select().from(tasks).where(eq(tasks.id, c.req.param('id'))).limit(1))[0]
    if (!before) return c.json({ error: 'not_found' }, 404)
    // T12 จะกันลบ task ที่มี time entries (ข้อมูลเงิน) — ตอนนี้ยังไม่มีตาราง entries
    await db.delete(tasks).where(eq(tasks.id, before.id))
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'task.delete',
      entity: 'task',
      entityId: before.id,
      meta: { title: before.title },
    })
    return c.json({ ok: true })
  })

  // จัดเรียง group + task ทั้งกระดานในครั้งเดียว (โหมดจัดเรียง)
  .post('/projects/:id/reorder', teamOnly, async (c) => {
    const body = z
      .object({
        groups: z.array(z.object({ id: z.string(), sortOrder: z.number().int() })).default([]),
        tasks: z
          .array(z.object({ id: z.string(), groupId: z.string(), sortOrder: z.number().int() }))
          .default([]),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const projectId = c.req.param('id')
    for (const g of body.data.groups)
      await db
        .update(taskGroups)
        .set({ sortOrder: g.sortOrder })
        .where(and(eq(taskGroups.id, g.id), eq(taskGroups.projectId, projectId)))
    for (const t of body.data.tasks)
      await db
        .update(tasks)
        .set({ sortOrder: t.sortOrder, groupId: t.groupId })
        .where(and(eq(tasks.id, t.id), eq(tasks.projectId, projectId)))
    return c.json({ ok: true })
  })
