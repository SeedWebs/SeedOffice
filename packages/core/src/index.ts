/**
 * @seedoffice/core — โดเมนล้วน (pure function, ไม่ผูก HTTP/DB)
 * กติกา (SPEC §9): เงิน = integer สตางค์ (1 บาท = 100 สตางค์) · เวลา = integer นาที · ห้าม float กับเงิน
 * ตรรกะการเงินจริง (base/net/cost/cycle) จะเพิ่มใน T03 แบบ TDD
 */

export const SATANG_PER_BAHT = 100

/** แสดงเงินจากสตางค์ เช่น 3840000 → "฿38,400" · 123456 → "฿1,234.56" */
export function formatSatang(satang: number): string {
  if (!Number.isInteger(satang)) throw new TypeError(`satang ต้องเป็น integer ได้ ${satang}`)
  const sign = satang < 0 ? '-' : ''
  const abs = Math.abs(satang)
  const baht = Math.floor(abs / SATANG_PER_BAHT).toLocaleString('en-US')
  const st = abs % SATANG_PER_BAHT
  return st === 0 ? `${sign}฿${baht}` : `${sign}฿${baht}.${String(st).padStart(2, '0')}`
}

/** แสดงชั่วโมงจากนาที (ทศนิยม 1 ตำแหน่ง) เช่น 5760 → "96.0" · 5310 → "88.5" */
export function minutesToHoursLabel(minutes: number): string {
  if (!Number.isInteger(minutes)) throw new TypeError(`minutes ต้องเป็น integer ได้ ${minutes}`)
  const sign = minutes < 0 ? '-' : ''
  const tenths = Math.round((Math.abs(minutes) * 10) / 60)
  return `${sign}${Math.floor(tenths / 10)}.${tenths % 10}`
}
