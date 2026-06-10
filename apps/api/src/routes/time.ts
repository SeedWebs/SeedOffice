import { bkkDateOf, cycleOf, isManualFlagged, manualRatio, remainingCapMinutes } from '@seedoffice/core'
import { companyConfig, createDb, tasks, timeEntries, timerSessions, users } from '@seedoffice/db'
import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { writeAudit } from '../lib/audit'
import { teamOnly } from '../middleware/roles'
import { closeSession, getCapMinutes, loggedMinutes, rateFor } from '../lib/time-core'
import type { AppEnv } from '../types'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const timeRoutes = new Hono<AppEnv>()

  // สถานะ timer ของฉัน + ชั่วโมงวันนี้/เพดาน — FE ใช้เดินนาฬิกา + โชว์ banner
  .get('/timer', async (c) => {
    const db = createDb(c.env.DB)
    const me = c.get('user')
    const today = bkkDateOf(Date.now())
    const capMinutes = await getCapMinutes(c.env)
    const todayMinutes = await loggedMinutes(c.env, me.id, today)
    const session = (
      await db
        .select({ s: timerSessions, taskTitle: tasks.title, projectId: tasks.projectId })
        .from(timerSessions)
        .innerJoin(tasks, eq(timerSessions.taskId, tasks.id))
        .where(eq(timerSessions.userId, me.id))
        .limit(1)
    )[0]
    return c.json({
      active: session
        ? { taskId: session.s.taskId, taskTitle: session.taskTitle, projectId: session.projectId, startedAt: session.s.startedAt }
        : null,
      todayMinutes,
      capMinutes,
      capReached: remainingCapMinutes(todayMinutes, capMinutes) === 0,
    })
  })

  // เริ่มจับเวลา (ทุก role รวม vendor — ของตัวเอง) · ตัวเก่าถูกปิดอัตโนมัติ
  .post('/tasks/:id/timer/start', async (c) => {
    const db = createDb(c.env.DB)
    const me = c.get('user')
    const task = (await db.select().from(tasks).where(eq(tasks.id, c.req.param('id'))).limit(1))[0]
    if (!task) return c.json({ error: 'not_found' }, 404)

    const today = bkkDateOf(Date.now())
    if ((await rateFor(c.env, me.id, today)) === null)
      return c.json({ error: 'no_rate', message: 'ยังไม่ถูกตั้ง rate — ให้ owner ตั้งก่อนจึงลงเวลาได้' }, 409)

    const capMinutes = await getCapMinutes(c.env)
    if (remainingCapMinutes(await loggedMinutes(c.env, me.id, today), capMinutes) === 0)
      return c.json(
        { error: 'cap_reached', message: 'ครบเพดานชั่วโมงของวันนี้แล้ว — พักก่อนนะ (เกินจริงค่อยลง manual)' },
        403,
      )

    // ปิด timer เดิม (ถ้ามี) — วิ่งทีละตัวต่อคน
    const existing = (
      await db.select().from(timerSessions).where(eq(timerSessions.userId, me.id)).limit(1)
    )[0]
    if (existing) {
      const prevTask = (await db.select().from(tasks).where(eq(tasks.id, existing.taskId)).limit(1))[0]
      await closeSession(c.env, existing, prevTask?.projectId ?? task.projectId, Date.now())
    }

    await db.insert(timerSessions).values({ userId: me.id, taskId: task.id, startedAt: Date.now() })
    if (task.status === 'todo') await db.update(tasks).set({ status: 'doing' }).where(eq(tasks.id, task.id))
    return c.json({ ok: true, startedAt: Date.now() })
  })

  // หยุดจับเวลา → สร้าง entries (แบ่งวัน/เพดานใน closeSession)
  .post('/timer/stop', async (c) => {
    const db = createDb(c.env.DB)
    const me = c.get('user')
    const session = (
      await db.select().from(timerSessions).where(eq(timerSessions.userId, me.id)).limit(1)
    )[0]
    if (!session) return c.json({ error: 'no_active_timer' }, 404)
    const task = (await db.select().from(tasks).where(eq(tasks.id, session.taskId)).limit(1))[0]
    const result = await closeSession(c.env, session, task?.projectId ?? '', Date.now())
    return c.json({ ok: true, ...result })
  })

  // ลง manual — ย้อนหลังได้ ลงเกินเพดานได้ (escape hatch ตามที่เคาะ) · ทุกครั้งถูก audit
  .post('/tasks/:id/time', async (c) => {
    const body = z
      .object({
        workDate: isoDate,
        minutes: z.number().int().min(1).max(24 * 60),
        note: z.string().max(500).optional(),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const me = c.get('user')
    const task = (await db.select().from(tasks).where(eq(tasks.id, c.req.param('id'))).limit(1))[0]
    if (!task) return c.json({ error: 'not_found' }, 404)
    const rate = await rateFor(c.env, me.id, body.data.workDate)
    if (rate === null)
      return c.json({ error: 'no_rate', message: 'ยังไม่มี rate มีผล ณ วันที่นั้น' }, 409)

    const inserted = await db
      .insert(timeEntries)
      .values({
        userId: me.id,
        taskId: task.id,
        projectId: task.projectId,
        workDate: body.data.workDate,
        minutes: body.data.minutes,
        note: body.data.note,
        rateSnapshotSatang: rate,
        source: 'manual',
      })
      .returning()
    await writeAudit(c.env, {
      actorId: me.id,
      action: 'time_entry.create',
      entity: 'time_entry',
      entityId: inserted[0]?.id ?? '',
      meta: { source: 'manual', taskId: task.id, workDate: body.data.workDate, minutes: body.data.minutes },
    })
    const capMinutes = await getCapMinutes(c.env)
    const dayTotal = await loggedMinutes(c.env, me.id, body.data.workDate)
    return c.json({ ...inserted[0], overCap: dayTotal > capMinutes }, 201)
  })

  // ชั่วโมงทีมทั้งงวด + integrity metric (manual% เห็นทั้งทีม owner+member · SPEC §4.5/§13)
  .get('/team-hours', teamOnly, async (c) => {
    const db = createDb(c.env.DB)
    const today = bkkDateOf(Date.now())
    const cfg = (await db.select().from(companyConfig).limit(1))[0]
    const cycle = cycleOf(c.req.query('date') ?? today, cfg?.cutoffDay ?? 25)

    const entries = await db
      .select({
        userId: timeEntries.userId,
        minutes: timeEntries.minutes,
        source: timeEntries.source,
        editCount: timeEntries.editCount,
      })
      .from(timeEntries)
      .where(
        and(
          gte(timeEntries.workDate, cycle.start),
          lte(timeEntries.workDate, cycle.end),
          isNull(timeEntries.deletedAt),
        ),
      )
    const team = await db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.status, 'active'))

    return c.json({
      cycle,
      rows: team.map((u) => {
        const mine = entries.filter((e) => e.userId === u.id)
        const ratio = manualRatio(mine)
        return {
          userId: u.id,
          name: u.name,
          role: u.role,
          totalMinutes: mine.reduce((s, e) => s + e.minutes, 0),
          manualRatio: ratio,
          flagged: isManualFlagged(ratio),
          editCount: mine.reduce((s, e) => s + e.editCount, 0),
        }
      }),
    })
  })

  // entries ของ task (ใน drawer) — vendor เห็นเฉพาะของตัวเอง (SPEC §2)
  .get('/tasks/:id/time', async (c) => {
    const db = createDb(c.env.DB)
    const me = c.get('user')
    const rows = await db
      .select({ entry: timeEntries, userName: users.name })
      .from(timeEntries)
      .innerJoin(users, eq(timeEntries.userId, users.id))
      .where(and(eq(timeEntries.taskId, c.req.param('id')), isNull(timeEntries.deletedAt)))
      .orderBy(desc(timeEntries.workDate), desc(timeEntries.createdAt))
    const visible = me.role === 'vendor' ? rows.filter((r) => r.entry.userId === me.id) : rows
    return c.json(
      visible.map((r) => ({
        id: r.entry.id,
        userId: r.entry.userId,
        userName: r.userName,
        workDate: r.entry.workDate,
        minutes: r.entry.minutes,
        note: r.entry.note,
        source: r.entry.source,
        editCount: r.entry.editCount,
      })),
    )
  })

  // แก้ entry — เจ้าของ entry หรือ owner · editCount++ · audit ก่อน→หลัง
  .patch('/time/:id', async (c) => {
    const body = z
      .object({
        minutes: z.number().int().min(1).max(24 * 60).optional(),
        note: z.string().max(500).nullable().optional(),
        workDate: isoDate.optional(),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const me = c.get('user')
    const before = (
      await db
        .select()
        .from(timeEntries)
        .where(and(eq(timeEntries.id, c.req.param('id')), isNull(timeEntries.deletedAt)))
        .limit(1)
    )[0]
    if (!before) return c.json({ error: 'not_found' }, 404)
    if (before.userId !== me.id && me.role !== 'owner') return c.json({ error: 'forbidden' }, 403)

    const updated = await db
      .update(timeEntries)
      .set({ ...body.data, editCount: before.editCount + 1, lastEditedBy: me.id, editedAt: new Date() })
      .where(eq(timeEntries.id, before.id))
      .returning()
    await writeAudit(c.env, {
      actorId: me.id,
      action: 'time_entry.update',
      entity: 'time_entry',
      entityId: before.id,
      meta: {
        before: { minutes: before.minutes, workDate: before.workDate, note: before.note },
        after: body.data,
      },
    })
    return c.json(updated[0])
  })

  // ลบ entry = soft-delete (SPEC §11 ห้าม hard-delete เวลา/เงิน)
  .delete('/time/:id', async (c) => {
    const db = createDb(c.env.DB)
    const me = c.get('user')
    const before = (
      await db
        .select()
        .from(timeEntries)
        .where(and(eq(timeEntries.id, c.req.param('id')), isNull(timeEntries.deletedAt)))
        .limit(1)
    )[0]
    if (!before) return c.json({ error: 'not_found' }, 404)
    if (before.userId !== me.id && me.role !== 'owner') return c.json({ error: 'forbidden' }, 403)
    await db.update(timeEntries).set({ deletedAt: new Date() }).where(eq(timeEntries.id, before.id))
    await writeAudit(c.env, {
      actorId: me.id,
      action: 'time_entry.delete',
      entity: 'time_entry',
      entityId: before.id,
      meta: { before: { minutes: before.minutes, workDate: before.workDate } },
    })
    return c.json({ ok: true })
  })
