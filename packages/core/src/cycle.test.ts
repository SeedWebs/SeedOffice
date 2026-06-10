import { describe, expect, it } from 'vitest'
import { addDaysISO, cycleOf } from './cycle'

describe('cycleOf — งวดเงินเดือน 25→24 จ่าย 26 (รับ calendar date เข้า ไม่มี Date.now)', () => {
  it('กลางงวด: 10 มิ.ย. อยู่งวด 25 พ.ค.–24 มิ.ย. จ่าย 26 มิ.ย.', () => {
    expect(cycleOf('2026-06-10', 25)).toEqual({
      start: '2026-05-25',
      end: '2026-06-24',
      payDate: '2026-06-26',
    })
  })
  it('ขอบงวด: ≤24 = งวดนี้ · ≥25 = งวดถัดไป (SPEC §13)', () => {
    expect(cycleOf('2026-06-24', 25).end).toBe('2026-06-24')
    expect(cycleOf('2026-06-25', 25)).toEqual({
      start: '2026-06-25',
      end: '2026-07-24',
      payDate: '2026-07-26',
    })
    expect(cycleOf('2026-06-26', 25).start).toBe('2026-06-25')
  })
  it('ข้ามปี: 26 ธ.ค. → งวด 25 ธ.ค.–24 ม.ค. ปีถัดไป · ต้นปี: 10 ม.ค. → งวดเริ่ม 25 ธ.ค. ปีก่อน', () => {
    expect(cycleOf('2026-12-26', 25)).toEqual({
      start: '2026-12-25',
      end: '2027-01-24',
      payDate: '2027-01-26',
    })
    expect(cycleOf('2026-01-10', 25)).toEqual({
      start: '2025-12-25',
      end: '2026-01-24',
      payDate: '2026-01-26',
    })
  })
  it('เดือนสั้น (ก.พ.) ไม่มีปัญหา เพราะ cutoff จำกัด 1–28', () => {
    expect(cycleOf('2026-02-10', 25)).toEqual({
      start: '2026-01-25',
      end: '2026-02-24',
      payDate: '2026-02-26',
    })
    expect(cycleOf('2028-02-29', 25).start).toBe('2028-02-25') // leap year
  })
  it('cutoff อื่น (config ได้): cutoff=1 → งวด = เดือนปฏิทินพอดี', () => {
    expect(cycleOf('2026-06-10', 1)).toEqual({
      start: '2026-06-01',
      end: '2026-06-30',
      payDate: '2026-07-02',
    })
  })
  it('cutoff นอกช่วง 1–28 หรือวันที่ผิดรูป = โยน', () => {
    expect(() => cycleOf('2026-06-10', 29)).toThrow(RangeError)
    expect(() => cycleOf('2026-06-10', 0)).toThrow(RangeError)
    expect(() => cycleOf('10/06/2026', 25)).toThrow(TypeError)
  })
})

describe('addDaysISO', () => {
  it('บวก/ลบวันข้ามเดือน-ปีถูกต้อง', () => {
    expect(addDaysISO('2026-06-30', 1)).toBe('2026-07-01')
    expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29')
  })
})
