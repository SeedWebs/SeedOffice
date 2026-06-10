import { describe, expect, it } from 'vitest'
import { bkkDateOf, isManualFlagged, manualRatio, rateAt, remainingCapMinutes, splitSessionMinutes } from './time'

// epoch helper: สร้าง ms จากเวลา BKK (UTC+7)
const bkk = (iso: string) => Date.parse(`${iso}:00+07:00`)

describe('bkkDateOf — แปลง instant → วันที่ฝั่งไทย (UTC+7 ไม่มี DST)', () => {
  it('ก่อน/หลังเที่ยงคืนไทยให้คนละวัน แม้ UTC ยังวันเดิม', () => {
    expect(bkkDateOf(bkk('2026-06-10T23:59'))).toBe('2026-06-10')
    expect(bkkDateOf(bkk('2026-06-11T00:01'))).toBe('2026-06-11')
    expect(bkkDateOf(Date.parse('2026-06-10T18:30:00Z'))).toBe('2026-06-11') // 01:30 BKK
  })
})

describe('splitSessionMinutes — timer ข้ามคืน แบ่งนาทีลง workDate ตามเที่ยงคืนไทย', () => {
  it('ใน 1 วัน: ก้อนเดียว', () => {
    expect(splitSessionMinutes(bkk('2026-06-10T10:00'), bkk('2026-06-10T12:30'))).toEqual([
      { workDate: '2026-06-10', minutes: 150 },
    ])
  })
  it('เริ่มเย็นลากข้ามคืน 8 ชม. (18:00→02:00): 6 ชม.วันแรก + 2 ชม.วันถัดไป', () => {
    expect(splitSessionMinutes(bkk('2026-06-10T18:00'), bkk('2026-06-11T02:00'))).toEqual([
      { workDate: '2026-06-10', minutes: 360 },
      { workDate: '2026-06-11', minutes: 120 },
    ])
  })
  it('ปัดวินาทีเป็นนาทีที่ใกล้สุด · ก้อน 0 นาทีถูกตัดทิ้ง', () => {
    expect(splitSessionMinutes(bkk('2026-06-10T10:00'), bkk('2026-06-10T10:00') + 90_000)).toEqual([
      { workDate: '2026-06-10', minutes: 2 }, // 90s → 2 นาที
    ])
    expect(splitSessionMinutes(bkk('2026-06-10T10:00'), bkk('2026-06-10T10:00') + 10_000)).toEqual(
      [],
    ) // 10s → 0 นาที → ทิ้ง
  })
  it('end ≤ start = โยน', () => {
    const t = bkk('2026-06-10T10:00')
    expect(() => splitSessionMinutes(t, t - 1)).toThrow(RangeError)
  })
})

describe('remainingCapMinutes — เพดานชั่วโมง/วัน (block เมื่อหมดโควตา)', () => {
  it('เหลือเท่าไรก่อนชนเพดาน 480 (8 ชม.)', () => {
    expect(remainingCapMinutes(0, 480)).toBe(480)
    expect(remainingCapMinutes(420, 480)).toBe(60)
    expect(remainingCapMinutes(480, 480)).toBe(0)
    expect(remainingCapMinutes(500, 480)).toBe(0) // เกินแล้ว (manual ย้อนหลัง) → ไม่ติดลบ
  })
})

describe('manualRatio — integrity metric ทั้งงวด (flag ส้ม >10%)', () => {
  it('นิยาม: Σmanual ÷ Σทั้งหมด', () => {
    expect(
      manualRatio([
        { minutes: 90, source: 'timer' },
        { minutes: 10, source: 'manual' },
      ]),
    ).toBeCloseTo(0.1)
    expect(manualRatio([])).toBe(0)
    expect(manualRatio([{ minutes: 60, source: 'manual' }])).toBe(1)
  })
  it('flag เมื่อ "เกิน" 10% เท่านั้น (10% พอดี = ปกติ — ตาม mockup ตูน 18% ส้ม / ปอนด์ 4% ปกติ)', () => {
    expect(isManualFlagged(0.1)).toBe(false)
    expect(isManualFlagged(0.100001)).toBe(true)
    expect(isManualFlagged(0.04)).toBe(false)
    expect(isManualFlagged(0.18)).toBe(true)
  })
})

describe('rateAt — rate effective-dated (snapshot ตอนลงเวลา)', () => {
  const history = [
    { rateSatangPerHour: 40000, effectiveFrom: '2026-01-01' },
    { rateSatangPerHour: 45000, effectiveFrom: '2026-06-01' },
  ]
  it('เลือก rate ล่าสุดที่ effectiveFrom ≤ วันที่ลงเวลา', () => {
    expect(rateAt(history, '2026-05-31')).toBe(40000)
    expect(rateAt(history, '2026-06-01')).toBe(45000)
    expect(rateAt(history, '2026-12-31')).toBe(45000)
  })
  it('ลำดับ input ไม่สำคัญ (sort ภายใน) · ก่อน rate แรก = null', () => {
    expect(rateAt([...history].reverse(), '2026-07-01')).toBe(45000)
    expect(rateAt(history, '2025-12-31')).toBeNull()
    expect(rateAt([], '2026-01-01')).toBeNull()
  })
})
