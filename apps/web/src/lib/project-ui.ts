/** ค่าคงที่ฝั่ง UI ของโปรเจกต์ — สี/ป้ายสถานะ ตรงกับ mockup */

export interface ProjectRow {
  id: string
  code: string | null
  name: string
  logo: string | null
  clientId: string | null
  clientName: string | null
  type: 'project' | 'recurring'
  status: string // id ของสถานะ (configurable) — ชื่อ/สี/kind มากับ field ด้านล่าง (server ฝังให้)
  statusName: string
  statusColor: string
  statusKind: 'active' | 'archived'
  quotedSatang?: number | null // ไม่มีเมื่อเป็น vendor (server ตัด)
  recurringPeriod: 'monthly' | 'yearly' | null
  startDate: string | null
  dueDate: string | null
  openTodo: { title: string; dueDate: string | null; assigneeName: string | null } | null
  paidPct?: number | null // ไม่มีเมื่อเป็น vendor (server ตัด)
  health?: 'green' | 'amber' | 'red' | null
  usagePct?: number | null
}

export const HEALTH_DOT: Record<'green' | 'amber' | 'red', string> = {
  green: 'bg-success-500',
  amber: 'bg-orange-400',
  red: 'bg-danger-500',
}
export const HEALTH_LABEL: Record<'green' | 'amber' | 'red', string> = {
  green: 'งบงวดนี้ปกติ',
  amber: 'งวดนี้ใกล้เต็มงบ',
  red: 'งวดนี้เกินงบ',
}

/** จานสีสถานะ (คีย์สี → class จริง) — ตรงกับ STATUS_COLOR_KEYS ใน core · literal เพื่อให้ Tailwind generate */
export const STATUS_COLOR_CLASSES: Record<string, string> = {
  slate: 'bg-divider text-dim',
  amber: 'bg-warning-100 text-warning-800',
  orange: 'bg-orange-100 text-orange-700',
  yellow: 'bg-yellow-100 text-yellow-800',
  emerald: 'bg-success-100 text-success-700',
  teal: 'bg-teal-100 text-teal-700',
  sky: 'bg-info-100 text-info-700',
  violet: 'bg-violet-100 text-violet-700',
  rose: 'bg-danger-100 text-danger-700',
}
/** swatch เต็ม (พื้นเข้ม) สำหรับ picker ในหน้า settings */
export const STATUS_SWATCH: Record<string, string> = {
  slate: 'bg-slate-400', amber: 'bg-amber-400', orange: 'bg-orange-400', yellow: 'bg-yellow-400',
  emerald: 'bg-emerald-400', teal: 'bg-teal-400', sky: 'bg-sky-400', violet: 'bg-violet-400', rose: 'bg-rose-400',
}
export const statusChip = (color: string): string => STATUS_COLOR_CLASSES[color] ?? 'bg-divider text-dim'

export const fmtBudgetK = (satang: number) => `฿${Math.round(satang / 100 / 1000)}K`

/** ตำแหน่ง % ของวันที่ในปีปฏิทิน (สำหรับ timeline 12 เดือน) */
export function yearPos(date: string, year: number): number {
  const t = Date.parse(`${date}T00:00:00+07:00`)
  const y0 = Date.parse(`${year}-01-01T00:00:00+07:00`)
  const y1 = Date.parse(`${year + 1}-01-01T00:00:00+07:00`)
  return Math.max(0, Math.min(100, ((t - y0) / (y1 - y0)) * 100))
}

export const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/** 2026-06-30 → "30 มิ.ย." (+ พ.ศ. ถ้าใส่ year) */
export function fmtThaiDate(iso: string | null, withYear = false): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${d} ${TH_MONTHS[m - 1]}${withYear ? ` ${y + 543}` : ''}`
}
