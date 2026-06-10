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
})

describe('T14 — milestones + payments', () => {
  it('เพิ่มงวดจ่าย + ติ๊กรับเงิน → %จ่ายคำนวณถูก + โผล่บน projects list', async () => {
    const m = await loginAs(app, 'owner@example-co.test')
    const p = (await (await app.request('/api/projects', json(m, { name: 'Pay P', type: 'project', quotedSatang: 20_000_000 }), env)).json()) as { id: string }

    await app.request(`/api/projects/${p.id}/payments`, json(m, { label: 'งวด 1 · มัดจำ', amountSatang: 10_000_000, dueDate: '2026-06-01' }), env)
    const pay2 = (await (
      await app.request(`/api/projects/${p.id}/payments`, json(m, { label: 'งวด 2', amountSatang: 10_000_000, dueDate: '2026-08-01' }), env)
    ).json()) as { id: string; installmentNo: number }
    expect(pay2.installmentNo).toBe(2)

    // จ่ายงวดแรก
    const fin0 = (await (await app.request(`/api/projects/${p.id}/finance`, { headers: { cookie: m } }, env)).json()) as { payments: { id: string }[] }
    await app.request(`/api/payments/${fin0.payments[0]?.id}`, { ...json(m, { paidAt: '2026-06-05' }), method: 'PATCH' }, env)

    const fin = (await (await app.request(`/api/projects/${p.id}/finance`, { headers: { cookie: m } }, env)).json()) as { paidPct: number; paidSatang: number }
    expect(fin).toMatchObject({ paidPct: 50, paidSatang: 10_000_000 })

    const list = (await (await app.request('/api/projects', { headers: { cookie: m } }, env)).json()) as { id: string; paidPct: number | null }[]
    expect(list.find((x) => x.id === p.id)?.paidPct).toBe(50)
  })

  it('vendor: finance ทุก endpoint = 403 + ไม่เห็น paidPct ใน list', async () => {
    const m = await loginAs(app, 'owner@example-co.test')
    const p = (await (await app.request('/api/projects', json(m, { name: 'Sec P', type: 'project' }), env)).json()) as { id: string }
    await app.request(`/api/projects/${p.id}/payments`, json(m, { amountSatang: 5_000_000 }), env)

    const v = await loginAs(app, 'somchai@example.com')
    expect((await app.request(`/api/projects/${p.id}/finance`, { headers: { cookie: v } }, env)).status).toBe(403)
    expect((await app.request(`/api/projects/${p.id}/payments`, json(v, { amountSatang: 1 }), env)).status).toBe(403)
    expect((await app.request(`/api/projects/${p.id}/milestones`, json(v, { name: 'x' }), env)).status).toBe(403)

    const list = (await (await app.request('/api/projects', { headers: { cookie: v } }, env)).json()) as Record<string, unknown>[]
    for (const row of list) expect('paidPct' in row).toBe(false)
  })

  it('milestones: เพิ่ม + เปลี่ยนสถานะ + งบต่องวด (→ P&L T17) + audit การเงิน', async () => {
    const m = await loginAs(app, 'pond@example-co.test')
    const p = (await (await app.request('/api/projects', json(m, { name: 'MS P', type: 'project' }), env)).json()) as { id: string }
    const ms = (await (
      await app.request(`/api/projects/${p.id}/milestones`, json(m, { name: 'งวด 1 · ออกแบบ', budgetSatang: 6_000_000, dueDate: '2026-07-01' }), env)
    ).json()) as { id: string; status: string }
    expect(ms.status).toBe('planned')

    await app.request(`/api/milestones/${ms.id}`, { ...json(m, { status: 'active' }), method: 'PATCH' }, env)
    const fin = (await (await app.request(`/api/projects/${p.id}/finance`, { headers: { cookie: m } }, env)).json()) as { milestones: { status: string; budgetSatang: number }[] }
    expect(fin.milestones[0]).toMatchObject({ status: 'active', budgetSatang: 6_000_000 })

    const audits = await env.DB.prepare("SELECT action FROM audit_logs WHERE action LIKE 'milestone%'").all()
    expect(audits.results.length).toBeGreaterThanOrEqual(2)
  })
})
