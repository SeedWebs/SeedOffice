import { bkkDateOf } from '@seedoffice/core'
import { createDb, projects, taskGroups, tasks, taskStars, timeEntries, timerSessions } from '@seedoffice/db'
import { and, asc, eq, gte, isNull, ne } from 'drizzle-orm'
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

  // ภาพรวมย่อ: งานวันนี้ = ติดดาว ∪ งานที่จับเวลาวันนี้ (SPEC §4.10) + งานเร็วๆ นี้ (มอบหมายให้ฉัน ≤5)
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

    // งานที่มีเวลาวันนี้ (ของฉัน) + นาทีรวมต่อ task
    const timedToday = await db
      .select({ task: tasks, projectName: projects.name, projectId: projects.id, groupName: taskGroups.name, minutes: timeEntries.minutes })
      .from(timeEntries)
      .innerJoin(tasks, eq(timeEntries.taskId, tasks.id))
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .innerJoin(taskGroups, eq(tasks.groupId, taskGroups.id))
      .where(and(eq(timeEntries.userId, me.id), eq(timeEntries.workDate, today), isNull(timeEntries.deletedAt)))
    const secondsByTask = new Map<string, number>()
    for (const r of timedToday)
      secondsByTask.set(r.task.id, (secondsByTask.get(r.task.id) ?? 0) + r.minutes * 60)

    // timer ที่กำลังเดิน — ส่งแค่ activeTaskId (FE บวกวินาทีที่วิ่งเองกันนับซ้ำ) + ให้ task โผล่ในลิสต์
    const active = (
      await db.select().from(timerSessions).where(eq(timerSessions.userId, me.id)).limit(1)
    )[0]
    if (active && !secondsByTask.has(active.taskId)) secondsByTask.set(active.taskId, 0)

    const byId = new Map<string, { id: string; title: string; status: string; projectId: string; projectName: string; groupName: string; starred: boolean; todaySeconds: number }>()
    for (const r of starredRows)
      byId.set(r.task.id, {
        id: r.task.id, title: r.task.title, status: r.task.status,
        projectId: r.projectId, projectName: r.projectName, groupName: r.groupName,
        starred: true, todaySeconds: secondsByTask.get(r.task.id) ?? 0,
      })
    for (const r of timedToday)
      if (!byId.has(r.task.id))
        byId.set(r.task.id, {
          id: r.task.id, title: r.task.title, status: r.task.status,
          projectId: r.projectId, projectName: r.projectName, groupName: r.groupName,
          starred: false, todaySeconds: secondsByTask.get(r.task.id) ?? 0,
        })
    // task ที่ timer กำลังเดินแต่ยังไม่มี entry/ดาว — ดึงมาโชว์ด้วย
    if (active && !byId.has(active.taskId)) {
      const row = (
        await db
          .select({ task: tasks, projectName: projects.name, projectId: projects.id, groupName: taskGroups.name })
          .from(tasks)
          .innerJoin(projects, eq(tasks.projectId, projects.id))
          .innerJoin(taskGroups, eq(tasks.groupId, taskGroups.id))
          .where(eq(tasks.id, active.taskId))
          .limit(1)
      )[0]
      if (row)
        byId.set(row.task.id, {
          id: row.task.id, title: row.task.title, status: row.task.status,
          projectId: row.projectId, projectName: row.projectName, groupName: row.groupName,
          starred: false, todaySeconds: 0,
        })
    }

    const upcoming = await db
      .select({ task: tasks, projectName: projects.name, projectId: projects.id })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(eq(tasks.assigneeId, me.id), ne(tasks.status, 'done'), gte(tasks.dueDate, today)))
      .orderBy(asc(tasks.dueDate))
      .limit(5)

    return c.json({
      today: [...byId.values()],
      activeTaskId: active?.taskId ?? null,
      upcoming: upcoming.map((r) => ({
        id: r.task.id,
        title: r.task.title,
        projectId: r.projectId,
        projectName: r.projectName,
        dueDate: r.task.dueDate,
      })),
    })
  })
