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
    "INSERT OR REPLACE INTO rates (id, user_id, rate_satang_per_hour, effective_from, created_at) VALUES ('r_pond','u_pond',40000,'2026-01-01',0)",
  ).run()
  await env.DB.prepare(
    'INSERT OR REPLACE INTO company_config (id, cutoff_day, work_hour_cap_minutes) VALUES (1, 25, 480)',
  ).run()
  await env.DB.prepare('DELETE FROM time_entries').run()
})

describe('T13 — team-hours + manual% integrity', () => {
  it('manual% นิยามทั้งงวด + flag เกิน 10% + นับครั้งแก้', async () => {
    const m = await loginAs(app, 'pond@seedwebs.com')
    const p = (await (await app.request('/api/projects', json(m, { name: 'P', type: 'project' }), env)).json()) as { id: string }
    const g = (await (await app.request(`/api/projects/${p.id}/groups`, json(m, { name: 'G' }), env)).json()) as { id: string }
    const t = (await (await app.request(`/api/groups/${g.id}/tasks`, json(m, { title: 'X' }), env)).json()) as { id: string }

    // ในงวดของ 10 มิ.ย. (25 พ.ค.–24 มิ.ย.): timer 82% / manual 18% (เหมือนตูนใน mockup)
    await env.DB.prepare(
      "INSERT INTO time_entries (id, user_id, task_id, project_id, work_date, minutes, rate_snapshot_satang, source, edit_count, created_at) VALUES ('te1','u_pond',?1,?2,'2026-06-01',820,40000,'timer',0,0)",
    ).bind(t.id, p.id).run()
    const manual = (await (
      await app.request(`/api/tasks/${t.id}/time`, json(m, { workDate: '2026-06-02', minutes: 180 }), env)
    ).json()) as { id: string }
    await app.request(`/api/time/${manual.id}`, { ...json(m, { minutes: 180, note: 'แก้โน้ต' }), method: 'PATCH' }, env)

    const res = (await (
      await app.request('/api/team-hours?date=2026-06-10', { headers: { cookie: m } }, env)
    ).json()) as { cycle: { start: string; end: string }; rows: { userId: string; totalMinutes: number; manualRatio: number; flagged: boolean; editCount: number }[] }

    expect(res.cycle).toMatchObject({ start: '2026-05-25', end: '2026-06-24' })
    const pond = res.rows.find((r) => r.userId === 'u_pond')
    expect(pond?.totalMinutes).toBe(1000)
    expect(pond?.manualRatio).toBeCloseTo(0.18)
    expect(pond?.flagged).toBe(true)
    expect(pond?.editCount).toBe(1)
  })

  it('vendor เปิด team-hours ไม่ได้ (403) · เวลานอกงวดไม่ถูกนับ', async () => {
    const v = await loginAs(app, 'somchai@example.com')
    expect((await app.request('/api/team-hours', { headers: { cookie: v } }, env)).status).toBe(403)

    const m = await loginAs(app, 'pond@seedwebs.com')
    const p = (await (await app.request('/api/projects', json(m, { name: 'P2', type: 'project' }), env)).json()) as { id: string }
    const g = (await (await app.request(`/api/projects/${p.id}/groups`, json(m, { name: 'G' }), env)).json()) as { id: string }
    const t = (await (await app.request(`/api/groups/${g.id}/tasks`, json(m, { title: 'Y' }), env)).json()) as { id: string }
    // 24 พ.ค. = งวดก่อน (งวดนี้เริ่ม 25 พ.ค.)
    await app.request(`/api/tasks/${t.id}/time`, json(m, { workDate: '2026-05-24', minutes: 600 }), env)
    const res = (await (
      await app.request('/api/team-hours?date=2026-06-10', { headers: { cookie: m } }, env)
    ).json()) as { rows: { userId: string; totalMinutes: number }[] }
    expect(res.rows.find((r) => r.userId === 'u_pond')?.totalMinutes).toBe(0)
  })
})
