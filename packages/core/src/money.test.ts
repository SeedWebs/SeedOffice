import { describe, expect, it } from 'vitest'
import { baseSatang, costSatang, marginOf, netOf, profitSatang } from './money'

describe('baseSatang — เงินเดือนจากนาที × rate (สตางค์/ชม.)', () => {
  it('ตรงตัวเลขจริงใน mockup', () => {
    expect(baseSatang(5760, 40000)).toBe(3_840_000) // ปอนด์ 96 ชม. × ฿400 = ฿38,400
    expect(baseSatang(5310, 35000)).toBe(3_097_500) // น้ำ 88.5 ชม. × ฿350 = ฿30,975
    expect(baseSatang(3840, 20000)).toBe(1_280_000) // ตูน 64 ชม. × ฿200 = ฿12,800
    expect(baseSatang(2400, 35000)).toBe(1_400_000) // สมชาย 40 ชม. × ฿350 = ฿14,000
  })
  it('ปัดครึ่งขึ้นที่หน่วยสตางค์ (SPEC §9)', () => {
    expect(baseSatang(1, 40000)).toBe(667) // 666.66… → 667
    expect(baseSatang(1, 30)).toBe(1) // 0.5 → 1 (ครึ่งปัดขึ้น)
    expect(baseSatang(1, 90)).toBe(2) // 1.5 → 2
    expect(baseSatang(0, 40000)).toBe(0)
  })
  it('ปฏิเสธ input ที่ไม่ใช่ integer ≥ 0', () => {
    expect(() => baseSatang(1.5, 40000)).toThrow(TypeError)
    expect(() => baseSatang(60, 400.5)).toThrow(TypeError)
    expect(() => baseSatang(-60, 40000)).toThrow(RangeError)
  })
})

describe('netOf — base + Σรายได้ − Σหัก', () => {
  it('ตรงแถวปอนด์ใน mockup (สุทธิ ฿42,950)', () => {
    const net = netOf(3_840_000, [
      { kind: 'allowance', amountSatang: 150_000 },
      { kind: 'depreciation', amountSatang: 200_000 },
      { kind: 'bonus', amountSatang: 300_000 },
      { kind: 'sso', amountSatang: 75_000 },
      { kind: 'wht', amountSatang: 120_000 },
    ])
    expect(net).toEqual({ incomeSatang: 4_490_000, deductionSatang: 195_000, netSatang: 4_295_000 })
  })
  it('แถวสมชาย (vendor): หัก ณ ที่จ่าย 3% อย่างเดียว → ฿13,580', () => {
    const net = netOf(1_400_000, [{ kind: 'wht', amountSatang: 42_000 }])
    expect(net.netSatang).toBe(1_358_000)
  })
  it('ไม่มี adjustment = base ล้วน · kind แปลกปลอม = โยน', () => {
    expect(netOf(1_000, []).netSatang).toBe(1_000)
    expect(() =>
      netOf(0, [{ kind: 'magic' as never, amountSatang: 1 }]),
    ).toThrow()
  })
  it('amount ติดลบหรือไม่ integer = โยน (จำนวนเก็บเป็นบวกเสมอ ฝั่ง kind เป็นตัวบอกทิศ)', () => {
    expect(() => netOf(0, [{ kind: 'bonus', amountSatang: -5 }])).toThrow(RangeError)
    expect(() => netOf(0, [{ kind: 'bonus', amountSatang: 1.5 }])).toThrow(TypeError)
  })
})

describe('costSatang / profit / margin — P&L โปรเจกต์', () => {
  it('cost = Σ ปัดต่อ entry (สอดคล้องกับยอดที่จ่ายคนจริง)', () => {
    expect(
      costSatang([
        { minutes: 5760, rateSnapshotSatang: 40000 },
        { minutes: 5310, rateSnapshotSatang: 35000 },
      ]),
    ).toBe(3_840_000 + 3_097_500)
    expect(costSatang([])).toBe(0)
    // การปัดต่อ entry: 2 entries ละ 0.5 สตางค์ → 1+1 = 2 (ไม่ใช่ปัดจากผลรวม 1.0 → 1)
    expect(
      costSatang([
        { minutes: 1, rateSnapshotSatang: 30 },
        { minutes: 1, rateSnapshotSatang: 30 },
      ]),
    ).toBe(2)
  })
  it('profit/margin ตรง mockup ทรัพย์เจริญ (ขาย ฿180k · ต้นทุน ฿96.5k → กำไร ฿83.5k = 46%)', () => {
    const quoted = 18_000_000
    const cost = 9_650_000
    expect(profitSatang(quoted, cost)).toBe(8_350_000)
    const margin = marginOf(quoted, cost)
    expect(margin).toBeCloseTo(0.4639, 3)
    expect(Math.round((margin ?? 0) * 100)).toBe(46)
  })
  it('margin เมื่อ quoted = 0 → null (ไม่หารศูนย์)', () => {
    expect(marginOf(0, 100)).toBeNull()
  })
})
