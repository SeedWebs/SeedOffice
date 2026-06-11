import { addDaysISO } from '@seedoffice/core'
import { companyConfig, createDb } from '@seedoffice/db'
import { Hono } from 'hono'
import { buildIcs, type IcsEvent } from '../lib/ics'
import type { AppEnv } from '../types'
import { gatherCalendarEvents, type CalendarEventOut } from './calendar'

/**
 * ICS feed สาธารณะของปฏิทินทีม (SPEC §4.14 · E6)
 * - ไม่มี auth: token ลับในพาธ = ตัวกันเข้าถึง (subscribe ในมือถือยิงตรงไม่มี cookie)
 * - mount ก่อน middleware auth ของ /api/calendar/* ใน index.ts (ดู comment ที่นั่น)
 * - ช่วงเวลา: −45 วัน .. +400 วัน รอบ "วันนี้" (BKK) — พอสำหรับปฏิทินที่ subscribe
 */

/** เทียบ token แบบ constant-time กัน timing attack (ถึงจะเป็น token 256-bit สุ่มก็ตาม) */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** วันลาโชว์ชื่อคน ("ปอนด์ ลา") เหมือน UI · อื่นๆ ใช้ title ตรงๆ */
function summaryOf(e: CalendarEventOut): string {
  if (e.type === 'leave' && e.userName) return `${e.userName} ลา`
  return e.title
}

export const icsFeedRoutes = new Hono<AppEnv>().get('/:token', async (c) => {
  const token = c.req.param('token')
  const db = createDb(c.env.DB)
  const [cfg] = await db
    .select({ icsToken: companyConfig.icsToken })
    .from(companyConfig)
    .limit(1)
  // ปิดอยู่ หรือ token ไม่ตรง → 404 (ไม่บอกว่าผิดหรือปิด กัน enumerate)
  if (!cfg?.icsToken || !safeEqual(token, cfg.icsToken)) return c.json({ error: 'not_found' }, 404)

  const todayBkk = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
  const events = await gatherCalendarEvents(db, addDaysISO(todayBkk, -45), addDaysISO(todayBkk, 400))
  const icsEvents: IcsEvent[] = events.map((e) => ({
    uid: `${e.id}@office.seedwebs.com`,
    summary: summaryOf(e),
    start: e.startDate,
    end: e.endDate,
  }))
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const body = buildIcs(icsEvents, {
    name: 'SeedOffice — ปฏิทินทีม',
    dtstamp,
    prodId: '-//SeedOffice//Team Calendar//TH',
  })
  return new Response(body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="seedoffice.ics"',
      'cache-control': 'private, max-age=300',
    },
  })
})
