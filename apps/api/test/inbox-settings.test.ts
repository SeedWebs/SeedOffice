import { env } from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { decryptSecret } from '../src/lib/crypto'
import { loginAs, seedUsers } from './helpers'

const json = (cookie: string, body: unknown, method = 'POST') => ({
  method,
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

beforeEach(async () => {
  await seedUsers()
  for (const t of ['inbox_mailboxes', 'inbox_google_clients'])
    await env.DB.prepare(`DELETE FROM ${t}`).run()
})

/** เพิ่ม client + กล่อง 1 ชุดผ่าน API (เหมือน owner ทำจากหน้า ตั้งค่า) */
async function seedClientAndBox(cookie: string) {
  const client = (await (
    await app.request(
      '/api/inbox/clients',
      json(cookie, {
        label: 'บริษัท เอ',
        clientId: 'client-a.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-test-secret-a',
      }),
      env,
    )
  ).json()) as { id: string }
  const box = (await (
    await app.request(
      '/api/inbox/mailboxes',
      json(cookie, { clientId: client.id, companyLabel: 'บริษัท เอ', name: 'ฝ่ายซัพพอร์ต' }),
      env,
    )
  ).json()) as { id: string; status: string }
  return { client, box }
}

describe('E1 — permission: ตั้งค่าอีเมลกลาง = owner เท่านั้น', () => {
  it('member/vendor โดน 403 ทุก endpoint · owner ผ่าน', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const member = await loginAs(app, 'pond@example-co.test')
    const vendor = await loginAs(app, 'somchai@example.com')
    for (const cookie of [member, vendor]) {
      expect((await app.request('/api/inbox/settings', { headers: { cookie } }, env)).status).toBe(403)
      expect(
        (await app.request('/api/inbox/clients', json(cookie, { label: 'x' }), env)).status,
      ).toBe(403)
      expect(
        (await app.request('/api/inbox/mailboxes', json(cookie, { name: 'x' }), env)).status,
      ).toBe(403)
      expect(
        (await app.request('/api/inbox/mailboxes/xx/connect', { headers: { cookie } }, env)).status,
      ).toBe(403)
      expect(
        (await app.request('/api/inbox/google/callback?code=c&state=s', { headers: { cookie } }, env))
          .status,
      ).toBe(403)
    }
    const res = await app.request('/api/inbox/settings', { headers: { cookie: owner } }, env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ clients: [], mailboxes: [] })
  })

  it('ไม่ login → 401', async () => {
    expect((await app.request('/api/inbox/settings', {}, env)).status).toBe(401)
  })
})

describe('E1 — Google clients (เพิ่ม/ลบ ผ่าน ตั้งค่า — secret เข้ารหัส ไม่หลุด)', () => {
  it('เพิ่ม client → เก็บ secret แบบเข้ารหัส + ไม่มี plaintext/ciphertext ใน response ใดๆ', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const { client } = await seedClientAndBox(owner)
    expect(client.id).toBeTruthy()

    const settings = await app.request('/api/inbox/settings', { headers: { cookie: owner } }, env)
    const text = await settings.text()
    expect(text).toContain('client-a.apps.googleusercontent.com') // clientId ไม่ลับ — โชว์ได้
    expect(text).not.toContain('GOCSPX-test-secret-a')
    expect(text).not.toContain('clientSecret')
    expect(text).not.toContain('refreshToken')

    const row = await env.DB.prepare('SELECT client_secret_enc FROM inbox_google_clients').first<{
      client_secret_enc: string
    }>()
    expect(row?.client_secret_enc).not.toContain('GOCSPX-test-secret-a')
    expect(await decryptSecret(row!.client_secret_enc, env.INBOX_ENC_KEY)).toBe(
      'GOCSPX-test-secret-a',
    )
  })

  it('body ไม่ครบ → 400', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const res = await app.request('/api/inbox/clients', json(owner, { label: 'ไม่มี id' }), env)
    expect(res.status).toBe(400)
  })

  it('ลบ client ที่มีกล่องใช้อยู่ → 409 · ปิดกล่องก่อนแล้วลบได้ (soft-delete)', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const { client, box } = await seedClientAndBox(owner)

    const blocked = await app.request(
      `/api/inbox/clients/${client.id}`,
      { method: 'DELETE', headers: { cookie: owner } },
      env,
    )
    expect(blocked.status).toBe(409)
    expect(await blocked.json()).toEqual({ error: 'client_in_use' })

    await app.request(`/api/inbox/mailboxes/${box.id}/disable`, json(owner, {}), env)
    const ok = await app.request(
      `/api/inbox/clients/${client.id}`,
      { method: 'DELETE', headers: { cookie: owner } },
      env,
    )
    expect(ok.status).toBe(200)

    // soft-delete: หายจาก settings แต่แถวยังอยู่ (deleted_at ไม่ null)
    const settings = (await (
      await app.request('/api/inbox/settings', { headers: { cookie: owner } }, env)
    ).json()) as { clients: unknown[] }
    expect(settings.clients).toHaveLength(0)
    const row = await env.DB.prepare(
      'SELECT deleted_at FROM inbox_google_clients WHERE id = ?',
    )
      .bind(client.id)
      .first<{ deleted_at: number | null }>()
    expect(row?.deleted_at).not.toBeNull()
  })
})

describe('E1 — mailboxes (สร้าง/แก้/ปิด-เปิด)', () => {
  it('สร้างกล่อง → status=disconnected · client มั่ว → 404 · patch ชื่อได้', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const { box } = await seedClientAndBox(owner)
    expect(box.status).toBe('disconnected')

    const bad = await app.request(
      '/api/inbox/mailboxes',
      json(owner, { clientId: 'ghost', companyLabel: 'x', name: 'x' }),
      env,
    )
    expect(bad.status).toBe(404)

    const patched = await app.request(
      `/api/inbox/mailboxes/${box.id}`,
      json(owner, { name: 'ฝ่ายบัญชี' }, 'PATCH'),
      env,
    )
    expect(patched.status).toBe(200)
    const empty = await app.request(`/api/inbox/mailboxes/${box.id}`, json(owner, {}, 'PATCH'), env)
    expect(empty.status).toBe(400)
  })

  it('ย้ายกล่องไป client ใหม่ได้ (กันค้างกับ client ที่ถูกลบ) · client มั่ว → 404', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const { box } = await seedClientAndBox(owner)
    const client2 = (await (
      await app.request(
        '/api/inbox/clients',
        json(owner, {
          label: 'บริษัท บี',
          clientId: 'client-b.apps.googleusercontent.com',
          clientSecret: 'GOCSPX-test-secret-b',
        }),
        env,
      )
    ).json()) as { id: string }
    const moved = await app.request(
      `/api/inbox/mailboxes/${box.id}`,
      json(owner, { clientId: client2.id }, 'PATCH'),
      env,
    )
    expect(moved.status).toBe(200)
    const row = await env.DB.prepare('SELECT client_id FROM inbox_mailboxes WHERE id = ?')
      .bind(box.id)
      .first<{ client_id: string }>()
    expect(row?.client_id).toBe(client2.id)

    const ghost = await app.request(
      `/api/inbox/mailboxes/${box.id}`,
      json(owner, { clientId: 'ghost' }, 'PATCH'),
      env,
    )
    expect(ghost.status).toBe(404)
  })

  it('disable → disabled · enable โดยยังไม่มี token → disconnected', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const { box } = await seedClientAndBox(owner)
    await app.request(`/api/inbox/mailboxes/${box.id}/disable`, json(owner, {}), env)
    let row = await env.DB.prepare('SELECT status FROM inbox_mailboxes WHERE id = ?')
      .bind(box.id)
      .first<{ status: string }>()
    expect(row?.status).toBe('disabled')

    const enabled = await app.request(`/api/inbox/mailboxes/${box.id}/enable`, json(owner, {}), env)
    expect(await enabled.json()).toEqual({ ok: true, status: 'disconnected' })
    row = await env.DB.prepare('SELECT status FROM inbox_mailboxes WHERE id = ?')
      .bind(box.id)
      .first<{ status: string }>()
    expect(row?.status).toBe('disconnected')
  })
})

describe('E1 — connect: redirect ไป Google ถูกต้อง', () => {
  it('302 ไป accounts.google.com พร้อม scope/offline/consent + state cookie', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const { box } = await seedClientAndBox(owner)
    const res = await app.request(
      `/api/inbox/mailboxes/${box.id}/connect`,
      { headers: { cookie: owner } },
      env,
    )
    expect(res.status).toBe(302)
    const loc = new URL(res.headers.get('location') ?? '')
    expect(loc.origin + loc.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(loc.searchParams.get('client_id')).toBe('client-a.apps.googleusercontent.com')
    expect(loc.searchParams.get('scope')).toBe(
      'openid email https://www.googleapis.com/auth/gmail.modify',
    )
    expect(loc.searchParams.get('access_type')).toBe('offline')
    expect(loc.searchParams.get('prompt')).toBe('consent')
    expect(loc.searchParams.get('redirect_uri')).toBe(
      'http://localhost:5173/api/inbox/google/callback',
    )
    const state = loc.searchParams.get('state')
    expect(state).toBeTruthy()
    expect(res.headers.get('set-cookie')).toContain(`so_inbox_state=${state}.${box.id}`)
  })

  it('กล่อง disabled → 400 · กล่องไม่มี → 404', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const { box } = await seedClientAndBox(owner)
    await app.request(`/api/inbox/mailboxes/${box.id}/disable`, json(owner, {}), env)
    expect(
      (await app.request(`/api/inbox/mailboxes/${box.id}/connect`, { headers: { cookie: owner } }, env))
        .status,
    ).toBe(400)
    expect(
      (await app.request('/api/inbox/mailboxes/ghost/connect', { headers: { cookie: owner } }, env))
        .status,
    ).toBe(404)
  })
})

describe('E1 — callback (mock Google)', () => {
  afterEach(() => vi.unstubAllGlobals())

  const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const fakeIdToken = (sub: string) => `h.${b64url(JSON.stringify({ sub }))}.sig`

  function mockGoogle(opts: {
    refreshToken?: string | null
    profileEmail?: string
    profileStatus?: number
  }) {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.startsWith('https://oauth2.googleapis.com/token'))
        return Response.json({
          access_token: 'at-test',
          ...(opts.refreshToken === null ? {} : { refresh_token: opts.refreshToken ?? 'rt-test' }),
          id_token: fakeIdToken('g-acc-1'),
        })
      if (url.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/profile'))
        return opts.profileStatus
          ? new Response('denied', { status: opts.profileStatus })
          : Response.json({ emailAddress: opts.profileEmail ?? 'support@brand-a.test' })
      throw new Error(`unexpected fetch in test: ${url}`)
    })
  }

  function callCallback(ownerCookie: string, boxId: string) {
    return app.request(
      '/api/inbox/google/callback?code=test-code&state=st-123',
      { headers: { cookie: `${ownerCookie}; so_inbox_state=st-123.${boxId}` } },
      env,
    )
  }

  it('happy path: เชื่อมสำเร็จ — email จากบัญชีจริง + token เข้ารหัสลง D1 + redirect กลับ ตั้งค่า', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const { box } = await seedClientAndBox(owner)
    mockGoogle({ refreshToken: 'rt-secret-1' })

    const res = await callCallback(owner, box.id)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/admin?inbox=connected')

    const row = await env.DB.prepare(
      'SELECT email_address, gmail_account_id, refresh_token_enc, status FROM inbox_mailboxes WHERE id = ?',
    )
      .bind(box.id)
      .first<{
        email_address: string
        gmail_account_id: string
        refresh_token_enc: string
        status: string
      }>()
    expect(row?.status).toBe('connected')
    expect(row?.email_address).toBe('support@brand-a.test')
    expect(row?.gmail_account_id).toBe('g-acc-1')
    expect(row?.refresh_token_enc).not.toContain('rt-secret-1')
    expect(await decryptSecret(row!.refresh_token_enc, env.INBOX_ENC_KEY)).toBe('rt-secret-1')
  })

  it('ไม่ได้ refresh token → error ไม่บันทึกอะไร', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const { box } = await seedClientAndBox(owner)
    mockGoogle({ refreshToken: null })
    const res = await callCallback(owner, box.id)
    expect(res.headers.get('location')).toBe('/admin?inbox_error=no_refresh_token')
    const row = await env.DB.prepare('SELECT status FROM inbox_mailboxes WHERE id = ?')
      .bind(box.id)
      .first<{ status: string }>()
    expect(row?.status).toBe('disconnected')
  })

  it('user เอา scope gmail ออกตอน consent → gmail_scope_denied', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const { box } = await seedClientAndBox(owner)
    mockGoogle({ profileStatus: 403 })
    const res = await callCallback(owner, box.id)
    expect(res.headers.get('location')).toBe('/admin?inbox_error=gmail_scope_denied')
  })

  it('state ไม่ตรง cookie → 400 (กัน CSRF)', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const { box } = await seedClientAndBox(owner)
    mockGoogle({})
    const res = await app.request(
      '/api/inbox/google/callback?code=c&state=st-WRONG',
      { headers: { cookie: `${owner}; so_inbox_state=st-123.${box.id}` } },
      env,
    )
    expect(res.status).toBe(400)
  })

  it('บัญชี Gmail เดิมถูกเชื่อมอยู่แล้วในกล่องอื่น → already_connected', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const { client, box } = await seedClientAndBox(owner)
    mockGoogle({})
    await callCallback(owner, box.id)

    const box2 = (await (
      await app.request(
        '/api/inbox/mailboxes',
        json(owner, { clientId: client.id, companyLabel: 'บริษัท เอ', name: 'กล่องสอง' }),
        env,
      )
    ).json()) as { id: string }
    const res = await callCallback(owner, box2.id)
    expect(res.headers.get('location')).toBe('/admin?inbox_error=already_connected')
  })

  it('เชื่อมใหม่กล่องเดิม (reconnect) → อัปเดต token ได้ ไม่ติด dup ตัวเอง', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const { box } = await seedClientAndBox(owner)
    mockGoogle({ refreshToken: 'rt-old' })
    await callCallback(owner, box.id)
    vi.unstubAllGlobals()
    mockGoogle({ refreshToken: 'rt-new' })
    const res = await callCallback(owner, box.id)
    expect(res.headers.get('location')).toBe('/admin?inbox=connected')
    const row = await env.DB.prepare('SELECT refresh_token_enc FROM inbox_mailboxes WHERE id = ?')
      .bind(box.id)
      .first<{ refresh_token_enc: string }>()
    expect(await decryptSecret(row!.refresh_token_enc, env.INBOX_ENC_KEY)).toBe('rt-new')
  })
})
