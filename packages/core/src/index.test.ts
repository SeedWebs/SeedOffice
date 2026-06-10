import { describe, expect, it } from 'vitest'
import { formatHMS, formatSatang, minutesToHoursLabel } from './index'

describe('formatSatang', () => {
  it('จำนวนเต็มบาท ไม่แสดงทศนิยม (ตาม mockup)', () => {
    expect(formatSatang(3_840_000)).toBe('฿38,400')
    expect(formatSatang(0)).toBe('฿0')
  })
  it('มีเศษสตางค์ แสดง 2 ตำแหน่งเสมอ', () => {
    expect(formatSatang(123_456)).toBe('฿1,234.56')
    expect(formatSatang(105)).toBe('฿1.05')
  })
  it('ค่าติดลบ (รายการหัก)', () => {
    expect(formatSatang(-75_000)).toBe('-฿750')
    expect(formatSatang(-105)).toBe('-฿1.05')
  })
  it('ปฏิเสธค่าที่ไม่ใช่ integer — กัน float หลุดเข้าระบบเงิน', () => {
    expect(() => formatSatang(1.5)).toThrow(TypeError)
    expect(() => formatSatang(NaN)).toThrow(TypeError)
  })
})

describe('minutesToHoursLabel', () => {
  it('แปลงนาทีเป็นชั่วโมงทศนิยม 1 ตำแหน่ง (ตาม mockup)', () => {
    expect(minutesToHoursLabel(5760)).toBe('96.0')
    expect(minutesToHoursLabel(5310)).toBe('88.5')
    expect(minutesToHoursLabel(0)).toBe('0.0')
  })
  it('ปัดครึ่งขึ้นที่ตำแหน่งทศนิยม', () => {
    expect(minutesToHoursLabel(57)).toBe('1.0') // 0.95 ชม. → 1.0
    expect(minutesToHoursLabel(33)).toBe('0.6') // 0.55 ชม. → 0.6
  })
  it('ปฏิเสธนาทีที่ไม่ใช่ integer', () => {
    expect(() => minutesToHoursLabel(1.5)).toThrow(TypeError)
  })
})

describe('formatHMS — H:MM:SS ชั่วโมงหลักเดียว (SPEC §4.5)', () => {
  it('ตรงตัวอย่าง mockup (3:42:18)', () => {
    expect(formatHMS(3 * 3600 + 42 * 60 + 18)).toBe('3:42:18')
    expect(formatHMS(0)).toBe('0:00:00')
    expect(formatHMS(59)).toBe('0:00:59')
    expect(formatHMS(3600)).toBe('1:00:00')
  })
  it('ปฏิเสธค่าลบ/ไม่ integer', () => {
    expect(() => formatHMS(-1)).toThrow(TypeError)
    expect(() => formatHMS(1.5)).toThrow(TypeError)
  })
})
