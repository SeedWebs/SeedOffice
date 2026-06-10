import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { resolveLoginUser, type GoogleProfile } from '../lib/auth-rules'
import { createSession, newToken, revokeSession, SESSION_COOKIE } from '../lib/session'
import type { AppEnv } from '../types'

const STATE_COOKIE = 'so_oauth_state'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'

const isHttps = (url: string) => url.startsWith('https://')

function setSessionCookie(c: Context<AppEnv>, token: string, expiresAt: Date) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isHttps(c.env.APP_URL),
    sameSite: 'Lax',
    path: '/',
    expires: expiresAt,
  })
}

export const authRoutes = new Hono<AppEnv>()

  // เริ่ม OAuth — redirect ไป Google
  .get('/google', (c) => {
    const state = newToken().slice(0, 32)
    setCookie(c, STATE_COOKIE, state, {
      httpOnly: true,
      secure: isHttps(c.env.APP_URL),
      sameSite: 'Lax',
      path: '/',
      maxAge: 600,
    })
    const params = new URLSearchParams({
      client_id: c.env.GOOGLE_CLIENT_ID,
      redirect_uri: `${c.env.APP_URL}/api/auth/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    })
    return c.redirect(`${GOOGLE_AUTH_URL}?${params}`)
  })

  // Google เด้งกลับ — แลก code → โปรไฟล์ → ตามกฎรับเข้า → session
  .get('/callback', async (c) => {
    const { code, state } = c.req.query()
    const stateCookie = getCookie(c, STATE_COOKIE)
    deleteCookie(c, STATE_COOKIE, { path: '/' })
    if (!code || !state || !stateCookie || state !== stateCookie)
      return c.json({ error: 'invalid_state' }, 400)

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${c.env.APP_URL}/api/auth/callback`,
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenRes.ok) return c.json({ error: 'token_exchange_failed' }, 401)
    const { access_token } = (await tokenRes.json()) as { access_token?: string }
    if (!access_token) return c.json({ error: 'token_exchange_failed' }, 401)

    const profileRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { authorization: `Bearer ${access_token}` },
    })
    if (!profileRes.ok) return c.json({ error: 'userinfo_failed' }, 401)
    const profile = (await profileRes.json()) as GoogleProfile & { email_verified?: boolean }
    if (!profile.email || profile.email_verified === false)
      return c.json({ error: 'email_not_verified' }, 403)

    const user = await resolveLoginUser(c.env, profile)
    if (!user) return c.redirect('/login?error=not_allowed')

    const { token, expiresAt } = await createSession(c.env, user.id)
    setSessionCookie(c, token, expiresAt)
    return c.redirect('/')
  })

  .post('/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE)
    if (token) await revokeSession(c.env, token)
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  // dev เท่านั้น (DEV_AUTH=1) — login เป็น user ที่ seed ไว้ ใช้ใน local/e2e · prod = 404
  .post('/dev-login', async (c) => {
    if (c.env.DEV_AUTH !== '1') return c.json({ error: 'not_found' }, 404)
    const body = z.object({ email: z.string().email() }).safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid_body' }, 400)
    const user = await resolveLoginUser(c.env, { sub: '', email: body.data.email })
    if (!user) return c.json({ error: 'not_allowed' }, 403)
    const { token, expiresAt } = await createSession(c.env, user.id)
    setSessionCookie(c, token, expiresAt)
    return c.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } })
  })
