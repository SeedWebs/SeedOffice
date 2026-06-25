import { addDaysISO, bkkDateOf } from '@seedoffice/core'
import { calendarEvents, createDb, projects, taskGroups, tasks, taskStars, timeEntries, timerSessions, users } from '@seedoffice/db'
import { and, eq, gte, isNull, lte } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../types'

interface ProjectTasks {
  projectId: string
  projectName: string
  tasks: { id: string; title: string; minutesLabel?: string }[]
}

/** กล่อง "ทีมงาน" บนภาพรวม (SPEC §4.6+§4.15 รวมกล่องเดียว) — owner+member เท่านั้น */
export const teamActivityRoutes = new Hono<AppEnv>().get('/', async (c) => {
  const db = createDb(c.env.DB)
  const today = bkkDateOf(Date.now())
  const yesterday = addDaysISO(today, -1)
  const monthStart = `${today.slice(0, 7)}-01`

  const team = await db
    .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl, role: users.role })
    .from(users)
    .where(eq(users.status, 'active'))

  // เวลาเดือนนี้ (รวมวันนี้/เมื่อวาน — แบ่งฝั่ง JS ครั้งเดียว)
  const entries = await db
    .select({
      userId: timeEntries.userId,
      workDate: timeEntries.workDate,
      minutes: timeEntries.minutes,
      taskId: timeEntries.taskId,
      taskTitle: tasks.title,
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(timeEntries)
    .innerJoin(tasks, eq(timeEntries.taskId, tasks.id))
    .innerJoin(projects, eq(timeEntries.projectId, projects.id))
    .where(and(gte(timeEntries.workDate, monthStart), isNull(timeEntries.deletedAt)))

  // timer กำลังเดิน
  const running = await db
    .select({ userId: timerSessions.userId, startedAt: timerSessions.startedAt, taskId: tasks.id, taskTitle: tasks.title, projectName: projects.name, projectId: projects.id })
    .from(timerSessions)
    .innerJoin(tasks, eq(timerSessions.taskId, tasks.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))

  // ดาว "ทำวันนี้" ของทุกคน → standup grid
  const stars = await db
    .select({ userId: taskStars.userId, taskId: tasks.id, title: tasks.title, status: tasks.status, projectId: projects.id, projectName: projects.name, groupName: taskGroups.name })
    .from(taskStars)
    .innerJoin(tasks, eq(taskStars.taskId, tasks.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .innerJoin(taskGroups, eq(tasks.groupId, taskGroups.id))
    .where(eq(taskStars.forDate, today))

  // วันลาวันนี้ (calendar type=leave ครอบวันนี้)
  const leaves = await db
    .select({ userId: calendarEvents.userId, startDate: calendarEvents.startDate, endDate: calendarEvents.endDate })
    .from(calendarEvents)
    .where(and(eq(calendarEvents.type, 'leave'), lte(calendarEvents.startDate, today)))
  const onLeave = new Set(
    leaves.filter((l) => l.userId && (l.endDate ?? l.startDate) >= today).map((l) => l.userId as string),
  )

  const groupByProject = (rows: { projectId: string; projectName: string; id: string; title: string; minutesLabel?: string }[]): ProjectTasks[] => {
    const map = new Map<string, ProjectTasks>()
    for (const r of rows) {
      if (!map.has(r.projectId)) map.set(r.projectId, { projectId: r.projectId, projectName: r.projectName, tasks: [] })
      map.get(r.projectId)!.tasks.push({ id: r.id, title: r.title, ...(r.minutesLabel ? { minutesLabel: r.minutesLabel } : {}) })
    }
    return [...map.values()]
  }

  return c.json({
    today,
    rows: team.map((u) => {
      const mine = entries.filter((e) => e.userId === u.id)
      const todayMin = mine.filter((e) => e.workDate === today).reduce((s, e) => s + e.minutes, 0)
      const run = running.find((r) => r.userId === u.id)
      // เมื่อวาน: รวมนาทีต่อ task
      const yMap = new Map<string, { projectId: string; projectName: string; id: string; title: string; minutes: number }>()
      for (const e of mine.filter((e) => e.workDate === yesterday)) {
        const cur = yMap.get(e.taskId)
        if (cur) cur.minutes += e.minutes
        else yMap.set(e.taskId, { projectId: e.projectId, projectName: e.projectName, id: e.taskId, title: e.taskTitle, minutes: e.minutes })
      }
      const yRows = [...yMap.values()]
      return {
        userId: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl,
        role: u.role,
        todayMinutes: todayMin,
        monthMinutes: mine.reduce((s, e) => s + e.minutes, 0),
        onLeaveToday: onLeave.has(u.id),
        running: run
          ? { taskId: run.taskId, taskTitle: run.taskTitle, projectId: run.projectId, projectName: run.projectName, startedAt: run.startedAt }
          : null,
        todayPlan: groupByProject(
          stars.filter((s) => s.userId === u.id).map((s) => ({ projectId: s.projectId, projectName: s.projectName, id: s.taskId, title: s.title })),
        ),
        yesterday: {
          totalMinutes: yRows.reduce((s, r) => s + r.minutes, 0),
          byProject: groupByProject(
            yRows.map((r) => ({ projectId: r.projectId, projectName: r.projectName, id: r.id, title: r.title, minutesLabel: `${(r.minutes / 60).toFixed(1)} ชม.` })),
          ),
        },
      }
    }),
  })
})
