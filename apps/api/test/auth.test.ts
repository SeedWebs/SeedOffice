import { env } from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { loginAs, seedUsers } from './helpers'

beforeEach(async () => {
  await seedUsers()
})

describe('GET /api/health', () => {
  it('200 ok', async () => {
    const res = await app.request('/api/health', {}, env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})

describe('dev-login (DEV_AUTH=1 เท่านั้น)', () => {
  it('user ที่ seed ไว้ login ได้ + ได้ httpOnly cookie', async () => {
    const res = await app.request(
      '/api/auth/dev-login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@seedwebs.com' }),
      },
      env,
    )
    expect(res.status).toBe(200)
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('so_session=')
    expect(cookie).toContain('HttpOnly')
  })
  it('email นอกระบบ (ไม่ใช่โดเมนทีม) → 403', async () => {
    const res = await app.request(
      '/api/auth/dev-login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'stranger@example.com' }),
      },
      env,
    )
    expect(res.status).toBe(403)
  })
  it('user ถูกปิดการใช้งาน → 403', async () => {
    const res = await app.request(
      '/api/auth/dev-login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'gone@seedwebs.com' }),
      },
      env,
    )
    expect(res.status).toBe(403)
  })
  it('ปิด DEV_AUTH → 404 (กันหลุดไป production)', async () => {
    const res = await app.request(
      '/api/auth/dev-login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@seedwebs.com' }),
      },
      { ...env, DEV_AUTH: '0' },
    )
    expect(res.status).toBe(404)
  })
})

describe('GET /api/me + logout', () => {
  it('ไม่มี cookie → 401 · มี cookie → ข้อมูลตัวเอง · logout แล้ว → 401', async () => {
    expect((await app.request('/api/me', {}, env)).status).toBe(401)

    const cookie = await loginAs(app, 'pond@seedwebs.com')
    const me = await app.request('/api/me', { headers: { cookie } }, env)
    expect(me.status).toBe(200)
    expect(await me.json()).toMatchObject({ email: 'pond@seedwebs.com', role: 'member' })

    const out = await app.request(
      '/api/auth/logout',
      { method: 'POST', headers: { cookie } },
      env,
    )
    expect(out.status).toBe(200)
    expect((await app.request('/api/me', { headers: { cookie } }, env)).status).toBe(401)
  })
})

describe('OAuth callback (mock Google)', () => {
  afterEach(() => vi.unstubAllGlobals())

  // stub global fetch เฉพาะ endpoint ของ Google — request อื่นถือว่าผิดเทสต์
  function mockGoogle(profile: Record<string, unknown>) {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.startsWith('https://oauth2.googleapis.com/token'))
        return Response.json({ access_token: 'at-test' })
      if (url.startsWith('https://openidconnect.googleapis.com/v1/userinfo'))
        return Response.json(profile)
      throw new Error(`unexpected fetch in test: ${url}`)
    })
  }

  async function callCallback() {
    return app.request(
      '/api/auth/callback?code=test-code&state=st-123',
      { headers: { cookie: 'so_oauth_state=st-123' } },
      env,
    )
  }

  it('email โดเมนทีมที่ยังไม่มีในระบบ → auto-provision เป็น member + redirect /', async () => {
    mockGoogle({
      sub: 'g-new',
      email: 'newbie@seedwebs.com',
      email_verified: true,
      name: 'นิวบี้',
    })
    const res = await callCallback()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/')
    // callback ตั้งหลาย cookie (ลบ state + ตั้ง session) — ดึงเฉพาะ session
    const m = /so_session=([^;,]+)/.exec(res.headers.get('set-cookie') ?? '')
    const cookie = `so_session=${m?.[1] ?? ''}`
    const me = await app.request('/api/me', { headers: { cookie } }, env)
    expect(await me.json()).toMatchObject({ email: 'newbie@seedwebs.com', role: 'member' })
  })

  it('email ภายนอกที่ไม่ถูก provision → เด้งกลับ /login?error=not_allowed', async () => {
    mockGoogle({ sub: 'g-x', email: 'rando@gmail.com', email_verified: true })
    const res = await callCallback()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/login?error=not_allowed')
  })

  it('vendor ใน allowlist → login ได้', async () => {
    mockGoogle({ sub: 'g-som', email: 'somchai@example.com', email_verified: true })
    const res = await callCallback()
    expect(res.headers.get('location')).toBe('/')
  })

  it('state ไม่ตรง → 400 (กัน CSRF)', async () => {
    const res = await app.request(
      '/api/auth/callback?code=c&state=WRONG',
      { headers: { cookie: 'so_oauth_state=st-123' } },
      env,
    )
    expect(res.status).toBe(400)
  })
})
