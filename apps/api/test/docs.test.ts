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
  await env.DB.prepare('DELETE FROM doc_images').run()
  await env.DB.prepare('DELETE FROM docs').run()
})

async function makeDoc(cookie: string, title: string, parentId?: string) {
  return (await (
    await app.request('/api/docs', json(cookie, { title, ...(parentId ? { parentId } : {}) }), env)
  ).json()) as { id: string }
}

describe('D1 — docs tree CRUD', () => {
  it('สร้างซ้อน 3 ชั้น → tree ครบ · autosave content คงอยู่ · vendor = 403', async () => {
    const m = await loginAs(app, 'pond@example-co.test')
    const root = await makeDoc(m, 'คู่มือพนักงานใหม่')
    const child = await makeDoc(m, 'ตั้งค่าเครื่อง', root.id)
    const grand = await makeDoc(m, 'ติดตั้ง dev tools', child.id)

    const tree = (await (await app.request('/api/docs', { headers: { cookie: m } }, env)).json()) as { id: string; parentId: string | null }[]
    expect(tree).toHaveLength(3)
    expect(tree.find((d) => d.id === grand.id)?.parentId).toBe(child.id)

    await app.request(`/api/docs/${root.id}`, { ...json(m, { contentMarkdown: '# สวัสดี\n\n- ข้อแรก' }), method: 'PATCH' }, env)
    const doc = (await (await app.request(`/api/docs/${root.id}`, { headers: { cookie: m } }, env)).json()) as { contentMarkdown: string }
    expect(doc.contentMarkdown).toBe('# สวัสดี\n\n- ข้อแรก')

    const v = await loginAs(app, 'somchai@example.com')
    expect((await app.request('/api/docs', { headers: { cookie: v } }, env)).status).toBe(403)
    expect((await app.request(`/api/docs/${root.id}`, { headers: { cookie: v } }, env)).status).toBe(403)
  })

  it('move: ย้าย+เรียงได้ · ย้ายลงใต้ลูกตัวเอง = 409 cycle', async () => {
    const m = await loginAs(app, 'pond@example-co.test')
    const a = await makeDoc(m, 'A')
    const b = await makeDoc(m, 'B', a.id)
    const c0 = await makeDoc(m, 'C')

    // ย้าย C ไปใต้ B
    const mv = await app.request(`/api/docs/${c0.id}/move`, json(m, { parentId: b.id, sortOrder: 0 }), env)
    expect(mv.status).toBe(200)
    const tree = (await (await app.request('/api/docs', { headers: { cookie: m } }, env)).json()) as { id: string; parentId: string | null }[]
    expect(tree.find((d) => d.id === c0.id)?.parentId).toBe(b.id)

    // A → ใต้ C (หลาน) = cycle
    expect((await app.request(`/api/docs/${a.id}/move`, json(m, { parentId: c0.id, sortOrder: 0 }), env)).status).toBe(409)
  })

  it('ลบ root = soft-delete ทั้ง subtree (row ยังอยู่ใน DB)', async () => {
    const m = await loginAs(app, 'pond@example-co.test')
    const a = await makeDoc(m, 'A')
    const b = await makeDoc(m, 'B', a.id)
    await makeDoc(m, 'C', b.id)

    const del = (await (
      await app.request(`/api/docs/${a.id}`, { method: 'DELETE', headers: { cookie: m } }, env)
    ).json()) as { deleted: number }
    expect(del.deleted).toBe(3)

    const tree = (await (await app.request('/api/docs', { headers: { cookie: m } }, env)).json()) as unknown[]
    expect(tree).toHaveLength(0)
    const raw = await env.DB.prepare('SELECT COUNT(*) AS n FROM docs WHERE deleted_at IS NOT NULL').first<{ n: number }>()
    expect(raw?.n).toBe(3)
  })
})

describe('D3 — docs images', () => {
  it('อัป png → ได้ url → โหลดได้ · SVG = 415', async () => {
    const m = await loginAs(app, 'pond@example-co.test')
    const fd = new FormData()
    fd.append('file', new File([new Uint8Array([137, 80, 78, 71])], 'pic.png', { type: 'image/png' }))
    const up = await app.request('/api/docs/images', { method: 'POST', headers: { cookie: m }, body: fd }, env)
    expect(up.status).toBe(201)
    const { url } = (await up.json()) as { url: string }
    expect(url).toMatch(/^\/api\/docs\/images\//)

    const dl = await app.request(url, { headers: { cookie: m } }, env)
    expect(dl.status).toBe(200)
    expect(dl.headers.get('content-type')).toBe('image/png')

    const svg = new FormData()
    svg.append('file', new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }))
    expect((await app.request('/api/docs/images', { method: 'POST', headers: { cookie: m }, body: svg }, env)).status).toBe(415)

    // vendor โหลดรูปก็ไม่ได้ (เอกสารทั้ง subtree = team only)
    const v = await loginAs(app, 'somchai@example.com')
    expect((await app.request(url, { headers: { cookie: v } }, env)).status).toBe(403)
  })
})
