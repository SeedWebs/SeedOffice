import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApiToken, revokeApiToken, userFromApiToken } from '../src/lib/api-token'
import { loginAs, seedUsers } from './helpers'

beforeEach(async () => {
  await seedUsers()
})

const appMod = async () => (await import('../src/index')).app

const postToken = (app: Awaited<ReturnType<typeof appMod>>, cookie: string, body: unknown) =>
  app.request(
    '/api/tokens',
    { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) },
    env,
  )

describe('PAT — /api/tokens (SPEC §4.18)', () => {
  it('owner สร้างได้ → คืน token เต็ม (sko_) ครั้งเดียว · list ไม่หลุดค่า token', async () => {
    const app = await appMod()
    const cookie = await loginAs(app, 'owner@example-co.test')
    const res = await postToken(app, cookie, { name: 'claude-laptop', scopes: ['tasks:read', 'time:write'] })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; token: string; scopes: string[] }
    expect(body.token).toMatch(/^sko_[0-9a-f]{64}$/)
    expect(body.scopes).toEqual(['tasks:read', 'time:write'])

    const list = (await (await app.request('/api/tokens', { headers: { cookie } }, env)).json()) as {
      tokens: { id: string; name: string }[]
    }
    expect(list.tokens).toHaveLength(1)
    expect(list.tokens[0]).toMatchObject({ id: body.id, name: 'claude-laptop' })
    expect(JSON.stringify(list.tokens)).not.toContain(body.token) // ค่า token จริงห้ามหลุดออกทาง list
  })

  it('member สร้างได้ · vendor 403 (teamOnly)', async () => {
    const app = await appMod()
    const member = await loginAs(app, 'pond@example-co.test')
    expect((await postToken(app, member, { name: 'm', scopes: ['tasks:read'] })).status).toBe(201)
    const vendor = await loginAs(app, 'somchai@example.com')
    expect((await app.request('/api/tokens', { headers: { cookie: vendor } }, env)).status).toBe(403)
    expect((await postToken(app, vendor, { name: 'v', scopes: ['tasks:read'] })).status).toBe(403)
  })

  it('ไม่ login → 401', async () => {
    const app = await appMod()
    expect((await app.request('/api/tokens', {}, env)).status).toBe(401)
  })

  it('scope การเงิน/ว่าง/ไม่รู้จัก = 400 (รับเฉพาะ tasks/time/projects:read)', async () => {
    const app = await appMod()
    const cookie = await loginAs(app, 'owner@example-co.test')
    const status = async (scopes: unknown) => (await postToken(app, cookie, { name: 'x', scopes })).status
    expect(await status(['payroll:read'])).toBe(400)
    expect(await status(['finance:write'])).toBe(400)
    expect(await status([])).toBe(400)
    expect(await status(['tasks:read', 'bonus:read'])).toBe(400)
  })

  it('เพิกถอน: member ลบ token ของ owner ไม่ได้ (403) · owner ลบของ member ได้ · ลบซ้ำ 404', async () => {
    const app = await appMod()
    const ownerCookie = await loginAs(app, 'owner@example-co.test')
    const memberCookie = await loginAs(app, 'pond@example-co.test')

    // token ของ member → owner เพิกถอนได้ (เจ้าของ token = member, ผู้ลบ = owner)
    const memTok = (await (await postToken(app, memberCookie, { name: 'mtok', scopes: ['tasks:read'] })).json()) as {
      id: string
    }
    expect(
      (await app.request(`/api/tokens/${memTok.id}`, { method: 'DELETE', headers: { cookie: ownerCookie } }, env))
        .status,
    ).toBe(200)

    // token ของ owner → member ลบไม่ได้ (ไม่ใช่เจ้าของ + ไม่ใช่ owner)
    const ownTok = (await (await postToken(app, ownerCookie, { name: 'otok', scopes: ['tasks:read'] })).json()) as {
      id: string
    }
    expect(
      (await app.request(`/api/tokens/${ownTok.id}`, { method: 'DELETE', headers: { cookie: memberCookie } }, env))
        .status,
    ).toBe(403)
    // เจ้าของลบเอง → 200 · ลบซ้ำ → 404
    expect(
      (await app.request(`/api/tokens/${ownTok.id}`, { method: 'DELETE', headers: { cookie: ownerCookie } }, env))
        .status,
    ).toBe(200)
    expect(
      (await app.request(`/api/tokens/${ownTok.id}`, { method: 'DELETE', headers: { cookie: ownerCookie } }, env))
        .status,
    ).toBe(404)
  })

  it('🔒 PAT แตะ route การเงินไม่ได้ — Bearer บน /api/expenses = 401 (cookie-only)', async () => {
    const app = await appMod()
    const cookie = await loginAs(app, 'owner@example-co.test')
    const { token } = (await (
      await postToken(app, cookie, { name: 'fin-probe', scopes: ['tasks:read', 'time:write'] })
    ).json()) as { token: string }
    // PAT ที่ valid ทุกอย่าง แต่ route การเงินรับ cookie เท่านั้น → ไม่มี cookie = 401
    const res = await app.request('/api/expenses', { headers: { authorization: `Bearer ${token}` } }, env)
    expect(res.status).toBe(401)
  })

  it('lib: userFromApiToken resolve → revoke → null · token ปลอม = null', async () => {
    const { token, id } = await createApiToken(env, 'u_owner', 'unit', ['tasks:read'])
    const resolved = await userFromApiToken(env, token)
    expect(resolved?.user.id).toBe('u_owner')
    expect(resolved?.scopes).toEqual(['tasks:read'])
    await revokeApiToken(env, id)
    expect(await userFromApiToken(env, token)).toBeNull()
    expect(await userFromApiToken(env, 'sko_deadbeef')).toBeNull()
    expect(await userFromApiToken(env, 'not-a-prefixed-token')).toBeNull()
  })
})
