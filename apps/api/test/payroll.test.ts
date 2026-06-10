import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../src/index'
import { loginAs, seedUsers } from './helpers'

const json = (cookie: string, body: unknown) => ({
  method: 'POST',
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

beforeEach(async () => {
  await seedUsers()
  await env.DB.prepare(
    "INSERT OR REPLACE INTO rates (id, user_id, rate_satang_per_hour, effective_from, created_at) VALUES ('r_pond','u_pond',40000,'2026-01-01',0), ('r_som','u_somchai',35000,'2026-01-01',0)",
  ).run()
  await env.DB.prepare(
    'INSERT OR REPLACE INTO company_config (id, cutoff_day, work_hour_cap_minutes) VALUES (1, 25, 480)',
  ).run()
  await env.DB.prepare('DELETE FROM time_entries').run()
  await env.DB.prepare('DELETE FROM pay_adjustments').run()
  await env.DB.prepare('DELETE FROM pay_notes').run()
})

/** สร้าง project/task แล้วใส่ entries ตรงผ่าน SQL (snapshot rate กำหนดเอง) — รวม minutes ตามต้องการ */
async function seedEntries(cookie: string, userId: string, rate: number, perDay: { workDate: string; minutes: number }[]) {
  const p = (await (await app.request('/api/projects', json(cookie, { name: `P-${userId}-${perDay.length}`, type: 'project' }), env)).json()) as { id: string }
  const g = (await (await app.request(`/api/projects/${p.id}/groups`, json(cookie, { name: 'G' }), env)).json()) as { id: string }
  const t = (await (await app.request(`/api/groups/${g.id}/tasks`, json(cookie, { title: 'งาน' }), env)).json()) as { id: string }
  for (const [i, d] of perDay.entries()) {
    await env.DB.prepare(
      `INSERT INTO time_entries (id, user_id, task_id, project_id, work_date, minutes, rate_snapshot_satang, source, edit_count, created_at) VALUES ('te_${userId}_${i}_${d.workDate}','${userId}','${t.id}','${p.id}','${d.workDate}',${d.minutes},${rate},'timer',0,0)`,
    ).run()
  }
  return { p, t }
}
const days = (total: number, startDay: number): { workDate: string; minutes: number }[] => {
  const out: { workDate: string; minutes: number }[] = []
  let left = total
  let day = startDay
  while (left > 0) {
    const m = Math.min(480, left)
    out.push({ workDate: `2026-06-${String(day).padStart(2, '0')}`, minutes: m })
    left -= m
    day++
  }
  return out
}

describe('T15 — payroll self view', () => {
  it('base/net ตรง core: ปอนด์ 96 ชม. ×฿400 + adjustments จาก mockup = สุทธิ ฿42,950', async () => {
    const m = await loginAs(app, 'pond@seedwebs.com')
    await seedEntries(m, 'u_pond', 40000, days(5760, 1)) // 96 ชม. (12 วัน × 8) ในงวด 25 พ.ค.–24 มิ.ย.

    // owner ใส่ adjustments เหมือน mockup (ผ่าน SQL — endpoint owner มาใน T16)
    const adj = (kind: string, amt: number) =>
      env.DB.prepare(
        `INSERT INTO pay_adjustments (id, user_id, cycle_start, kind, amount_satang, created_by, created_at) VALUES ('a_${kind}','u_pond','2026-05-25','${kind}',${amt},'u_owner',0)`,
      ).run()
    await adj('allowance', 150_000)
    await adj('depreciation', 200_000)
    await adj('bonus', 300_000)
    await adj('sso', 75_000)
    await adj('wht', 120_000)
    await env.DB.prepare(
      "INSERT INTO pay_notes (id, user_id, cycle_start, body, updated_by, updated_at) VALUES ('n1','u_pond','2026-05-25','เดือนนี้ทำได้ดีมาก 🙌','u_owner',0)",
    ).run()

    const res = (await (
      await app.request('/api/payroll/me?date=2026-06-10', { headers: { cookie: m } }, env)
    ).json()) as Record<string, unknown>
    expect(res).toMatchObject({
      minutesTotal: 5760,
      baseSatang: 3_840_000,
      incomeSatang: 4_490_000,
      deductionSatang: 195_000,
      netSatang: 4_295_000,
      ownerNote: 'เดือนนี้ทำได้ดีมาก 🙌',
    })
    expect((res.cycle as { start: string }).start).toBe('2026-05-25')
  })

  it('vendor เห็นค่าจ้างตัวเอง (หัก ณ ที่จ่าย) · เห็นเฉพาะของตัวเอง', async () => {
    const v = await loginAs(app, 'somchai@example.com')
    const m = await loginAs(app, 'pond@seedwebs.com')
    // โปรเจกต์สร้างโดย member · entries เป็นของ vendor
    const { t } = await seedEntries(m, 'u_somchai', 35000, days(2400, 1)) // 40 ชม. (5 วัน × 8)
    await env.DB.prepare(
      "INSERT INTO pay_adjustments (id, user_id, cycle_start, kind, amount_satang, created_by, created_at) VALUES ('a_v_wht','u_somchai','2026-05-25','wht',42000,'u_owner',0)",
    ).run()

    const res = (await (
      await app.request('/api/payroll/me?date=2026-06-10', { headers: { cookie: v } }, env)
    ).json()) as { baseSatang: number; netSatang: number; byProject: unknown[] }
    expect(res.baseSatang).toBe(1_400_000) // 40 × ฿350
    expect(res.netSatang).toBe(1_358_000) // − 3%

    // ของปอนด์ต้องไม่ปนมา (member อีกคนลงเวลาด้วย)
    await app.request(`/api/tasks/${t.id}/time`, json(m, { workDate: '2026-06-01', minutes: 60 }), env)
    const again = (await (
      await app.request('/api/payroll/me?date=2026-06-10', { headers: { cookie: v } }, env)
    ).json()) as { minutesTotal: number }
    expect(again.minutesTotal).toBe(2400)
  })

  it('ไม่มีเส้นทางดูค่าตอบแทนของคนอื่น (มีแค่ /payroll/me — owner overview เป็น T16 ownerOnly)', async () => {
    const m = await loginAs(app, 'pond@seedwebs.com')
    expect((await app.request('/api/payroll/u_nam', { headers: { cookie: m } }, env)).status).toBe(404)
  })
})
