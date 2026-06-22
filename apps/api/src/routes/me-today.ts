import { bkkDateOf, isArchivedStatus } from '@seedoffice/core'
import { companyConfig, createDb, projects, taskGroups, tasks, taskStars, timeEntries } from '@seedoffice/db'
import { and, asc, eq, isNull, ne } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../types'

/**
 * GET /api/me/today (SPEC §4.18 · mirror standup §4.6) — payload สำหรับ `/checkin`
 * งานวันนี้ของฉัน (ติดดาว "ทำวันนี้") + งานที่มอบหมายให้ฉันยังไม่เสร็จ + เวลารวมวันนี้/เมื่อวาน
 * เปิดให้ PAT (scope tasks:read) หรือ session cookie — อ่านอย่างเดียว, ของตัวเองเท่านั้น
 */
export const meTodayRoutes = new Hono<AppEnv>().get('/me/today', async (c) => {
  const db = createDb(c.env.DB)
  const me = c.get('user')
  const today = bkkDateOf(Date.now())
  const yesterday = bkkDateOf(Date.now() - 24 * 3_600_000)

  const starred = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      projectId: projects.id,
      projectName: projects.name,
      groupName: taskGroups.name,
    })
    .from(taskStars)
    .innerJoin(tasks, eq(taskStars.taskId, tasks.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .innerJoin(taskGroups, eq(tasks.groupId, taskGroups.id))
    .where(and(eq(taskStars.userId, me.id), eq(taskStars.forDate, today)))
    .orderBy(asc(tasks.sortOrder))

  const assigned = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      projectId: projects.id,
      projectName: projects.name,
      dueDate: tasks.dueDate,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(eq(tasks.assigneeId, me.id), ne(tasks.status, 'done')))
    .orderBy(asc(tasks.dueDate))
    .limit(20)

  const sumMinutes = async (day: string) => {
    const rows = await db
      .select({ minutes: timeEntries.minutes })
      .from(timeEntries)
      .where(and(eq(timeEntries.userId, me.id), eq(timeEntries.workDate, day), isNull(timeEntries.deletedAt)))
    return rows.reduce((s, r) => s + r.minutes, 0)
  }

  return c.json({
    date: today,
    user: { id: me.id, name: me.name },
    starred,
    assigned,
    minutes: { today: await sumMinutes(today), yesterday: await sumMinutes(yesterday) },
  })
})

  /**
   * GET /api/me/projects (SPEC §4.18 · T3) — project→group tree สำหรับ PAT/MCP
   * ไว้ค้น groupId ก่อนสร้าง task ผ่าน POST /api/groups/:id/tasks (เดิม discover ได้แค่ board cookie-only)
   * เปิดให้ PAT (scope tasks:read) หรือ cookie · คืนเฉพาะโครงสร้าง (ไม่มีฟิลด์การเงิน) · ตัด archived ออก
   */
  .get('/me/projects', async (c) => {
    const db = createDb(c.env.DB)
    const cfg = (await db.select({ projectStatuses: companyConfig.projectStatuses }).from(companyConfig).limit(1))[0]
    const rows = await db
      .select({ id: projects.id, name: projects.name, type: projects.type, status: projects.status })
      .from(projects)
      .orderBy(asc(projects.name))
    const groups = await db
      .select({ id: taskGroups.id, name: taskGroups.name, projectId: taskGroups.projectId })
      .from(taskGroups)
      .orderBy(asc(taskGroups.sortOrder))
    return c.json({
      projects: rows
        .filter((p) => !isArchivedStatus(cfg?.projectStatuses, p.status))
        .map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          status: p.status,
          groups: groups.filter((g) => g.projectId === p.id).map((g) => ({ id: g.id, name: g.name })),
        })),
    })
  })
