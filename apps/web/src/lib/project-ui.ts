/** ค่าคงที่ฝั่ง UI ของโปรเจกต์ — สี/ป้ายสถานะ ตรงกับ mockup */

export interface ProjectRow {
  id: string
  code: string | null
  name: string
  logo: string | null
  clientId: string | null
  clientName: string | null
  type: 'project' | 'recurring'
  status: 'design' | 'dev' | 'staging' | 'golive' | 'ma' | 'archived'
  quotedSatang?: number | null // ไม่มีเมื่อเป็น vendor (server ตัด)
  recurringPeriod: 'monthly' | 'yearly' | null
  startDate: string | null
  dueDate: string | null
  openTodo: { title: string; dueDate: string | null; assigneeName: string | null } | null
  paidPct?: number | null // ไม่มีเมื่อเป็น vendor (server ตัด)
}

export const STATUS_LABEL: Record<ProjectRow['status'], string> = {
  design: 'Design',
  dev: 'Dev',
  staging: 'Staging',
  golive: 'Go Live',
  ma: 'MA',
  archived: 'archived',
}

export const STATUS_CHIP: Record<ProjectRow['status'], string> = {
  design: 'bg-amber-100 text-amber-800',
  dev: 'bg-orange-100 text-orange-700',
  staging: 'bg-yellow-100 text-yellow-800',
  golive: 'bg-violet-100 text-violet-700',
  ma: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-slate-100 text-slate-500',
}

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
