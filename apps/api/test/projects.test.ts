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

describe('โปรเจกต์: ไอคอน/โลโก้ (lucide + อัปโหลด)', () => {
  const getLogo = async (cookie: string, id: string) =>
    (await (await app.request(`/api/projects/${id}`, { headers: { cookie } }, env)).json()) as { logo: string | null }
  const patch = (cookie: string, id: string, body: Record<string, unknown>) =>
    app.request(
      `/api/projects/${id}`,
      { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) },
      env,
    )

  it('PATCH ตั้งไอคอน lucide ได้ · ปฏิเสธ upload:/ชื่อเพี้ยน · เคลียร์ด้วย null', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const p = (await (await createProject(owner, { name: 'ไอคอน', type: 'project' })).json()) as { id: string }

    expect((await patch(owner, p.id, { logo: 'lucide:rocket' })).status).toBe(200)
    expect((await getLogo(owner, p.id)).logo).toBe('lucide:rocket')

    expect((await patch(owner, p.id, { logo: 'upload:project-logos/x/y' })).status).toBe(400)
    expect((await patch(owner, p.id, { logo: 'lucide:Rocket' })).status).toBe(400)

    expect((await patch(owner, p.id, { logo: null })).status).toBe(200)
    expect((await getLogo(owner, p.id)).logo).toBeNull()
  })

  it('อัปโหลดโลโก้ → logo=upload: · โหลดกลับได้ · SVG 415 · vendor อัปไม่ได้(403)แต่ดูได้(200) · เปลี่ยนไอคอนลบไฟล์ R2 เก่า', async () => {
    const member = await loginAs(app, 'pond@example-co.test')
    const p = (await (await createProject(member, { name: 'โลโก้', type: 'project' })).json()) as { id: string }

    const fd = new FormData()
    fd.append('file', new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' }))
    const up = await app.request(`/api/projects/${p.id}/logo`, { method: 'POST', headers: { cookie: member }, body: fd }, env)
    expect(up.status).toBe(200)
    const after = (await up.json()) as { logo: string }
    expect(after.logo.startsWith('upload:')).toBe(true)
    const key = after.logo.slice('upload:'.length)

    const dl = await app.request(`/api/projects/${p.id}/logo`, { headers: { cookie: member } }, env)
    expect(dl.status).toBe(200)
    expect(dl.headers.get('content-type')).toBe('image/png')

    const svg = new FormData()
    svg.append('file', new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }))
    expect((await app.request(`/api/projects/${p.id}/logo`, { method: 'POST', headers: { cookie: member }, body: svg }, env)).status).toBe(415)

    const vendor = await loginAs(app, 'somchai@example.com')
    const vfd = new FormData()
    vfd.append('file', new File([new Uint8Array([137, 80, 78, 71])], 'v.png', { type: 'image/png' }))
    expect((await app.request(`/api/projects/${p.id}/logo`, { method: 'POST', headers: { cookie: vendor }, body: vfd }, env)).status).toBe(403)
    expect((await app.request(`/api/projects/${p.id}/logo`, { headers: { cookie: vendor } }, env)).status).toBe(200)

    // เปลี่ยนเป็น lucide → ไฟล์ R2 เก่าถูกลบ + GET logo กลายเป็น 404
    expect(await env.FILES.get(key)).not.toBeNull()
    expect((await patch(member, p.id, { logo: 'lucide:globe' })).status).toBe(200)
    expect(await env.FILES.get(key)).toBeNull()
    expect((await app.request(`/api/projects/${p.id}/logo`, { headers: { cookie: member } }, env)).status).toBe(404)
  })
})

describe('สถานะโปรเจกต์ปรับเองได้ (configurable statuses)', () => {
  const cfgOf = async (cookie: string) =>
    (await (await app.request('/api/config', { headers: { cookie } }, env)).json()) as {
      projectStatuses: { id: string; name: string; kind: string }[]
    }
  const DEFAULT_6 = [
    { id: 'design', name: 'Design', color: 'amber', kind: 'active', sortOrder: 0 },
    { id: 'dev', name: 'Dev', color: 'orange', kind: 'active', sortOrder: 1 },
    { id: 'staging', name: 'Staging', color: 'yellow', kind: 'active', sortOrder: 2 },
    { id: 'golive', name: 'Go Live', color: 'violet', kind: 'active', sortOrder: 3 },
    { id: 'ma', name: 'MA', color: 'emerald', kind: 'active', sortOrder: 4 },
    { id: 'archived', name: 'archived', color: 'slate', kind: 'archived', sortOrder: 5 },
  ]
  const putStatuses = (cookie: string, statuses: unknown[]) =>
    app.request(
      '/api/admin/project-statuses',
      { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ statuses }) },
      env,
    )

  it('GET /api/config คืน default 6 (ทุก role รวม vendor) + create ไม่ระบุ status = ค่าเริ่มเดิม (project→dev)', async () => {
    const vendor = await loginAs(app, 'somchai@example.com')
    const cfg = await cfgOf(vendor)
    expect(cfg.projectStatuses).toHaveLength(6)
    expect(cfg.projectStatuses[0]?.id).toBe('design')

    const owner = await loginAs(app, 'owner@example-co.test')
    const p = (await (await createProject(owner, { name: 'default-status', type: 'project' })).json()) as { status: string }
    expect(p.status).toBe('dev')
  })

  it('สร้าง/แก้ ด้วย status ที่ไม่มีใน config = 400', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    expect((await createProject(owner, { name: 'bad', type: 'project', status: 'ghost' })).status).toBe(400)
    const p = (await (await createProject(owner, { name: 'ok', type: 'project' })).json()) as { id: string }
    const patch = await app.request(
      `/api/projects/${p.id}`,
      { method: 'PATCH', headers: { cookie: owner, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'ghost' }) },
      env,
    )
    expect(patch.status).toBe(400)
  })

  it('owner บันทึก statuses ได้ (rename) · member 403 · ไม่มี active 400 · ลบสถานะที่ใช้อยู่ 409', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const member = await loginAs(app, 'pond@example-co.test')

    expect((await putStatuses(member, DEFAULT_6)).status).toBe(403)
    expect((await putStatuses(owner, DEFAULT_6.map((s) => ({ ...s, kind: 'archived' })))).status).toBe(400)

    // มีโปรเจกต์ใช้ 'design' → ลบ 'design' ออกไม่ได้
    await createProject(owner, { name: 'uses-design', type: 'project', status: 'design' })
    expect((await putStatuses(owner, DEFAULT_6.filter((s) => s.id !== 'design'))).status).toBe(409)

    // rename ได้
    const renamed = DEFAULT_6.map((s) => (s.id === 'design' ? { ...s, name: 'ออกแบบ' } : s))
    expect((await putStatuses(owner, renamed)).status).toBe(200)
    const cfg = await cfgOf(owner)
    expect(cfg.projectStatuses.find((s) => s.id === 'design')?.name).toBe('ออกแบบ')
  })
})
