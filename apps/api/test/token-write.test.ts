import { bkkDateOf } from '@seedoffice/core'
import { createDb, projects, rates, taskGroups, tasks } from '@seedoffice/db'
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApiToken } from '../src/lib/api-token'
import { loginAs, seedUsers } from './helpers'

beforeEach(async () => {
  await seedUsers()
  const db = createDb(env.DB)
  await db.insert(projects).values({ id: 'p_w', name: 'P', type: 'project' }).onConflictDoNothing()
  await db.insert(taskGroups).values({ id: 'g_w', projectId: 'p_w', name: 'G' }).onConflictDoNothing()
  await db
    .insert(tasks)
    .values({ id: 't_w', projectId: 'p_w', groupId: 'g_w', title: 'งาน', assigneeId: 'u_pond', status: 'todo', createdBy: 'u_owner' })
    .onConflictDoNothing()
  // pond ต้องมี rate ถึงลงเวลาได้ (POST /tasks/:id/time เช็ค rateFor)
  await db.insert(rates).values({ id: 'r_w', userId: 'u_pond', rateSatangPerHour: 50000, effectiveFrom: '2020-01-01' }).onConflictDoNothing()
})

const appMod = async () => (await import('../src/index')).app
const bearer = (t: string) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' })
const mkTok = (scopes: string[], uid = 'u_pond') => createApiToken(env, uid, 's', scopes)

describe('PAT writes — tasks/time (Phase B2)', () => {
  it('tasks:write → PATCH /api/tasks/:id (status) 200 · tasks:read → 403', async () => {
    const app = await appMod()
    const w = await mkTok(['tasks:write'])
    const r = await mkTok(['tasks:read'])
    const patch = (tok: string) =>
      app.request('/api/tasks/t_w', { method: 'PATCH', headers: bearer(tok), body: JSON.stringify({ status: 'doing' }) }, env)
    expect((await patch(w.token)).status).toBe(200)
    expect((await patch(r.token)).status).toBe(403)
  })

  it('tasks:write → star 200 + ลงเวลา 201', async () => {
    const app = await appMod()
    const { token } = await mkTok(['tasks:write'])
    const today = bkkDateOf(Date.now())
    expect(
      (await app.request('/api/tasks/t_w/star', { method: 'POST', headers: bearer(token), body: JSON.stringify({ on: true }) }, env)).status,
    ).toBe(200)
    expect(
      (await app.request('/api/tasks/t_w/time', { method: 'POST', headers: bearer(token), body: JSON.stringify({ workDate: today, minutes: 30 }) }, env)).status,
    ).toBe(201)
  })

  it('time:write → PATCH /api/time/:id 200 · time:read → 403', async () => {
    const app = await appMod()
    const cookie = await loginAs(app, 'pond@example-co.test')
    const today = bkkDateOf(Date.now())
    const entry = (await (
      await app.request('/api/tasks/t_w/time', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ workDate: today, minutes: 30 }) }, env)
    ).json()) as { id: string }
    const w = await mkTok(['time:write'])
    const r = await mkTok(['time:read'])
    const patch = (tok: string) =>
      app.request(`/api/time/${entry.id}`, { method: 'PATCH', headers: bearer(tok), body: JSON.stringify({ minutes: 45 }) }, env)
    expect((await patch(w.token)).status).toBe(200)
    expect((await patch(r.token)).status).toBe(403)
  })

  it('🔒 vendor PAT (tasks:write) → PATCH task 403 (teamOnly ยังคุม role แม้ผ่าน PAT)', async () => {
    const app = await appMod()
    const { token } = await mkTok(['tasks:write'], 'u_somchai')
    expect(
      (await app.request('/api/tasks/t_w', { method: 'PATCH', headers: bearer(token), body: JSON.stringify({ status: 'done' }) }, env)).status,
    ).toBe(403)
  })
})
