import { auditLogs, createDb, projects, taskGroups } from '@seedoffice/db'
import { and, eq } from 'drizzle-orm'
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApiToken } from '../src/lib/api-token'
import { loginAs, seedUsers } from './helpers'

// T3 (SPEC §4.18): เปิดให้ PAT สร้าง task ใหม่ + discover project→group tree
// active = p_t3a (status dev) · archived = p_t3z (status archived → discovery ต้องตัดออก)
beforeEach(async () => {
  await seedUsers()
  const db = createDb(env.DB)
  await db
    .insert(projects)
    .values([
      { id: 'p_t3a', name: 'โปรเจกต์ T3 (active)', type: 'project', status: 'dev' },
      { id: 'p_t3z', name: 'โปรเจกต์ T3 (archived)', type: 'project', status: 'archived' },
    ])
    .onConflictDoNothing()
  await db
    .insert(taskGroups)
    .values([
      { id: 'g_t3a', projectId: 'p_t3a', name: 'กลุ่ม A', sortOrder: 0 },
      { id: 'g_t3z', projectId: 'p_t3z', name: 'กลุ่ม Z', sortOrder: 0 },
    ])
    .onConflictDoNothing()
})

const appMod = async () => (await import('../src/index')).app
const bearer = (t: string) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' })
const mkTok = (scopes: string[], uid = 'u_pond') => createApiToken(env, uid, 's', scopes)

type MeProjects = {
  projects: { id: string; name: string; type: string; status: string; groups: { id: string; name: string }[] }[]
}

describe('PAT discovery — GET /api/me/projects (T3)', () => {
  it('PAT tasks:read → 200 · คืน active project + groups · ตัด archived ออก', async () => {
    const app = await appMod()
    const { token } = await mkTok(['tasks:read'])
    const res = await app.request('/api/me/projects', { headers: bearer(token) }, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as MeProjects
    const ids = body.projects.map((p) => p.id)
    expect(ids).toContain('p_t3a')
    expect(ids).not.toContain('p_t3z') // archived ไม่โผล่ (สร้าง task ไม่ได้)
    const active = body.projects.find((p) => p.id === 'p_t3a')!
    expect(active.groups.map((g) => g.id)).toContain('g_t3a')
    expect(active.groups[0]).toEqual({ id: 'g_t3a', name: 'กลุ่ม A' })
  })

  it('ไม่มีฟิลด์การเงินรั่ว (PAT-safe)', async () => {
    const app = await appMod()
    const { token } = await mkTok(['tasks:read'])
    const body = (await (await app.request('/api/me/projects', { headers: bearer(token) }, env)).json()) as MeProjects
    const p = body.projects.find((x) => x.id === 'p_t3a')! as Record<string, unknown>
    expect(p.quotedSatang).toBeUndefined()
    expect(p.health).toBeUndefined()
  })

  it('PAT ไม่มี tasks:read (มีแค่ time:write) → 403', async () => {
    const app = await appMod()
    const { token } = await mkTok(['time:write'])
    expect((await app.request('/api/me/projects', { headers: bearer(token) }, env)).status).toBe(403)
  })

  it('cookie member → 200', async () => {
    const app = await appMod()
    const cookie = await loginAs(app, 'pond@example-co.test')
    expect((await app.request('/api/me/projects', { headers: { cookie } }, env)).status).toBe(200)
  })

  it('ไม่ auth → 401', async () => {
    const app = await appMod()
    expect((await app.request('/api/me/projects', {}, env)).status).toBe(401)
  })
})

describe('PAT create task — POST /api/groups/:id/tasks (T3)', () => {
  it('PAT tasks:write → 201 · task + audit (เดินในนาม user)', async () => {
    const app = await appMod()
    const { token } = await mkTok(['tasks:write'])
    const res = await app.request(
      '/api/groups/g_t3a/tasks',
      { method: 'POST', headers: bearer(token), body: JSON.stringify({ title: 'งานจาก PAT' }) },
      env,
    )
    expect(res.status).toBe(201)
    const created = (await res.json()) as { id: string; projectId: string; groupId: string; createdBy: string; title: string }
    expect(created.projectId).toBe('p_t3a')
    expect(created.groupId).toBe('g_t3a')
    expect(created.createdBy).toBe('u_pond')
    const log = (
      await createDb(env.DB)
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, created.id), eq(auditLogs.action, 'task.create')))
        .limit(1)
    )[0]
    expect(log?.actorId).toBe('u_pond')
  })

  it('PAT tasks:read (ไม่มี write) → 403 insufficient_scope', async () => {
    const app = await appMod()
    const { token } = await mkTok(['tasks:read'])
    expect(
      (await app.request('/api/groups/g_t3a/tasks', { method: 'POST', headers: bearer(token), body: JSON.stringify({ title: 'x' }) }, env)).status,
    ).toBe(403)
  })

  it('PAT tasks:write · group ไม่มีจริง → 404', async () => {
    const app = await appMod()
    const { token } = await mkTok(['tasks:write'])
    expect(
      (await app.request('/api/groups/nope/tasks', { method: 'POST', headers: bearer(token), body: JSON.stringify({ title: 'x' }) }, env)).status,
    ).toBe(404)
  })

  it('🔒 vendor PAT (tasks:write) → 403 (teamOnly ยังคุม role)', async () => {
    const app = await appMod()
    const { token } = await mkTok(['tasks:write'], 'u_somchai')
    expect(
      (await app.request('/api/groups/g_t3a/tasks', { method: 'POST', headers: bearer(token), body: JSON.stringify({ title: 'x' }) }, env)).status,
    ).toBe(403)
  })

  it('🔒 จัดการ group (rename) ยังเป็น cookie-only → PAT 401', async () => {
    const app = await appMod()
    const { token } = await mkTok(['tasks:write'])
    expect(
      (await app.request('/api/groups/g_t3a', { method: 'PATCH', headers: bearer(token), body: JSON.stringify({ name: 'เปลี่ยนชื่อ' }) }, env)).status,
    ).toBe(401)
  })

  it('cookie member ยังสร้าง task + rename group ได้ (regression)', async () => {
    const app = await appMod()
    const cookie = await loginAs(app, 'pond@example-co.test')
    const h = { cookie, 'content-type': 'application/json' }
    expect(
      (await app.request('/api/groups/g_t3a/tasks', { method: 'POST', headers: h, body: JSON.stringify({ title: 'งาน cookie' }) }, env)).status,
    ).toBe(201)
    expect(
      (await app.request('/api/groups/g_t3a', { method: 'PATCH', headers: h, body: JSON.stringify({ name: 'A2' }) }, env)).status,
    ).toBe(200)
  })
})
