import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROJECT_STATUSES,
  defaultStatusId,
  isArchivedStatus,
  resolveStatuses,
  statusById,
  validateStatuses,
  type ProjectStatus,
} from './project-status'

describe('resolveStatuses — null = default · เรียงตาม sortOrder', () => {
  it('null/ว่าง → default 6 ตัว', () => {
    expect(resolveStatuses(null)).toHaveLength(6)
    expect(resolveStatuses([])).toHaveLength(6)
    expect(resolveStatuses(undefined).map((s) => s.id)).toEqual(['design', 'dev', 'staging', 'golive', 'ma', 'archived'])
  })
  it('เรียงตาม sortOrder', () => {
    const raw: ProjectStatus[] = [
      { id: 'b', name: 'B', color: 'sky', kind: 'active', sortOrder: 1 },
      { id: 'a', name: 'A', color: 'rose', kind: 'active', sortOrder: 0 },
    ]
    expect(resolveStatuses(raw).map((s) => s.id)).toEqual(['a', 'b'])
  })
})

describe('default / archived / lookup', () => {
  it('defaultStatusId = active ตัวแรกตามลำดับ', () => {
    expect(defaultStatusId(null)).toBe('design')
    expect(defaultStatusId([
      { id: 'done', name: 'Done', color: 'slate', kind: 'archived', sortOrder: 0 },
      { id: 'wip', name: 'WIP', color: 'amber', kind: 'active', sortOrder: 1 },
    ])).toBe('wip')
  })
  it('isArchivedStatus จาก kind (ไม่ใช่ชื่อ slug ตายตัว)', () => {
    expect(isArchivedStatus(null, 'archived')).toBe(true)
    expect(isArchivedStatus(null, 'dev')).toBe(false)
    // slug ชื่ออื่นแต่ kind=archived ก็ถือว่า archived
    expect(isArchivedStatus([{ id: 'closed', name: 'ปิดงาน', color: 'slate', kind: 'archived', sortOrder: 0 }], 'closed')).toBe(true)
  })
  it('statusById คืน undefined ถ้าไม่เจอ', () => {
    expect(statusById(null, 'design')?.name).toBe('Design')
    expect(statusById(null, 'ghost')).toBeUndefined()
  })
})

describe('validateStatuses', () => {
  const base: ProjectStatus = { id: 'a', name: 'A', color: 'sky', kind: 'active', sortOrder: 0 }
  it('default ผ่าน', () => {
    expect(validateStatuses(DEFAULT_PROJECT_STATUSES)).toEqual({ ok: true })
  })
  it('ลิสต์ว่าง / ไม่มี active = error', () => {
    expect(validateStatuses([]).ok).toBe(false)
    expect(validateStatuses([{ ...base, kind: 'archived' }]).ok).toBe(false)
  })
  it('id ซ้ำ / id เพี้ยน / สีเพี้ยน / ชื่อว่าง = error', () => {
    expect(validateStatuses([base, { ...base }]).ok).toBe(false) // id ซ้ำ
    expect(validateStatuses([{ ...base, id: 'Bad Id' }]).ok).toBe(false)
    expect(validateStatuses([{ ...base, color: 'fuchsia' }]).ok).toBe(false) // สีนอกชุด (runtime)
    expect(validateStatuses([{ ...base, name: '' }]).ok).toBe(false)
  })
})
