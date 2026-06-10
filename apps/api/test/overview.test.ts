import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import app from '../src/index'
import { loginAs, seedUsers } from './helpers'

beforeEach(async () => {
  await seedUsers()
})

const json = (cookie: string, body: unknown) => ({
  method: 'POST',
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

describe('T11 — stars + overview', () => {
  it('ติดดาว → ขึ้น "งานวันนี้" เฉพาะของคนติด · ถอนดาว → หาย', async () => {
    const m = await loginAs(app, 'pond@seedwebs.com')
    const p = (await (await app.request('/api/projects', json(m, { name: 'P', type: 'project' }), env)).json()) as { id: string }
    const g = (await (await app.request(`/api/projects/${p.id}/groups`, json(m, { name: 'G' }), env)).json()) as { id: string }
    const t = (await (await app.request(`/api/groups/${g.id}/tasks`, json(m, { title: 'งานดาว' }), env)).json()) as { id: string }

    await app.request(`/api/tasks/${t.id}/star`, json(m, { on: true }), env)
    let ov = (await (await app.request('/api/overview', { headers: { cookie: m } }, env)).json()) as { today: { title: string }[] }
    expect(ov.today.map((x) => x.title)).toContain('งานดาว')

    // คนอื่นไม่เห็นดาวของเรา
    const o = await loginAs(app, 'owner@seedwebs.com')
    const ovOwner = (await (await app.request('/api/overview', { headers: { cookie: o } }, env)).json()) as { today: unknown[] }
    expect(ovOwner.today).toHaveLength(0)

    await app.request(`/api/tasks/${t.id}/star`, json(m, { on: false }), env)
    ov = (await (await app.request('/api/overview', { headers: { cookie: m } }, env)).json()) as { today: { title: string }[] }
    expect(ov.today).toHaveLength(0)
  })

  it('งานเร็วๆ นี้: เฉพาะที่มอบหมายให้ฉัน ยังไม่เสร็จ เรียงตาม due ≤5 รายการ', async () => {
    const m = await loginAs(app, 'pond@seedwebs.com')
    const p = (await (await app.request('/api/projects', json(m, { name: 'P', type: 'project' }), env)).json()) as { id: string }
    const g = (await (await app.request(`/api/projects/${p.id}/groups`, json(m, { name: 'G' }), env)).json()) as { id: string }
    for (let i = 1; i <= 7; i++) {
      await app.request(
        `/api/groups/${g.id}/tasks`,
        json(m, { title: `งาน ${i}`, assigneeId: 'u_pond', dueDate: `2026-07-0${i}` }),
        env,
      )
    }
    const ov = (await (await app.request('/api/overview', { headers: { cookie: m } }, env)).json()) as { upcoming: { title: string }[] }
    expect(ov.upcoming).toHaveLength(5)
    expect(ov.upcoming[0]?.title).toBe('งาน 1')
  })

  it('board ส่ง starredToday ของฉันมาด้วย', async () => {
    const m = await loginAs(app, 'pond@seedwebs.com')
    const p = (await (await app.request('/api/projects', json(m, { name: 'P', type: 'project' }), env)).json()) as { id: string }
    const g = (await (await app.request(`/api/projects/${p.id}/groups`, json(m, { name: 'G' }), env)).json()) as { id: string }
    const t = (await (await app.request(`/api/groups/${g.id}/tasks`, json(m, { title: 'ดาวบนบอร์ด' }), env)).json()) as { id: string }
    await app.request(`/api/tasks/${t.id}/star`, json(m, { on: true }), env)
    const board = (await (
      await app.request(`/api/projects/${p.id}/board`, { headers: { cookie: m } }, env)
    ).json()) as { groups: { tasks: { starredToday: boolean }[] }[] }
    expect(board.groups[0]?.tasks[0]?.starredToday).toBe(true)
  })
})
