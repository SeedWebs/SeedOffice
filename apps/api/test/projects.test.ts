import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../src/index'
import { loginAs, seedUsers } from './helpers'

beforeEach(async () => {
  await seedUsers()
})

async function createProject(cookie: string, body: Record<string, unknown>) {
  return app.request(
    '/api/projects',
    { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) },
    env,
  )
}

describe('T08 — projects + clients', () => {
  it('member สร้างโปรเจกต์ + ลูกค้าใหม่จากชื่อ → client ถูกสร้างและผูกให้', async () => {
    const member = await loginAs(app, 'pond@example-co.test')
    const res = await createProject(member, {
      name: 'เว็บทดสอบ',
      logo: '🧪',
      type: 'project',
      clientName: 'ลูกค้าทดสอบ จำกัด',
      quotedSatang: 10_000_000,
      startDate: '2026-06-01',
      dueDate: '2026-09-30',
    })
    expect(res.status).toBe(201)
    const p = (await res.json()) as { id: string; clientId: string | null; quotedSatang: number }
    expect(p.clientId).toBeTruthy()
    expect(p.quotedSatang).toBe(10_000_000)

    const clientsRes = await app.request('/api/clients', { headers: { cookie: member } }, env)
    const list = (await clientsRes.json()) as { rows: { name: string }[] }
    expect(list.rows.some((cl) => cl.name === 'ลูกค้าทดสอบ จำกัด')).toBe(true)
  })

  it('vendor: ดูลิสต์ได้ แต่ quotedSatang ถูกตัดออกที่ server · สร้าง/แก้ = 403 · /api/clients = 403', async () => {
    const member = await loginAs(app, 'pond@example-co.test')
    await createProject(member, { name: 'งานเงินลับ', type: 'project', quotedSatang: 55_500_000 })

    const vendor = await loginAs(app, 'somchai@example.com')
    const res = await app.request('/api/projects', { headers: { cookie: vendor } }, env)
    expect(res.status).toBe(200)
    const rows = (await res.json()) as Record<string, unknown>[]
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect('quotedSatang' in row).toBe(false)
    expect(JSON.stringify(rows)).not.toContain('55500000')

    expect((await createProject(vendor, { name: 'x', type: 'project' })).status).toBe(403)
    expect((await app.request('/api/clients', { headers: { cookie: vendor } }, env)).status).toBe(403)
  })

  it('recurring: บังคับ billing recurring + default ma + period · patch เปลี่ยนงบมี audit', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const res = await createProject(owner, { name: 'MA รายเดือน', type: 'recurring' })
    const p = (await res.json()) as { id: string; billingType: string; status: string; recurringPeriod: string }
    expect(p).toMatchObject({ billingType: 'recurring', status: 'ma', recurringPeriod: 'monthly' })

    const patched = await app.request(
      `/api/projects/${p.id}`,
      {
        method: 'PATCH',
        headers: { cookie: owner, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      },
      env,
    )
    expect(patched.status).toBe(200)
    const detail = await app.request(`/api/projects/${p.id}`, { headers: { cookie: owner } }, env)
    expect(((await detail.json()) as { status: string }).status).toBe('archived')
  })
})
