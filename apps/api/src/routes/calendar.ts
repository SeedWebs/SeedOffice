import { addDaysISO, cycleOf } from '@seedoffice/core'
import {
  CALENDAR_EVENT_TYPES,
  calendarEvents,
  companyConfig,
  createDb,
  users,
  type Db,
} from '@seedoffice/db'
import { and, eq, gte, lte } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../types'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export interface CalendarEventOut {
  id: string
  title: string
  startDate: string
  endDate: string | null
  type: (typeof CALENDAR_EVENT_TYPES)[number] | 'payroll'
  userId?: string | null
  userName?: string | null
}

/** event ตัดรอบ/จ่ายเงินเดือนจาก config — virtual ไม่เก็บใน DB (เปลี่ยน config แล้วขยับเอง) */
export function payrollEvents(from: string, to: string, cutoffDay: number): CalendarEventOut[] {
  const out: CalendarEventOut[] = []
  // เดินทีละงวดจาก from จนพ้น to
  let probe = from
  for (let i = 0; i < 26; i++) {
    const cycle = cycleOf(probe, cutoffDay)
    for (const [title, date] of [
      ['ตัดรอบเงินเดือน', cycle.end],
      ['จ่ายเงินเดือน', cycle.payDate],
    ] as const) {
      if (date >= from && date <= to)
        out.push({ id: `payroll-${title}-${date}`, title, startDate: date, endDate: null, type: 'payroll' })
    }
    probe = addDaysISO(cycle.end, 2) // เข้างวดถัดไป
    if (probe > to) break
  }
  return out
}

/**
 * ดึง event ของปฏิทินทีมในช่วง [from, to] รวม payroll virtual — ใช้ร่วมกับ ICS feed (E6)
 * event หลายวันเก็บที่ startDate แต่ครอบช่วง จึงเผื่อ startDate ย้อนไป 31 วันแล้วกรองด้วย endDate
 */
export async function gatherCalendarEvents(
  db: Db,
  from: string,
  to: string,
): Promise<CalendarEventOut[]> {
  const rows = await db
    .select({ ev: calendarEvents, userName: users.name })
    .from(calendarEvents)
    .leftJoin(users, eq(calendarEvents.userId, users.id))
    .where(and(lte(calendarEvents.startDate, to), gte(calendarEvents.startDate, addDaysISO(from, -31))))
  const cfg = (await db.select().from(companyConfig).limit(1))[0]
  const visible = rows.filter((r) => (r.ev.endDate ?? r.ev.startDate) >= from)
  return [
    ...visible.map((r) => ({ ...r.ev, userName: r.userName })),
    ...payrollEvents(from, to, cfg?.cutoffDay ?? 25),
  ]
}

/** ปฏิทินทีม (SPEC §4.14) — mount ด้วย requireAuth + teamOnly (vendor ไม่เห็น team hub) */
export const calendarRoutes = new Hono<AppEnv>()

  .get('/', async (c) => {
    const q = z
      .object({ from: isoDate, to: isoDate })
      .safeParse({ from: c.req.query('from'), to: c.req.query('to') })
    if (!q.success) return c.json({ error: 'invalid_range' }, 400)
    const db = createDb(c.env.DB)
    return c.json({ events: await gatherCalendarEvents(db, q.data.from, q.data.to) })
  })

  .post('/', async (c) => {
    const body = z
      .object({
        title: z.string().min(1).max(120),
        startDate: isoDate,
        endDate: isoDate.optional(),
        type: z.enum(CALENDAR_EVENT_TYPES).default('other'),
        userId: z.string().optional(), // วันลาของใคร
        projectId: z.string().optional(),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    if (body.data.endDate && body.data.endDate < body.data.startDate)
      return c.json({ error: 'invalid_range' }, 400)
    const db = createDb(c.env.DB)
    const me = c.get('user')
    const inserted = await db
      .insert(calendarEvents)
      .values({ ...body.data, createdBy: me.id })
      .returning()
    return c.json(inserted[0], 201)
  })

  .patch('/:id', async (c) => {
    const body = z
      .object({
        title: z.string().min(1).max(120).optional(),
        startDate: isoDate.optional(),
        endDate: isoDate.nullable().optional(),
        type: z.enum(CALENDAR_EVENT_TYPES).optional(),
        userId: z.string().nullable().optional(),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const updated = await db
      .update(calendarEvents)
      .set(body.data)
      .where(eq(calendarEvents.id, c.req.param('id')))
      .returning()
    if (!updated[0]) return c.json({ error: 'not_found' }, 404)
    return c.json(updated[0])
  })

  .delete('/:id', async (c) => {
    const db = createDb(c.env.DB)
    await db.delete(calendarEvents).where(eq(calendarEvents.id, c.req.param('id')))
    return c.json({ ok: true })
  })
