/**
 * ไอคอนโปรเจกต์ (SPEC §4.3) — เก็บใน text คอลัมน์เดียว (`projects.logo`) แยกชนิดด้วย prefix
 * - `lucide:<name>` = ไอคอนจากชุด lucide (name = kebab-case)
 * - `upload:<r2key>` = โลโก้ลูกค้าที่อัปโหลด (ตั้งผ่าน endpoint อัปโหลดเท่านั้น ไม่ผ่าน PATCH)
 * - ค่าอื่น (ไม่มี prefix) = emoji เดิม (ของเก่า/seed) ยังแสดงได้
 * - null/ว่าง = ยังไม่ตั้งไอคอน
 * pure ล้วน — ใช้ได้ทั้งฝั่ง API (validate) และ web (render)
 */

export type ProjectLogo =
  | { kind: 'none' }
  | { kind: 'emoji'; value: string }
  | { kind: 'lucide'; name: string }
  | { kind: 'upload'; key: string }

export const LUCIDE_PREFIX = 'lucide:'
export const UPLOAD_PREFIX = 'upload:'

/** ชื่อไอคอน lucide ที่ยอมรับ — kebab-case (ตัวพิมพ์เล็ก/ตัวเลข คั่นด้วยขีดเดียว) */
const LUCIDE_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidLucideName(name: string): boolean {
  return LUCIDE_NAME_RE.test(name)
}

export function parseProjectLogo(logo: string | null | undefined): ProjectLogo {
  if (!logo) return { kind: 'none' }
  if (logo.startsWith(LUCIDE_PREFIX)) {
    const name = logo.slice(LUCIDE_PREFIX.length)
    return isValidLucideName(name) ? { kind: 'lucide', name } : { kind: 'none' }
  }
  if (logo.startsWith(UPLOAD_PREFIX)) {
    const key = logo.slice(UPLOAD_PREFIX.length)
    return key ? { kind: 'upload', key } : { kind: 'none' }
  }
  return { kind: 'emoji', value: logo }
}

export const lucideLogo = (name: string): string => `${LUCIDE_PREFIX}${name}`
export const uploadLogo = (key: string): string => `${UPLOAD_PREFIX}${key}`

/**
 * logo ที่ตั้งได้ผ่าน PATCH /api/projects/:id (validate ที่ขอบ API)
 * = ว่าง(เคลียร์) | emoji (≤ 8 ตัว) | lucide:<name>  — ปฏิเสธ upload: (ตั้งผ่าน endpoint อัปโหลด)
 */
export function isPatchableLogo(logo: string): boolean {
  if (logo === '') return true
  if (logo.startsWith(UPLOAD_PREFIX)) return false
  if (logo.startsWith(LUCIDE_PREFIX)) return isValidLucideName(logo.slice(LUCIDE_PREFIX.length))
  return [...logo].length <= 8 // emoji (นับ code point กัน surrogate pair)
}
