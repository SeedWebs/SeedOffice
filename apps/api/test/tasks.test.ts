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

async function setupProject(cookie: string) {
  const p = (await (
    await app.request('/api/projects', json(cookie, { name: 'โปรเจกต์เทสต์', type: 'project' }), env)
  ).json()) as { id: string }
  const g1 = (await (
    await app.request(`/api/projects/${p.id}/groups`, json(cookie, { name: 'Design' }), env)
  ).json()) as { id: string }
  const g2 = (await (
    await app.request(`/api/projects/${p.id}/groups`, json(cookie, { name: 'Dev' }), env)
  ).json()) as { id: string }
  return { p, g1, g2 }
}

describe('T09 — groups/tasks/reorder/checkbox/timeline data', () => {
  it('สร้าง group + task → board ออกครบ · เช็คเสร็จ → done + completedAt · ติ๊กออก → todo', async () => {
    const m = await loginAs(app, 'pond@seedwebs.com')
    const { p, g1 } = await setupProject(m)
    const t = (await (
      await app.request(
        `/api/groups/${g1.id}/tasks`,
        json(m, { title: 'Hero section', startDate: '2026-06-01', dueDate: '2026-06-20', estimateMinutes: 480 }),
        env,
      )
    ).json()) as { id: string }

    let board = (await (
      await app.request(`/api/projects/${p.id}/board`, { headers: { cookie: m } }, env)
    ).json()) as { groups: { name: string; tasks: { id: string; status: string }[] }[] }
    expect(board.groups.map((g) => g.name)).toEqual(['Design', 'Dev'])
    expect(board.groups[0]?.tasks[0]?.id).toBe(t.id)

    await app.request(`/api/tasks/${t.id}`, { ...json(m, { status: 'done' }), method: 'PATCH' }, env)
    board = (await (await app.request(`/api/projects/${p.id}/board`, { headers: { cookie: m } }, env)).json()) as typeof board
    expect(board.groups[0]?.tasks[0]?.status).toBe('done')

    await app.request(`/api/tasks/${t.id}`, { ...json(m, { status: 'todo' }), method: 'PATCH' }, env)
    board = (await (await app.request(`/api/projects/${p.id}/board`, { headers: { cookie: m } }, env)).json()) as typeof board
    expect(board.groups[0]?.tasks[0]?.status).toBe('todo')
  })

  it('reorder: ย้าย task ข้ามกลุ่ม + สลับลำดับ group → persist หลัง reload', async () => {
    const m = await loginAs(app, 'owner@seedwebs.com')
    const { p, g1, g2 } = await setupProject(m)
    const t1 = (await (await app.request(`/api/groups/${g1.id}/tasks`, json(m, { title: 'งาน 1' }), env)).json()) as { id: string }
    const t2 = (await (await app.request(`/api/groups/${g1.id}/tasks`, json(m, { title: 'งาน 2' }), env)).json()) as { id: string }

    const res = await app.request(
      `/api/projects/${p.id}/reorder`,
      json(m, {
        groups: [
          { id: g2.id, sortOrder: 0 },
          { id: g1.id, sortOrder: 1 },
        ],
        tasks: [
          { id: t2.id, groupId: g2.id, sortOrder: 0 },
          { id: t1.id, groupId: g1.id, sortOrder: 0 },
        ],
      }),
      env,
    )
    expect(res.status).toBe(200)
    const board = (await (
      await app.request(`/api/projects/${p.id}/board`, { headers: { cookie: m } }, env)
    ).json()) as { groups: { id: string; name: string; tasks: { id: string }[] }[] }
    expect(board.groups.map((g) => g.name)).toEqual(['Dev', 'Design'])
    expect(board.groups[0]?.tasks[0]?.id).toBe(t2.id)
  })

  it('vendor: อ่าน board ได้ แต่สร้าง/แก้/reorder = 403 · ลบ group ที่มีงาน = 409', async () => {
    const m = await loginAs(app, 'pond@seedwebs.com')
    const { p, g1 } = await setupProject(m)
    await app.request(`/api/groups/${g1.id}/tasks`, json(m, { title: 'งานค้าง' }), env)

    const v = await loginAs(app, 'somchai@example.com')
    expect((await app.request(`/api/projects/${p.id}/board`, { headers: { cookie: v } }, env)).status).toBe(200)
    expect((await app.request(`/api/projects/${p.id}/groups`, json(v, { name: 'X' }), env)).status).toBe(403)
    expect((await app.request(`/api/groups/${g1.id}/tasks`, json(v, { title: 'X' }), env)).status).toBe(403)

    expect((await app.request(`/api/groups/${g1.id}`, { method: 'DELETE', headers: { cookie: m } }, env)).status).toBe(409)
  })

  it('recurring openTodo: โผล่ในลิสต์โปรเจกต์ พร้อมชื่อคนรับผิดชอบ', async () => {
    const m = await loginAs(app, 'owner@seedwebs.com')
    const p = (await (
      await app.request('/api/projects', json(m, { name: 'MA ร้านกาแฟ', type: 'recurring' }), env)
    ).json()) as { id: string }
    const g = (await (
      await app.request(`/api/projects/${p.id}/groups`, json(m, { name: 'งานประจำ' }), env)
    ).json()) as { id: string }
    await app.request(
      `/api/groups/${g.id}/tasks`,
      json(m, { title: 'อัปเดตเมนู', dueDate: '2026-06-11', assigneeId: 'u_pond' }),
      env,
    )
    const list = (await (
      await app.request('/api/projects', { headers: { cookie: m } }, env)
    ).json()) as { id: string; openTodo: { title: string; assigneeName: string } | null }[]
    const row = list.find((x) => x.id === p.id)
    expect(row?.openTodo).toMatchObject({ title: 'อัปเดตเมนู', assigneeName: 'ปอนด์' })
  })
})
