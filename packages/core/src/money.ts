/**
 * ตรรกะเงิน (SPEC §4.7/§4.8/§9) — pure ล้วน
 * เงิน = integer สตางค์ · เวลา = integer นาที · ปัดเศษ = ครึ่งปัดขึ้นที่หน่วยสตางค์ ที่เดียวที่นี่
 */

function assertInt(n: number, name: string): void {
  if (!Number.isInteger(n)) throw new TypeError(`${name} ต้องเป็น integer ได้ ${n}`)
}
function assertNonNeg(n: number, name: string): void {
  assertInt(n, name)
  if (n < 0) throw new RangeError(`${name} ต้องไม่ติดลบ ได้ ${n}`)
}

/** เงินจากเวลา: round-half-up(minutes × rate ÷ 60) — ใช้ทั้งเงินเดือน base และต้นทุนต่อ entry */
export function baseSatang(minutes: number, rateSatangPerHour: number): number {
  assertNonNeg(minutes, 'minutes')
  assertNonNeg(rateSatangPerHour, 'rateSatangPerHour')
  return Math.round((minutes * rateSatangPerHour) / 60)
}

export const INCOME_KINDS = ['allowance', 'depreciation', 'bonus', 'other_income'] as const
export const DEDUCTION_KINDS = ['sso', 'wht', 'other_deduction'] as const
export type AdjustmentKind = (typeof INCOME_KINDS)[number] | (typeof DEDUCTION_KINDS)[number]

export interface Adjustment {
  kind: AdjustmentKind
  amountSatang: number // เก็บเป็นบวกเสมอ — kind เป็นตัวบอกว่ารายได้หรือหัก
}

export interface NetBreakdown {
  incomeSatang: number // base + รายได้อื่น
  deductionSatang: number
  netSatang: number
}

/** สุทธิ = (base + Σรายได้) − Σหัก (SPEC §4.7) */
export function netOf(baseSatangAmount: number, adjustments: readonly Adjustment[]): NetBreakdown {
  assertNonNeg(baseSatangAmount, 'base')
  let income = baseSatangAmount
  let deduction = 0
  for (const a of adjustments) {
    assertNonNeg(a.amountSatang, `adjustment(${a.kind})`)
    if ((INCOME_KINDS as readonly string[]).includes(a.kind)) income += a.amountSatang
    else if ((DEDUCTION_KINDS as readonly string[]).includes(a.kind)) deduction += a.amountSatang
    else throw new TypeError(`adjustment kind ไม่รู้จัก: ${String(a.kind)}`)
  }
  return { incomeSatang: income, deductionSatang: deduction, netSatang: income - deduction }
}

export interface CostEntry {
  minutes: number
  rateSnapshotSatang: number
}

/**
 * ต้นทุนโปรเจกต์ = Σ ค่าของแต่ละ entry (ปัดต่อ entry)
 * เหตุผล: ให้ยอดต้นทุนรวม = ยอดที่จ่ายให้คนจริงเสมอ (ปัดที่เดียวกัน ไม่ปัดซ้อน)
 */
export function costSatang(entries: readonly CostEntry[]): number {
  let sum = 0
  for (const e of entries) sum += baseSatang(e.minutes, e.rateSnapshotSatang)
  return sum
}

export function profitSatang(quotedSatang: number, cost: number): number {
  assertInt(quotedSatang, 'quotedSatang')
  assertInt(cost, 'cost')
  return quotedSatang - cost
}

/** margin = profit ÷ ราคาขาย — float สำหรับ "แสดงผลเท่านั้น" ห้ามเก็บ/คำนวณต่อ · quoted 0 → null */
export function marginOf(quotedSatang: number, cost: number): number | null {
  if (quotedSatang === 0) return null
  return profitSatang(quotedSatang, cost) / quotedSatang
}
