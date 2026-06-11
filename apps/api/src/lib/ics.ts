import { addDaysISO } from '@seedoffice/core'

/**
 * สร้าง iCalendar (RFC 5545) สำหรับ ICS feed ของปฏิทินทีม (SPEC §4.14 · E6)
 * pure ทั้งไฟล์ — ไม่แตะ DB/เครือข่าย/นาฬิกา (dtstamp ส่งเข้ามา) เทสต์ได้ตรงๆ
 * ทุก event เป็นแบบทั้งวัน (เก็บเป็น YYYY-MM-DD) → ใช้ VALUE=DATE
 */

export interface IcsEvent {
  uid: string // ต้อง unique + คงที่ (ไม่มีอักขระพิเศษ) เช่น `${id}@office.seedwebs.com`
  summary: string
  start: string // YYYY-MM-DD
  end?: string | null // YYYY-MM-DD วันสุดท้ายที่นับรวม (ไม่ใส่ = วันเดียว)
}

export interface IcsCalendar {
  name: string
  dtstamp: string // UTC แบบ ICS เช่น 20260611T030000Z — ส่งเข้ามาเพื่อให้ฟังก์ชัน pure
  prodId: string // เช่น '-//SeedOffice//Team Calendar//TH'
}

const ymd = (iso: string) => iso.replace(/-/g, '')

/** escape อักขระพิเศษในค่า TEXT ของ ICS (RFC 5545 §3.3.11) — backslash ก่อนเสมอ */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * พับบรรทัดให้ ≤75 octet (RFC 5545 §3.1) — บรรทัดต่อขึ้นต้นด้วยช่องว่าง 1 ตัว
 * เดินทีละ code point (กันตัดกลางตัวอักษรไทย/อีโมจิ) · บรรทัดต่อเหลือ 74 octet เพราะมีช่องว่างนำ
 */
function foldLine(line: string): string {
  const enc = new TextEncoder()
  const segments: string[] = []
  let cur = ''
  let curBytes = 0
  let budget = 75
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (curBytes + n > budget) {
      segments.push(cur)
      cur = ''
      curBytes = 0
      budget = 74
    }
    cur += ch
    curBytes += n
  }
  segments.push(cur)
  return segments.join('\r\n ')
}

export function buildIcs(events: IcsEvent[], cal: IcsCalendar): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${cal.prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(cal.name)}`,
  ]
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${cal.dtstamp}`,
      `DTSTART;VALUE=DATE:${ymd(e.start)}`,
      // DTEND ของ all-day = วันถัดจากวันสุดท้าย (RFC 5545: end เป็น exclusive)
      `DTEND;VALUE=DATE:${ymd(addDaysISO(e.end ?? e.start, 1))}`,
      `SUMMARY:${escapeText(e.summary)}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  // ICS ใช้ CRLF ปิดทุกบรรทัด รวมบรรทัดสุดท้าย
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
