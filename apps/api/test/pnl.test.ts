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
  await env.DB.prepare('DELETE FROM time_entries').run()
})

async function setup(cookie: string) {
  const p = (await (
    await app.request('/api/projects', json(cookie, { name: 'PnL P', type: 'project', quotedSatang: 18_000_000 }), env)
  ).json()) as { id: string }
  const g = (await (await app.request(`/api/projects/${p.id}/groups`, json(cookie, { name: 'G' }), env)).json()) as { id: string }
  const t = (await (
    await app.request(`/api/groups/${g.id}/tasks`, json(cookie, { title: 'งาน', estimateMinutes: 21000 }), env)
  ).json()) as { id: string }
  // ปอนด์ 96 ชม. ×฿400 = ฿38,400 · สมชาย 40 ชม. ×฿350 = ฿14,000 → cost ฿52,400
  await env.DB.prepare(
    `INSERT INTO time_entries (id, user_id, task_id, project_id, work_date, minutes, rate_snapshot_satang, source, edit_count, created_at) VALUES
     ('pe1','u_pond','${t.id}','${p.id}','2026-06-01',5760,40000,'timer',0,0),
     ('pe2','u_somchai','${t.id}','${p.id}','2026-06-02',2400,35000,'timer',0,0)`,
  ).run()
  return p
}

describe('T17 — project P&L', () => {
  it('cost/profit/margin ตรง core + breakdown รายคนเป็นชั่วโมง (ไม่มีเงินรายคน)', async () => {
    const m = await loginAs(app, 'pond@example-co.test')
    const p = await setup(m)
    const res = (await (
      await app.request(`/api/projects/${p.id}/pnl`, { headers: { cookie: m } }, env)
    ).json()) as Record<string, unknown>
    expect(res).toMatchObject({
      quotedSatang: 18_000_000,
      costSatang: 5_240_000,
      profitSatang: 12_760_000,
      minutesTotal: 8160,
      estimateMinutes: 21000,
    })
    expect(res.margin).toBeCloseTo(0.7089, 3)
    const byUser = res.byUser as Record<string, unknown>[]
    expect(byUser).toHaveLength(2)
    for (const u of byUser) {
      expect(u).toHaveProperty('minutes')
      expect(JSON.stringify(u)).not.toContain('rate')
      expect(JSON.stringify(u)).not.toContain('Satang')
    }
  })

  it('health: ไม่มี milestone → เทียบ quoted (29% = เขียว) · งวด active ใช้เกิน → แดง + จุดสีโผล่ใน list', async () => {
    const m = await loginAs(app, 'pond@example-co.test')
    const p = await setup(m)
    let pnl = (await (
      await app.request(`/api/projects/${p.id}/pnl`, { headers: { cookie: m } }, env)
    ).json()) as { health: string; usagePct: number }
    expect(pnl).toMatchObject({ health: 'green', usagePct: 29 })

    // งวด active งบ ฿30,000 — cost 52,400 เกิน → แดง
    await app.request(`/api/projects/${p.id}/milestones`, json(m, { name: 'งวด 1', budgetSatang: 3_000_000 }), env)
    const fin = (await (await app.request(`/api/projects/${p.id}/finance`, { headers: { cookie: m } }, env)).json()) as { milestones: { id: string }[] }
    await app.request(`/api/milestones/${fin.milestones[0]?.id}`, { ...json(m, { status: 'active' }), method: 'PATCH' }, env)

    pnl = (await (await app.request(`/api/projects/${p.id}/pnl`, { headers: { cookie: m } }, env)).json()) as typeof pnl
    expect(pnl.health).toBe('red')

    const list = (await (await app.request('/api/projects', { headers: { cookie: m } }, env)).json()) as { id: string; health: string | null }[]
    expect(list.find((x) => x.id === p.id)?.health).toBe('red')
  })

  it('vendor: pnl = 403 · list ไม่มี health/usagePct', async () => {
    const m = await loginAs(app, 'pond@example-co.test')
    const p = await setup(m)
    const v = await loginAs(app, 'somchai@example.com')
    expect((await app.request(`/api/projects/${p.id}/pnl`, { headers: { cookie: v } }, env)).status).toBe(403)
    const list = (await (await app.request('/api/projects', { headers: { cookie: v } }, env)).json()) as Record<string, unknown>[]
    for (const row of list) {
      expect('health' in row).toBe(false)
      expect('usagePct' in row).toBe(false)
    }
  })
})
