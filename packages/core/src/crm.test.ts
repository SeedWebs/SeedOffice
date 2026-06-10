import { describe, expect, it } from 'vitest'
import { arrSatang, clientMoney, daysBetweenISO, mrrSatang, nextExpiry } from './crm'

// fixture จาก mockup: บริษัท เลิร์นโปร
const LEARNPRO_PAYMENTS = [
  { amountSatang: 18_000_000, dueDate: '2026-01-15', paidAt: '2026-01-15' },
  { amountSatang: 13_500_000, dueDate: '2026-04-15', paidAt: '2026-04-16' },
  { amountSatang: 13_500_000, dueDate: '2026-05-27', paidAt: null }, // overdue ณ 10 มิ.ย.
]
const LEARNPRO_SERVICES = [
  { period: 'monthly' as const, amountSatang: 250_000, status: 'active' as const, nextDueDate: '2026-07-01' },
  { period: 'yearly' as const, amountSatang: 85_600, status: 'active' as const, nextDueDate: '2027-03-15' },
]

describe('clientMoney — ยอดขาย/รับแล้ว/ค้าง/เกินกำหนด (รับ today เข้า ไม่มี Date.now)', () => {
  it('ตรง mockup เลิร์นโปร: เสนอ ฿450k · รับ ฿315k (70%) · เกินกำหนด ฿135k', () => {
    const m = clientMoney(
      { projects: [{ quotedSatang: 45_000_000 }], payments: LEARNPRO_PAYMENTS },
      '2026-06-10',
    )
    expect(m).toEqual({
      quotedSatang: 45_000_000,
      paidSatang: 31_500_000,
      unpaidSatang: 13_500_000,
      overdueSatang: 13_500_000,
      paidPct: 70,
    })
  })
  it('งวดยังไม่ถึงกำหนด = ค้างแต่ไม่ overdue · ไม่มี payment → pct null', () => {
    const m = clientMoney(
      {
        projects: [{ quotedSatang: 10_000_000 }],
        payments: [{ amountSatang: 5_000_000, dueDate: '2026-12-31', paidAt: null }],
      },
      '2026-06-10',
    )
    expect(m.unpaidSatang).toBe(5_000_000)
    expect(m.overdueSatang).toBe(0)
    expect(clientMoney({ projects: [], payments: [] }, '2026-06-10').paidPct).toBeNull()
  })
})

describe('mrr/arr — integer ล้วน ปัดครั้งเดียวตอนหาร 12', () => {
  it('ตรง mockup เลิร์นโปร: MRR = (2500×12 + 856)/12 = ฿2,571 (ปัด)', () => {
    expect(mrrSatang(LEARNPRO_SERVICES)).toBe(257_133) // 3,085,600/12 = 257,133.33 → 257,133
    expect(arrSatang(LEARNPRO_SERVICES)).toBe(3_085_600)
  })
  it('นับเฉพาะ active · ไม่มีบริการ = 0', () => {
    expect(
      mrrSatang([{ period: 'monthly', amountSatang: 100_000, status: 'cancelled', nextDueDate: null }]),
    ).toBe(0)
    expect(mrrSatang([])).toBe(0)
  })
})

describe('nextExpiry — บริการใกล้หมดอายุสุด + จำนวนวัน', () => {
  it('เรียงตามวันต่ออายุ + นับวันจาก today ที่ส่งเข้า', () => {
    const next = nextExpiry(LEARNPRO_SERVICES, '2026-06-10')
    expect(next).toMatchObject({ nextDueDate: '2026-07-01', daysUntil: 21 })
  })
  it('เลยกำหนดแล้ว → daysUntil ติดลบ · ไม่มี active/วันต่อ → null', () => {
    expect(
      nextExpiry([{ period: 'yearly', amountSatang: 1, status: 'active', nextDueDate: '2026-06-08' }], '2026-06-10')
        ?.daysUntil,
    ).toBe(-2)
    expect(nextExpiry([], '2026-06-10')).toBeNull()
  })
})

describe('daysBetweenISO', () => {
  it('ข้ามเดือน/ปีถูกต้อง', () => {
    expect(daysBetweenISO('2026-06-10', '2026-06-12')).toBe(2)
    expect(daysBetweenISO('2026-12-30', '2027-01-02')).toBe(3)
    expect(daysBetweenISO('2026-06-10', '2026-06-08')).toBe(-2)
  })
})
