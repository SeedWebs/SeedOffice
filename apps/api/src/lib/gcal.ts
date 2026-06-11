import { addDaysISO } from '@seedoffice/core'

/**
 * Map event จาก Google Calendar API (events.list) → ฟิลด์ของ calendar_events (SPEC §4.14 · E6)
 * pure — ไม่แตะ DB/เครือข่าย/นาฬิกา (รับ event มา map ตรงๆ) เทสต์ด้วย fixture
 * - all-day: start.date / end.date (end เป็น exclusive ของ Google → ลบ 1 วันให้เป็นวันสุดท้ายที่นับรวม)
 * - มีเวลา: start.dateTime / end.dateTime → แปลงเป็นวันที่โซน Asia/Bangkok (+07:00)
 */

export interface GcalEventTime {
  date?: string // YYYY-MM-DD (all-day)
  dateTime?: string // RFC3339 มี offset/Z
}

export interface GcalEvent {
  id: string
  status?: string // confirmed | tentative | cancelled
  summary?: string
  start?: GcalEventTime
  end?: GcalEventTime
}

export interface MappedGcalEvent {
  gcalId: string
  cancelled: boolean
  title: string
  startDate: string // YYYY-MM-DD
  endDate: string | null // วันสุดท้ายที่นับรวม (null = วันเดียว)
}

/** วันที่ในโซน BKK ของ instant ที่ระบุ (รับ dateTime ที่มี offset แล้ว — deterministic) */
function bkkDate(dateTime: string): string {
  return new Date(new Date(dateTime).getTime() + 7 * 3_600_000).toISOString().slice(0, 10)
}

function startOf(t: GcalEventTime | undefined): string | null {
  if (t?.date) return t.date
  if (t?.dateTime) return bkkDate(t.dateTime)
  return null
}

/** วันสุดท้ายที่นับรวม: all-day end.date เป็น exclusive (−1), timed ใช้วันของ dateTime */
function endInclusiveOf(t: GcalEventTime | undefined): string | null {
  if (t?.date) return addDaysISO(t.date, -1)
  if (t?.dateTime) return bkkDate(t.dateTime)
  return null
}

export function mapGcalEvent(e: GcalEvent): MappedGcalEvent | null {
  const cancelled = e.status === 'cancelled'
  const startDate = startOf(e.start)
  // event ที่ถูกยกเลิกอาจไม่มี start/end (incremental) — ยังคืนเพื่อให้ลบของเดิมได้
  if (cancelled) return { gcalId: e.id, cancelled: true, title: '', startDate: startDate ?? '', endDate: null }
  if (!startDate) return null // event ปกติที่ไม่มีวันเริ่ม = ข้าม
  const endInclusive = endInclusiveOf(e.end)
  return {
    gcalId: e.id,
    cancelled: false,
    title: e.summary?.trim() || '(ไม่มีชื่อ)',
    startDate,
    // ซ่อน endDate ถ้าเท่ากับหรือก่อน startDate (event วันเดียว)
    endDate: endInclusive && endInclusive > startDate ? endInclusive : null,
  }
}
