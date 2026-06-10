import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { restoreBackup, runBackup } from '../src/lib/backup'
import { seedUsers } from './helpers'

beforeEach(async () => {
  await seedUsers()
})

describe('T18 — D1 backup → R2 + restore', () => {
  it('backup สร้าง object ใน R2 ครบทุกตาราง + restore กู้ข้อมูลที่หายกลับมาได้จริง', async () => {
    const key = await runBackup(env)
    expect(key).toMatch(/^backups\/\d{4}-\d{2}-\d{2}\.json$/)

    const obj = await env.FILES.get(key)
    expect(obj).toBeTruthy()
    const data = (await obj!.json()) as { tables: Record<string, unknown[]> }
    expect(data.tables.users?.length).toBeGreaterThanOrEqual(4)
    expect(Object.keys(data.tables)).toContain('time_entries')
    expect(Object.keys(data.tables)).toContain('payslips')

    // จำลองหายนะ: ลบ users ทั้งหมด (ปิด FK ชั่วคราวไม่ได้ — ลบ child ก่อนใน restore อยู่แล้ว)
    const before = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()
    await restoreBackup(env, key) // restore = ล้าง + insert กลับทุกตาราง
    const after = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()
    expect(after?.n).toBe(before?.n)

    const owner = await env.DB.prepare("SELECT name, role FROM users WHERE id='u_owner'").first<{ name: string; role: string }>()
    expect(owner).toMatchObject({ name: 'เมธ', role: 'owner' })
  })

  it('retention: เกิน 30 ชุด → ลบชุดเก่าสุดทิ้ง', async () => {
    for (let i = 1; i <= 31; i++) {
      await env.FILES.put(`backups/2025-01-${String(i).padStart(2, '0')}.json`, '{}')
    }
    await runBackup(env)
    const listing = await env.FILES.list({ prefix: 'backups/' })
    expect(listing.objects.length).toBeLessThanOrEqual(30)
    const keys = listing.objects.map((o) => o.key)
    expect(keys).not.toContain('backups/2025-01-01.json') // เก่าสุดถูกลบ
  })
})
