/**
 * เวลา/timer (SPEC §4.5) — pure ล้วน รับ epoch ms เข้า ไม่มี Date.now
 * ไทยคงที่ UTC+7 ไม่มี DST → แปลงวันแบบ offset ตายตัวได้
 */

export const BKK_OFFSET_MS = 7 * 3_600_000

/** instant (epoch ms) → วันที่ฝั่งไทย 'YYYY-MM-DD' */
export function bkkDateOf(epochMs: number): string {
  const d = new Date(epochMs + BKK_OFFSET_MS)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`
}

export interface DayMinutes {
  workDate: string
  minutes: number
}

/**
 * แบ่ง session timer ลง workDate — ตัดที่เที่ยงคืนไทย (เคาะ T03: split เพื่อให้เลขรายวันตรงจริง)
 * ปัดวินาทีเป็นนาทีใกล้สุดต่อก้อน · ก้อน 0 นาทีถูกตัดทิ้ง
 */
export function splitSessionMinutes(startMs: number, endMs: number): DayMinutes[] {
  if (endMs <= startMs) throw new RangeError('end ต้องอยู่หลัง start')
  const out: DayMinutes[] = []
  let cursor = startMs
  while (cursor < endMs) {
    const workDate = bkkDateOf(cursor)
    // เที่ยงคืนไทยถัดไปของ cursor
    const local = new Date(cursor + BKK_OFFSET_MS)
    const nextMidnight =
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) - BKK_OFFSET_MS
    const sliceEnd = Math.min(endMs, nextMidnight)
    const minutes = Math.round((sliceEnd - cursor) / 60_000)
    if (minutes > 0) out.push({ workDate, minutes })
    cursor = sliceEnd
  }
  return out
}

/** โควตาที่เหลือก่อนชนเพดานวัน (ไม่ติดลบ — เกินแล้ว = 0) */
export function remainingCapMinutes(loggedTodayMinutes: number, capMinutes: number): number {
  return Math.max(0, capMinutes - loggedTodayMinutes)
}

export interface SourcedMinutes {
  minutes: number
  source: 'timer' | 'manual'
}

/**
 * Integrity metric (SPEC §4.5): % เวลา manual เทียบเวลารวม "ทั้งงวด" ต่อคน
 * คืนสัดส่วน 0–1 (float เพื่อแสดงผลเท่านั้น) · ไม่มีเวลาเลย = 0
 */
export function manualRatio(entries: readonly SourcedMinutes[]): number {
  let total = 0
  let manual = 0
  for (const e of entries) {
    total += e.minutes
    if (e.source === 'manual') manual += e.minutes
  }
  return total === 0 ? 0 : manual / total
}

/** เกณฑ์ flag สีส้ม: manual เกิน 10% ของงวด (SPEC §13 locked) */
export const MANUAL_FLAG_THRESHOLD = 0.1
export const isManualFlagged = (ratio: number): boolean => ratio > MANUAL_FLAG_THRESHOLD

export interface RatePoint {
  rateSatangPerHour: number
  effectiveFrom: string // YYYY-MM-DD
}

/** rate ที่มีผล ณ วันที่กำหนด (ล่าสุดที่ effectiveFrom ≤ date) — ใช้ snapshot ตอนสร้าง time entry */
export function rateAt(history: readonly RatePoint[], date: string): number | null {
  let best: RatePoint | null = null
  for (const r of history) {
    if (r.effectiveFrom <= date && (best === null || r.effectiveFrom > best.effectiveFrom)) best = r
  }
  return best?.rateSatangPerHour ?? null
}
