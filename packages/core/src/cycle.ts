/**
 * งวดเงินเดือน (SPEC §4.7/§13): cutoffDay=25 → งวด 25→24 จ่าย 26
 * นิยาม: วันที่ ≥ cutoff = งวดถัดไป (เริ่มวันนั้น) · ≤ cutoff−1 = งวดนี้
 * ทำงานบน calendar date string 'YYYY-MM-DD' ล้วน — ไม่มี Date.now/timezone ในนี้
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

interface Ymd {
  y: number
  m: number // 1-12
  d: number
}

export function parseISO(date: string): Ymd {
  const m = ISO_DATE.exec(date)
  if (!m) throw new TypeError(`ต้องเป็น YYYY-MM-DD ได้ ${date}`)
  const ymd = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
  if (ymd.m < 1 || ymd.m > 12 || ymd.d < 1 || ymd.d > daysInMonth(ymd.y, ymd.m))
    throw new TypeError(`วันที่ไม่ถูกต้อง: ${date}`)
  return ymd
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate() // ใช้ Date เป็นตารางปฏิทินเท่านั้น (ไม่ใช่ now)
}

function toISO({ y, m, d }: Ymd): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function addDaysISO(date: string, days: number): string {
  const { y, m, d } = parseISO(date)
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000
  const dt = new Date(t)
  return toISO({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() })
}

function addMonths({ y, m, d }: Ymd, months: number): Ymd {
  const total = y * 12 + (m - 1) + months
  return { y: Math.floor(total / 12), m: (total % 12) + 1, d }
}

export interface PayCycle {
  start: string // วันแรกของงวด (= cutoffDay)
  end: string // วันสุดท้ายของงวด (= วันก่อน cutoff เดือนถัดไป)
  payDate: string // วันจ่าย (= end + 2 · ตาม 24→26)
}

export function cycleOf(date: string, cutoffDay: number): PayCycle {
  if (!Number.isInteger(cutoffDay) || cutoffDay < 1 || cutoffDay > 28)
    throw new RangeError(`cutoffDay ต้องอยู่ใน 1–28 ได้ ${cutoffDay}`)
  const { y, m, d } = parseISO(date)
  // ≥ cutoff → งวดเริ่มเดือนนี้ · < cutoff → งวดเริ่มเดือนก่อน
  const startYmd =
    d >= cutoffDay ? { y, m, d: cutoffDay } : addMonths({ y, m, d: cutoffDay }, -1)
  const start = toISO(startYmd)
  const end = addDaysISO(toISO(addMonths(startYmd, 1)), -1)
  const payDate = addDaysISO(end, 2)
  return { start, end, payDate }
}

/** date อยู่ในช่วง [start, end] ของงวดไหม (เทียบ string ได้ตรงเพราะ ISO เรียงตามอักษร) */
export function inCycle(date: string, cycle: PayCycle): boolean {
  parseISO(date)
  return date >= cycle.start && date <= cycle.end
}
