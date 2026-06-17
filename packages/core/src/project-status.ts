/**
 * สถานะโปรเจกต์ปรับเองได้ (SPEC §4.3) — เก็บเป็น JSON ใน company_config (ชุดเดียวทั้งบริษัท)
 * แยก "พฤติกรรม" (kind: active|archived — ระบบใช้กรอง) ออกจาก "หน้าตา" (name + color — ทีมแก้เอง)
 * ยังไม่ตั้ง → ใช้ DEFAULT (6 ตัวเดิม) = ของเดิมไม่เปลี่ยน · pure ล้วน ใช้ทั้ง API + web
 */

export type StatusKind = 'active' | 'archived'

export interface ProjectStatus {
  id: string // slug ถาวร (projects.status อ้างค่านี้) — เปลี่ยนชื่อได้ id คงเดิม
  name: string // ป้ายที่แสดง (แก้ได้)
  color: string // คีย์สีจากจานคัดสรร (validate ด้วย STATUS_COLOR_KEYS ตอนบันทึก) · string เพื่อเข้ากับ JSON column
  kind: StatusKind
  sortOrder: number
}

/** จานสีสถานะคัดสรร — map เป็น class จริงฝั่ง web (project-ui.ts STATUS_COLOR_CLASSES) */
export const STATUS_COLOR_KEYS = [
  'slate', 'amber', 'orange', 'yellow', 'emerald', 'teal', 'sky', 'violet', 'rose',
] as const
export type StatusColorKey = (typeof STATUS_COLOR_KEYS)[number]

/** ค่าเริ่มต้น = 6 สถานะเดิม (สี/ชื่อ/ลำดับตรงกับของเดิมเป๊ะ — lossless) */
export const DEFAULT_PROJECT_STATUSES: ProjectStatus[] = [
  { id: 'design', name: 'Design', color: 'amber', kind: 'active', sortOrder: 0 },
  { id: 'dev', name: 'Dev', color: 'orange', kind: 'active', sortOrder: 1 },
  { id: 'staging', name: 'Staging', color: 'yellow', kind: 'active', sortOrder: 2 },
  { id: 'golive', name: 'Go Live', color: 'violet', kind: 'active', sortOrder: 3 },
  { id: 'ma', name: 'MA', color: 'emerald', kind: 'active', sortOrder: 4 },
  { id: 'archived', name: 'archived', color: 'slate', kind: 'archived', sortOrder: 5 },
]

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/

/** config ดิบ (null = ยังไม่ตั้ง) → ลิสต์ที่เรียงตาม sortOrder แล้ว */
export function resolveStatuses(raw: ProjectStatus[] | null | undefined): ProjectStatus[] {
  const list = raw && raw.length > 0 ? raw : DEFAULT_PROJECT_STATUSES
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder)
}

export function statusById(raw: ProjectStatus[] | null | undefined, id: string): ProjectStatus | undefined {
  return resolveStatuses(raw).find((s) => s.id === id)
}

/** สถานะ default ของโปรเจกต์ใหม่ = active ตัวแรกตามลำดับ */
export function defaultStatusId(raw: ProjectStatus[] | null | undefined): string {
  const list = resolveStatuses(raw)
  return (list.find((s) => s.kind === 'active') ?? list[0])?.id ?? 'design'
}

export function isArchivedStatus(raw: ProjectStatus[] | null | undefined, id: string): boolean {
  return statusById(raw, id)?.kind === 'archived'
}

/** ตรวจ config ที่จะบันทึก (CRUD ผ่าน API) — คืน error ภาษาไทยถ้าไม่ผ่าน */
export function validateStatuses(list: ProjectStatus[]): { ok: true } | { ok: false; error: string } {
  if (!Array.isArray(list) || list.length === 0) return { ok: false, error: 'ต้องมีอย่างน้อย 1 สถานะ' }
  const ids = new Set<string>()
  for (const s of list) {
    if (!ID_RE.test(s.id)) return { ok: false, error: `id ไม่ถูกต้อง: ${s.id}` }
    if (ids.has(s.id)) return { ok: false, error: `id ซ้ำ: ${s.id}` }
    ids.add(s.id)
    const name = s.name?.trim() ?? ''
    if (name.length === 0 || name.length > 40) return { ok: false, error: 'ชื่อสถานะต้องยาว 1–40 ตัว' }
    if (!(STATUS_COLOR_KEYS as readonly string[]).includes(s.color)) return { ok: false, error: `สีไม่ถูกต้อง: ${s.color}` }
    if (s.kind !== 'active' && s.kind !== 'archived') return { ok: false, error: 'kind ต้องเป็น active หรือ archived' }
  }
  if (!list.some((s) => s.kind === 'active')) return { ok: false, error: 'ต้องมีสถานะ active อย่างน้อย 1 ตัว' }
  return { ok: true }
}
