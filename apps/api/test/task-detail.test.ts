import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../src/index'
import { loginAs, seedUsers } from './helpers'

beforeEach(async () => {
  await seedUsers()
})

const json = (cookie: string, body: unknown) => ({
  method: 'POST',
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

async function makeTask(cookie: string) {
  const p = (await (await app.request('/api/projects', json(cookie, { name: 'P', type: 'project' }), env)).json()) as { id: string }
  const g = (await (await app.request(`/api/projects/${p.id}/groups`, json(cookie, { name: 'G' }), env)).json()) as { id: string }
  const t = (await (await app.request(`/api/groups/${g.id}/tasks`, json(cookie, { title: 'งานทดสอบ' }), env)).json()) as { id: string }
  return t
}

describe('T10 — task detail: comments + attachments + activity', () => {
  it('comment ได้ทุก role รวม vendor · เรียงเวลา · ขึ้นใน activity', async () => {
    const m = await loginAs(app, 'pond@seedwebs.com')
    const t = await makeTask(m)
    const v = await loginAs(app, 'somchai@example.com')

    await app.request(`/api/tasks/${t.id}/comments`, json(m, { body: 'ใช้ grid เดิมได้เลย' }), env)
    const vRes = await app.request(`/api/tasks/${t.id}/comments`, json(v, { body: 'รับทราบครับ' }), env)
    expect(vRes.status).toBe(201)

    const detail = (await (
      await app.request(`/api/tasks/${t.id}/detail`, { headers: { cookie: m } }, env)
    ).json()) as { comments: { body: string; userName: string }[]; activity: { action: string }[] }
    expect(detail.comments.map((c) => c.userName)).toEqual(['ปอนด์', 'สมชาย'])
    expect(detail.activity.some((a) => a.action === 'task.comment')).toBe(true)
    expect(detail.activity.some((a) => a.action === 'task.create')).toBe(true)
  })

  it('อัปโหลดไฟล์ → R2 → ดาวน์โหลดได้ byte ตรง · ไฟล์ inline เฉพาะรูป · vendor อัปไม่ได้', async () => {
    const m = await loginAs(app, 'pond@seedwebs.com')
    const t = await makeTask(m)

    const fd = new FormData()
    fd.append('file', new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'mock.png', { type: 'image/png' }))
    const up = await app.request(`/api/tasks/${t.id}/attachments`, { method: 'POST', headers: { cookie: m }, body: fd }, env)
    expect(up.status).toBe(201)
    const att = (await up.json()) as { id: string; filename: string }
    expect(att.filename).toBe('mock.png')

    const dl = await app.request(`/api/attachments/${att.id}`, { headers: { cookie: m } }, env)
    expect(dl.status).toBe(200)
    expect(dl.headers.get('content-type')).toBe('image/png')
    expect(dl.headers.get('content-disposition')).toContain('inline')
    expect(new Uint8Array(await dl.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))

    // ไม่ login โหลดไม่ได้
    expect((await app.request(`/api/attachments/${att.id}`, {}, env)).status).toBe(401)

    // vendor อัปโหลดไม่ได้ (teamOnly)
    const v = await loginAs(app, 'somchai@example.com')
    const fd2 = new FormData()
    fd2.append('file', new File(['x'], 'x.txt', { type: 'text/plain' }))
    expect(
      (await app.request(`/api/tasks/${t.id}/attachments`, { method: 'POST', headers: { cookie: v }, body: fd2 }, env)).status,
    ).toBe(403)
  })

  it('SVG ถูกบังคับดาวน์โหลด (กัน XSS) · ลบไฟล์ได้เฉพาะคนอัป/owner', async () => {
    const m = await loginAs(app, 'pond@seedwebs.com')
    const t = await makeTask(m)
    const fd = new FormData()
    fd.append('file', new File(['<svg onload="alert(1)"/>'], 'evil.svg', { type: 'image/svg+xml' }))
    const up = await app.request(`/api/tasks/${t.id}/attachments`, { method: 'POST', headers: { cookie: m }, body: fd }, env)
    const att = (await up.json()) as { id: string }

    const dl = await app.request(`/api/attachments/${att.id}`, { headers: { cookie: m } }, env)
    expect(dl.headers.get('content-type')).toBe('application/octet-stream')
    expect(dl.headers.get('content-disposition')).toContain('attachment')

    const owner = await loginAs(app, 'owner@seedwebs.com')
    expect((await app.request(`/api/attachments/${att.id}`, { method: 'DELETE', headers: { cookie: owner } }, env)).status).toBe(200)
    expect((await app.request(`/api/attachments/${att.id}`, { headers: { cookie: m } }, env)).status).toBe(404)
  })

  it('activity ไล่ลำดับ: create → status → assign', async () => {
    const m = await loginAs(app, 'owner@seedwebs.com')
    const t = await makeTask(m)
    await app.request(`/api/tasks/${t.id}`, { ...json(m, { status: 'done' }), method: 'PATCH' }, env)
    await app.request(`/api/tasks/${t.id}`, { ...json(m, { assigneeId: 'u_pond' }), method: 'PATCH' }, env)
    const detail = (await (
      await app.request(`/api/tasks/${t.id}/detail`, { headers: { cookie: m } }, env)
    ).json()) as { activity: { action: string }[] }
    // เรียงล่าสุดก่อน
    expect(detail.activity.map((a) => a.action)).toEqual(['task.assign', 'task.status', 'task.create'])
  })
})
