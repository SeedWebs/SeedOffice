import { bkkDateOf } from '@seedoffice/core'
import { createDb, projects, taskGroups, tasks, taskStars } from '@seedoffice/db'
import { and, asc, eq, gte, ne } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../types'

/** ดาว "ทำวันนี้" + ภาพรวมส่วนตัวแบบย่อ (งานวันนี้ / งานเร็วๆ นี้) — ของตัวเองทุก role */
export const overviewRoutes = new Hono<AppEnv>()

  // ติด/ถอนดาววันนี้ (ของตัวเอง)
  .post('/tasks/:id/star', async (c) => {
    const body = z.object({ on: z.boolean() }).safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const task = (await db.select().from(tasks).where(eq(tasks.id, c.req.param('id'))).limit(1))[0]
    if (!task) return c.json({ error: 'not_found' }, 404)
    const me = c.get('user')
    const today = bkkDateOf(Date.now())
    await db
      .delete(taskStars)
      .where(and(eq(taskStars.taskId, task.id), eq(taskStars.userId, me.id), eq(taskStars.forDate, today)))
    if (body.data.on)
      await db.insert(taskStars).values({ taskId: task.id, userId: me.id, forDate: today })
    return c.json({ ok: true, starred: body.data.on })
  })

  // ภาพรวมย่อ: งานวันนี้ (ติดดาว — T12 จะเพิ่มงานที่จับเวลาวันนี้) + งานเร็วๆ นี้ (มอบหมายให้ฉัน ≤5)
  .get('/overview', async (c) => {
    const db = createDb(c.env.DB)
    const me = c.get('user')
    const today = bkkDateOf(Date.now())

    const starredRows = await db
      .select({ task: tasks, projectName: projects.name, projectId: projects.id, groupName: taskGroups.name })
      .from(taskStars)
      .innerJoin(tasks, eq(taskStars.taskId, tasks.id))
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .innerJoin(taskGroups, eq(tasks.groupId, taskGroups.id))
      .where(and(eq(taskStars.userId, me.id), eq(taskStars.forDate, today)))
      .orderBy(asc(tasks.sortOrder))

    const upcoming = await db
      .select({ task: tasks, projectName: projects.name, projectId: projects.id })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(eq(tasks.assigneeId, me.id), ne(tasks.status, 'done'), gte(tasks.dueDate, today)))
      .orderBy(asc(tasks.dueDate))
      .limit(5)

    return c.json({
      today: starredRows.map((r) => ({
        id: r.task.id,
        title: r.task.title,
        status: r.task.status,
        projectId: r.projectId,
        projectName: r.projectName,
        groupName: r.groupName,
        starred: true,
        todaySeconds: 0, // T12: เวลาวันนี้ของงานนี้
      })),
      upcoming: upcoming.map((r) => ({
        id: r.task.id,
        title: r.task.title,
        projectId: r.projectId,
        projectName: r.projectName,
        dueDate: r.task.dueDate,
      })),
    })
  })
