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
  for (const t of ['client_notes', 'recurring_services', 'payments', 'projects', 'clients'])
    await env.DB.prepare(`DELETE FROM ${t}`).run()
})

async function seedClient(cookie: string) {
  const cl = (await (
    await app.request(
      '/api/clients',
      json(cookie, { name: 'บริษัท เลิร์นโปร', logo: '📚', contactName: 'คุณวิรัตน์', contactEmail: 'finance@learnpro.example' }),
      env,
    )
  ).json()) as { id: string }
  const p = (await (
    await app.request(
      '/api/projects',
      json(cookie, { name: 'ระบบ LMS เลิร์นโปร', type: 'project', clientId: cl.id, quotedSatang: 45_000_000, startDate: '2026-01-05', dueDate: '2026-06-30' }),
      env,
    )
  ).json()) as { id: string }
  // งวดจ่าย: จ่ายแล้ว 2 + overdue 1
  for (const [label, amt, due, paid] of [
    ['งวด 1', 18_000_000, '2026-01-15', '2026-01-15'],
    ['งวด 2', 13_500_000, '2026-04-15', '2026-04-16'],
    ['งวด 3', 13_500_000, '2026-05-27', null],
  ] as const) {
    const created = (await (
      await app.request(`/api/projects/${p.id}/payments`, json(cookie, { label, amountSatang: amt, dueDate: due }), env)
    ).json()) as { id: string }
    if (paid) await app.request(`/api/payments/${created.id}`, { ...json(cookie, { paidAt: paid }), method: 'PATCH' }, env)
  }
  await app.request(
    `/api/clients/${cl.id}/services`,
    json(cookie, { label: 'Hosting + ดูแลระบบ', category: 'hosting', period: 'monthly', amountSatang: 250_000, nextDueDate: '2026-07-01' }),
    env,
  )
  await app.request(
    `/api/clients/${cl.id}/services`,
    json(cookie, { label: 'โดเมน .co.th', category: 'domain', period: 'yearly', amountSatang: 85_600, nextDueDate: '2027-03-15' }),
    env,
  )
  return { cl, p }
}

describe('C2 — clients API', () => {
  it('list: aggregates ตรง core (จ่าย 70% · overdue ฿135k · MRR ฿2,571) + summary การ์ด', async () => {
    const m = await loginAs(app, 'pond@example-co.test')
    await seedClient(m)
    const res = (await (await app.request('/api/clients', { headers: { cookie: m } }, env)).json()) as {
      rows: Record<string, unknown>[]
      summary: Record<string, number>
    }
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0]).toMatchObject({
      name: 'บริษัท เลิร์นโปร',
      quotedSatang: 45_000_000,
      paidSatang: 31_500_000,
      overdueSatang: 13_500_000,
      paidPct: 70,
      mrrSatang: 257_133,
      projectCount: 1,
    })
    expect(res.summary).toMatchObject({
      salesThisYearSatang: 45_000_000,
      overdueSatang: 13_500_000,
      overdueClients: 1,
      arrSatang: 3_085_600,
    })
  })

  it('detail: โปรเจกต์/payments/services/notes ครบ · เพิ่มโน้ตแล้วโผล่', async () => {
    const m = await loginAs(app, 'pond@example-co.test')
    const { cl } = await seedClient(m)
    await app.request(`/api/clients/${cl.id}/notes`, json(m, { body: 'วางบิลทุกวันที่ 7 ของเดือน' }), env)

    const detail = (await (
      await app.request(`/api/clients/${cl.id}`, { headers: { cookie: m } }, env)
    ).json()) as { projects: unknown[]; payments: { paidAt: string | null }[]; services: unknown[]; notes: { body: string; byName: string }[]; money: { overdueSatang: number } }
    expect(detail.projects).toHaveLength(1)
    expect(detail.payments).toHaveLength(3)
    expect(detail.services).toHaveLength(2)
    expect(detail.notes[0]).toMatchObject({ body: 'วางบิลทุกวันที่ 7 ของเดือน', byName: 'ปอนด์' })
    expect(detail.money.overdueSatang).toBe(13_500_000)
  })

  it('แก้บริการ (เลื่อนวันต่อ/ยกเลิก) → audit · vendor 403 ทุกเส้นทาง CRM', async () => {
    const m = await loginAs(app, 'pond@example-co.test')
    const { cl } = await seedClient(m)
    const detail = (await (await app.request(`/api/clients/${cl.id}`, { headers: { cookie: m } }, env)).json()) as { services: { id: string }[] }
    const svc = detail.services[0]!
    const patched = await app.request(`/api/services/${svc.id}`, { ...json(m, { nextDueDate: '2026-08-01' }), method: 'PATCH' }, env)
    expect(patched.status).toBe(200)
    const audits = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action LIKE 'recurring_service%'").first<{ n: number }>()
    expect(audits!.n).toBeGreaterThanOrEqual(3) // create x2 + update

    const v = await loginAs(app, 'somchai@example.com')
    expect((await app.request('/api/clients', { headers: { cookie: v } }, env)).status).toBe(403)
    expect((await app.request(`/api/clients/${cl.id}`, { headers: { cookie: v } }, env)).status).toBe(403)
    expect((await app.request(`/api/services/${svc.id}`, { ...json(v, { amountSatang: 1 }), method: 'PATCH' }, env)).status).toBe(403)
    expect((await app.request(`/api/clients/${cl.id}/notes`, json(v, { body: 'x' }), env)).status).toBe(403)
  })
})
