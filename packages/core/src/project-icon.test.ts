import { describe, expect, it } from 'vitest'
import {
  isPatchableLogo,
  isValidLucideName,
  lucideLogo,
  parseProjectLogo,
  uploadLogo,
} from './project-icon'

describe('parseProjectLogo — แยกชนิดไอคอนจาก text คอลัมน์เดียว', () => {
  it('null/ว่าง = none', () => {
    expect(parseProjectLogo(null)).toEqual({ kind: 'none' })
    expect(parseProjectLogo(undefined)).toEqual({ kind: 'none' })
    expect(parseProjectLogo('')).toEqual({ kind: 'none' })
  })
  it('lucide:<name> = lucide', () => {
    expect(parseProjectLogo('lucide:building-2')).toEqual({ kind: 'lucide', name: 'building-2' })
    expect(parseProjectLogo('lucide:globe')).toEqual({ kind: 'lucide', name: 'globe' })
  })
  it('lucide ที่ชื่อเพี้ยน (ตัวพิมพ์ใหญ่/อักขระแปลก) = none กันชื่อเดา', () => {
    expect(parseProjectLogo('lucide:Building2')).toEqual({ kind: 'none' })
    expect(parseProjectLogo('lucide:../etc')).toEqual({ kind: 'none' })
    expect(parseProjectLogo('lucide:')).toEqual({ kind: 'none' })
  })
  it('upload:<key> = upload', () => {
    expect(parseProjectLogo('upload:project-logos/abc/123')).toEqual({
      kind: 'upload',
      key: 'project-logos/abc/123',
    })
  })
  it('emoji เดิม (ไม่มี prefix) ยังแสดงได้', () => {
    expect(parseProjectLogo('🏢')).toEqual({ kind: 'emoji', value: '🏢' })
    expect(parseProjectLogo('📁')).toEqual({ kind: 'emoji', value: '📁' })
  })
})

describe('helpers สร้าง/ตรวจค่า logo', () => {
  it('lucideLogo / uploadLogo ประกอบ prefix ถูก', () => {
    expect(lucideLogo('rocket')).toBe('lucide:rocket')
    expect(uploadLogo('project-logos/x/y')).toBe('upload:project-logos/x/y')
  })
  it('isValidLucideName', () => {
    expect(isValidLucideName('building-2')).toBe(true)
    expect(isValidLucideName('globe')).toBe(true)
    expect(isValidLucideName('Building2')).toBe(false)
    expect(isValidLucideName('a--b')).toBe(false)
    expect(isValidLucideName('')).toBe(false)
  })
})

describe('isPatchableLogo — ค่าที่ตั้งผ่าน PATCH ได้', () => {
  it('ยอม: ว่าง(เคลียร์) · emoji สั้น · lucide ชื่อถูก', () => {
    expect(isPatchableLogo('')).toBe(true)
    expect(isPatchableLogo('🏢')).toBe(true)
    expect(isPatchableLogo('lucide:building-2')).toBe(true)
  })
  it('ปฏิเสธ upload: (ตั้งผ่าน endpoint อัปโหลดเท่านั้น)', () => {
    expect(isPatchableLogo('upload:project-logos/x')).toBe(false)
  })
  it('ปฏิเสธ lucide ชื่อเพี้ยน', () => {
    expect(isPatchableLogo('lucide:Building2')).toBe(false)
  })
  it('ปฏิเสธ emoji/ข้อความยาวเกิน 8 code point', () => {
    expect(isPatchableLogo('123456789')).toBe(false)
  })
})
