import {
  calendarConnections,
  calendarEvents,
  createDb,
  inboxGoogleClients,
} from '@seedoffice/db'
import { and, eq, isNull } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { writeAudit } from '../lib/audit'
import { decryptSecret, encryptSecret } from '../lib/crypto'
import { syncCalendar } from '../lib/gcal-sync'
import { newToken } from '../lib/session'
import type { AppEnv } from '../types'

/**
 * เชื่อม Google Calendar เพื่อ sync ขาเข้า (SPEC §4.14 · E6) — owner เท่านั้น (mount ใน index.ts)
 * ใช้ OAuth client (Internal) ตัวเดียวกับอีเมลกลาง · scope calendar.readonly (อ่านอย่างเดียว)
 * refresh token เข้ารหัสก่อนเก็บ · ไม่หลุดออก response
 */

const GCAL_STATE_COOKIE = 'so_gcal_state'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

/** decode payload ของ id_token (มาจาก Google ตรงๆ ผ่าน TLS — ไม่ต้อง verify ลายเซ็น) */
function decodeIdToken(idToken: string | undefined): { sub?: string; email?: string } {
  const part = idToken?.split('.')[1]
  if (!part) return {}
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as {
      sub?: string
      email?: string
    }
  } catch {
    return {}
  }
}

/** waitUntil ถ้ามี executionCtx (production) — เทสต์ปล่อยให้จบเอง */
function runAfter(c: Context<AppEnv>, p: Promise<unknown>): void {
  try {
    c.executionCtx.waitUntil(p)
  } catch {
    void p.catch(() => {})
  }
}

export const calendarConnectRoutes = new Hono<AppEnv>()

  // รายการบัญชีที่เชื่อม + client ที่เลือกได้ (ไม่ส่ง refreshTokenEnc)
  .get('/', async (c) => {
    const db = createDb(c.env.DB)
    const connections = await db
      .select({
        id: calendarConnections.id,
        clientId: calendarConnections.clientId,
        googleEmail: calendarConnections.googleEmail,
        status: calendarConnections.status,
        lastSyncAt: calendarConnections.lastSyncAt,
        lastError: calendarConnections.lastError,
        connectedAt: calendarConnections.connectedAt,
      })
      .from(calendarConnections)
      .orderBy(calendarConnections.createdAt)
    const clients = await db
      .select({ id: inboxGoogleClients.id, label: inboxGoogleClients.label })
      .from(inboxGoogleClients)
      .where(isNull(inboxGoogleClients.deletedAt))
      .orderBy(inboxGoogleClients.label)
    return c.json({ connections, clients })
  })

  // เริ่มเชื่อม — redirect ไป Google (offline + consent การันตี refresh token)
  .get('/connect', async (c) => {
    const clientId = c.req.query('clientId')
    if (!clientId) return c.json({ error: 'client_required' }, 400)
    const db = createDb(c.env.DB)
    const [client] = await db
      .select({ clientId: inboxGoogleClients.clientId })
      .from(inboxGoogleClients)
      .where(and(eq(inboxGoogleClients.id, clientId), isNull(inboxGoogleClients.deletedAt)))
    if (!client) return c.json({ error: 'client_not_found' }, 404)

    const state = newToken().slice(0, 32)
    setCookie(c, GCAL_STATE_COOKIE, `${state}.${clientId}`, {
      httpOnly: true,
      secure: c.env.APP_URL.startsWith('https://'),
      sameSite: 'Lax',
      path: '/',
      maxAge: 600,
    })
    const params = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: `${c.env.APP_URL}/api/calendar-connect/callback`,
      response_type: 'code',
      scope: `openid email ${CALENDAR_SCOPE}`,
      access_type: 'offline',
      prompt: 'consent',
      state,
    })
    return c.redirect(`${GOOGLE_AUTH_URL}?${params}`)
  })

  // Google เด้งกลับ — แลก code → ยืนยัน scope ปฏิทิน → เก็บ token เข้ารหัส
  .get('/callback', async (c) => {
    const fail = (code: string) => c.redirect(`/admin?gcal_error=${code}`)
    const { code, state } = c.req.query()
    const stateCookie = getCookie(c, GCAL_STATE_COOKIE)
    deleteCookie(c, GCAL_STATE_COOKIE, { path: '/' })
    const [cookieState, clientRowId] = stateCookie?.split('.') ?? []
    if (!code || !state || !cookieState || state !== cookieState || !clientRowId)
      return c.json({ error: 'invalid_state' }, 400)

    const db = createDb(c.env.DB)
    const [client] = await db
      .select()
      .from(inboxGoogleClients)
      .where(and(eq(inboxGoogleClients.id, clientRowId), isNull(inboxGoogleClients.deletedAt)))
    if (!client) return fail('client_not_found')

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: client.clientId,
        client_secret: await decryptSecret(client.clientSecretEnc, c.env.INBOX_ENC_KEY),
        redirect_uri: `${c.env.APP_URL}/api/calendar-connect/callback`,
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenRes.ok) return fail('token_exchange')
    const token = (await tokenRes.json()) as {
      access_token?: string
      refresh_token?: string
      id_token?: string
      scope?: string
    }
    if (!token.access_token || !token.refresh_token) return fail('no_refresh_token')
    // ยืนยัน scope ปฏิทินถูก grant จริง (ผู้ใช้ติ๊กออกได้ตอน consent)
    if (!token.scope?.includes('calendar.readonly')) return fail('calendar_scope_denied')

    const { sub, email } = decodeIdToken(token.id_token)
    const refreshTokenEnc = await encryptSecret(token.refresh_token, c.env.INBOX_ENC_KEY)
    // เชื่อมบัญชีเดิมซ้ำ = อัปเดต (reconnect) ไม่สร้างใหม่
    const [existing] = sub
      ? await db
          .select({ id: calendarConnections.id })
          .from(calendarConnections)
          .where(eq(calendarConnections.googleAccountId, sub))
          .limit(1)
      : []
    let connId: string
    if (existing) {
      await db
        .update(calendarConnections)
        .set({
          clientId: clientRowId,
          googleEmail: email ?? null,
          refreshTokenEnc,
          status: 'connected',
          connectedAt: new Date(),
          lastError: null,
        })
        .where(eq(calendarConnections.id, existing.id))
      connId = existing.id
    } else {
      const [row] = await db
        .insert(calendarConnections)
        .values({
          clientId: clientRowId,
          googleEmail: email ?? null,
          googleAccountId: sub ?? null,
          refreshTokenEnc,
          status: 'connected',
          connectedAt: new Date(),
        })
        .returning({ id: calendarConnections.id })
      connId = row!.id
    }
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'gcal.connect',
      entity: 'calendar_connections',
      entityId: connId,
      meta: { email: email ?? null },
    })
    runAfter(c, syncCalendar(c.env, connId))
    return c.redirect('/admin?gcal=connected')
  })

  // sync เดี๋ยวนี้
  .post('/:id/sync', async (c) => {
    const db = createDb(c.env.DB)
    const [conn] = await db
      .select({ id: calendarConnections.id, status: calendarConnections.status })
      .from(calendarConnections)
      .where(eq(calendarConnections.id, c.req.param('id')))
    if (!conn) return c.json({ error: 'not_found' }, 404)
    if (conn.status !== 'connected') return c.json({ error: 'not_connected' }, 400)
    try {
      await syncCalendar(c.env, conn.id)
    } catch {
      return c.json({ error: 'sync_failed' }, 502)
    }
    const [state] = await db
      .select({ lastSyncAt: calendarConnections.lastSyncAt, lastError: calendarConnections.lastError })
      .from(calendarConnections)
      .where(eq(calendarConnections.id, conn.id))
    return c.json({ ok: true, ...state })
  })

  // ปลดการเชื่อม — ลบ connection + event ที่ sync เข้ามาทั้งหมด (ของ source=gcal)
  .delete('/:id', async (c) => {
    const db = createDb(c.env.DB)
    const [conn] = await db
      .select({ id: calendarConnections.id })
      .from(calendarConnections)
      .where(eq(calendarConnections.id, c.req.param('id')))
    if (!conn) return c.json({ error: 'not_found' }, 404)
    await db.delete(calendarEvents).where(eq(calendarEvents.source, 'gcal'))
    await db.delete(calendarConnections).where(eq(calendarConnections.id, conn.id))
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'gcal.disconnect',
      entity: 'calendar_connections',
      entityId: conn.id,
    })
    return c.json({ ok: true })
  })
