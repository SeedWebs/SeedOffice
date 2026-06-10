/**
 * CRM aggregations (SPEC §4.17) — pure ล้วน รับ `today` เข้า (ไม่มี Date.now)
 * ยอดทั้งหมด = derived จาก projects/payments/recurring — ไม่เก็บซ้ำใน DB
 */

export function daysBetweenISO(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

export interface ClientMoneyInput {
  projects: { quotedSatang: number | null }[]
  payments: { amountSatang: number; dueDate: string | null; paidAt: string | null }[]
}

export interface ClientMoney {
  quotedSatang: number
  paidSatang: number
  unpaidSatang: number
  overdueSatang: number // "ต้องตามเงิน" = ค้างและเลยกำหนด
  paidPct: number | null
}

export function clientMoney(input: ClientMoneyInput, today: string): ClientMoney {
  const quoted = input.projects.reduce((s, p) => s + (p.quotedSatang ?? 0), 0)
  let paid = 0
  let unpaid = 0
  let overdue = 0
  for (const p of input.payments) {
    if (p.paidAt) paid += p.amountSatang
    else {
      unpaid += p.amountSatang
      if (p.dueDate && p.dueDate < today) overdue += p.amountSatang
    }
  }
  const total = paid + unpaid
  return {
    quotedSatang: quoted,
    paidSatang: paid,
    unpaidSatang: unpaid,
    overdueSatang: overdue,
    paidPct: total > 0 ? Math.round((paid / total) * 100) : null,
  }
}

export interface ServiceLike {
  period: 'monthly' | 'yearly'
  amountSatang: number
  status: 'active' | 'cancelled'
  nextDueDate: string | null
}

/** ARR = Σ(รายเดือน×12 + รายปี) — integer แท้ ไม่มีการหาร */
export function arrSatang(services: readonly ServiceLike[]): number {
  let arr = 0
  for (const s of services) {
    if (s.status !== 'active') continue
    arr += s.period === 'monthly' ? s.amountSatang * 12 : s.amountSatang
  }
  return arr
}

/** MRR = ARR ÷ 12 ปัดครั้งเดียว (ตัวเลขแสดงผล — เงินจริงเก็บตามรอบบิล) */
export function mrrSatang(services: readonly ServiceLike[]): number {
  return Math.round(arrSatang(services) / 12)
}

export interface ExpiryInfo {
  nextDueDate: string
  daysUntil: number
}

/** บริการ active ที่วันต่ออายุใกล้สุด (เลยกำหนด = daysUntil ติดลบ) */
export function nextExpiry(services: readonly ServiceLike[], today: string): ExpiryInfo | null {
  let best: string | null = null
  for (const s of services) {
    if (s.status !== 'active' || !s.nextDueDate) continue
    if (best === null || s.nextDueDate < best) best = s.nextDueDate
  }
  return best ? { nextDueDate: best, daysUntil: daysBetweenISO(today, best) } : null
}
