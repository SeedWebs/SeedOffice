import { bkkDateOf } from '@seedoffice/core'
import { createDb, projects, taskGroups, tasks, taskStars, timeEntries } from '@seedoffice/db'
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApiToken } from '../src/lib/api-token'
import { loginAs, seedUsers } from './helpers'

beforeEach(async () => {
  await seedUsers()
})

const appMod = async () => (await import('../src/index')).app

/** งาน + ดาว + เวลา ของ u_pond สำหรับวันนี้ */
async function seedWork() {
  const db = createDb(env.DB)
  const today = bkkDateOf(Date.now())
  await db.insert(projects).values({ id: 'p_test', name: 'เว็บลูกค้า A', type: 'project' }).onConflictDoNothing()
  await db.insert(taskGroups).values({ id: 'g_test', projectId: 'p_test', name: 'Frontend' }).onConflictDoNothing()
  await db
    .insert(tasks)
    .values({
      id: 't_test',
      projectId: 'p_test',
      groupId: 'g_test',
      title: 'ทำ hero section',
      assigneeId: 'u_pond',
      status: 'doing',
      createdBy: 'u_pond',
    })
    .onConflictDoNothing()
  await db.insert(taskStars).values({ id: 's_test', userId: 'u_pond', taskId: 't_test', forDate: today }).onConflictDoNothing()
  await db
    .insert(timeEntries)
    .values({
      id: 'te_test',
      userId: 'u_pond',
      taskId: 't_test',
      projectId: 'p_test',
      workDate: today,
      minutes: 90,
      rateSnapshotSatang: 50000,
      source: 'manual',
    })
    .onConflictDoNothing()
}

type Today = {
  user: { id: string; name: string }
  starred: { id: string; projectName: string }[]
  assigned: { id: string }[]
  minutes: { today: number; yesterday: number }
}

describe('GET /api/me/today (SPEC §4.18 · check-in payload)', () => {
  it('cookie: คืนงานวันนี้ (ดาว) + assigned + เวลารวมวันนี้', async () => {
    const app = await appMod()
    await seedWork()
    const cookie = await loginAs(app, 'pond@example-co.test')
    const res = await app.request('/api/me/today', { headers: { cookie } }, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Today
    expect(body.starred.map((t) => t.id)).toContain('t_test')
    expect(body.starred[0]?.projectName).toBe('เว็บลูกค้า A')
    expect(body.assigned.map((t) => t.id)).toContain('t_test')
    expect(body.minutes.today).toBe(90)
    expect(body.minutes.yesterday).toBe(0)
  })

  it('PAT scope tasks:read → 200 (เข้าถึง /api/me/today ได้ ไม่โดน cookie-gate)', async () => {
    const app = await appMod()
    const { token } = await createApiToken(env, 'u_pond', 'checkin', ['tasks:read'])
    const res = await app.request('/api/me/today', { headers: { authorization: `Bearer ${token}` } }, env)
    expect(res.status).toBe(200)
    expect(((await res.json()) as Today).user.id).toBe('u_pond')
  })

  it('PAT ไม่มี tasks:read (มีแค่ time:write) → 403 insufficient_scope', async () => {
    const app = await appMod()
    const { token } = await createApiToken(env, 'u_pond', 'nope', ['time:write'])
    expect((await app.request('/api/me/today', { headers: { authorization: `Bearer ${token}` } }, env)).status).toBe(403)
  })

  it('ไม่ auth → 401', async () => {
    const app = await appMod()
    expect((await app.request('/api/me/today', {}, env)).status).toBe(401)
  })
})
