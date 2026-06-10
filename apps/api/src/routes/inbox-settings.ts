import { createDb, inboxGoogleClients, inboxMailboxes } from '@seedoffice/db'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { writeAudit } from '../lib/audit'
import { decryptSecret, encryptSecret } from '../lib/crypto'
import { newToken } from '../lib/session'
import type { AppEnv } from '../types'

/**
 * อีเมลกลาง — การติดตั้ง (SPEC §4.12 · E1) — owner เท่านั้น (mount ใน index.ts)
 * หลักสำคัญ: ทุกอย่างเป็น data ใน D1 ไม่มีอีเมล/credential ในโค้ด (repo public)
 * secret/refresh token เข้ารหัส AES-GCM ก่อนเก็บ และห้ามหลุดออกทาง response ใดๆ
 */

const INBOX_STATE_COOKIE = 'so_inbox_state'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_PROFILE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/profile'
// scope เดียวครอบ read + labels + send (restricted — client ต้องเป็นแบบ Internal, ดู SPEC §5)
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify'

const clientBody = z.object({
  label: z.string().trim().min(1).max(100),
  clientId: z.string().trim().min(10).max(200),
  clientSecret: z.string().trim().min(10).max(200),
})

const mailboxBody = z.object({
  clientId: z.string().min(1),
  companyLabel: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(100),
})

// เปลี่ยน client ได้ด้วย — กันกล่องค้างกับ client ที่ถูกลบ (soft) ไปแล้ว
const mailboxPatch = z
  .object({
    companyLabel: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(100),
    clientId: z.string().min(1),
  })
  .partial()

/** id_token มาจาก token endpoint ของ Google ตรงๆ (TLS) — decode payload ได้โดยไม่ต้อง verify ลายเซ็น */
function decodeJwtSub(idToken: string | undefined): string | null {
  const part = idToken?.split('.')[1]
  if (!part) return null
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as {
      sub?: string
    }
    return payload.sub ?? null
  } catch {
    return null
  }
}

export const inboxSettingsRoutes = new Hono<AppEnv>()

  // ภาพรวมการติดตั้ง — ไม่ส่ง clientSecretEnc / refreshTokenEnc เด็ดขาด
  .get('/settings', async (c) => {
    const db = createDb(c.env.DB)
    const clients = await db
      .select({
        id: inboxGoogleClients.id,
        label: inboxGoogleClients.label,
        clientId: inboxGoogleClients.clientId,
        createdAt: inboxGoogleClients.createdAt,
      })
      .from(inboxGoogleClients)
      .where(isNull(inboxGoogleClients.deletedAt))
      .orderBy(inboxGoogleClients.label)
    const mailboxes = await db
      .select({
        id: inboxMailboxes.id,
        clientId: inboxMailboxes.clientId,
        companyLabel: inboxMailboxes.companyLabel,
        name: inboxMailboxes.name,
        emailAddress: inboxMailboxes.emailAddress,
        status: inboxMailboxes.status,
        connectedAt: inboxMailboxes.connectedAt,
      })
      .from(inboxMailboxes)
      .orderBy(inboxMailboxes.companyLabel, inboxMailboxes.name)
    return c.json({ clients, mailboxes })
  })

  .post('/clients', async (c) => {
    const body = clientBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'invalid_body' }, 400)
    const db = createDb(c.env.DB)
    const [row] = await db
      .insert(inboxGoogleClients)
      .values({
        label: body.data.label,
        clientId: body.data.clientId,
        clientSecretEnc: await encryptSecret(body.data.clientSecret, c.env.INBOX_ENC_KEY),
      })
      .returning({
        id: inboxGoogleClients.id,
        label: inboxGoogleClients.label,
        clientId: inboxGoogleClients.clientId,
      })
    if (!row) return c.json({ error: 'insert_failed' }, 500)
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'inbox_client.create',
      entity: 'inbox_google_clients',
      entityId: row.id,
      meta: { label: row.label },
    })
    return c.json(row, 201)
  })

  // soft-delete — ห้ามลบถ้ายังมีกล่อง (ที่ไม่ถูกปิด) ใช้อยู่
  .delete('/clients/:id', async (c) => {
    const id = c.req.param('id')
    const db = createDb(c.env.DB)
    const [client] = await db
      .select({ id: inboxGoogleClients.id, label: inboxGoogleClients.label })
      .from(inboxGoogleClients)
      .where(and(eq(inboxGoogleClients.id, id), isNull(inboxGoogleClients.deletedAt)))
    if (!client) return c.json({ error: 'not_found' }, 404)
    const [inUse] = await db
      .select({ id: inboxMailboxes.id })
      .from(inboxMailboxes)
      .where(and(eq(inboxMailboxes.clientId, id), ne(inboxMailboxes.status, 'disabled')))
      .limit(1)
    if (inUse) return c.json({ error: 'client_in_use' }, 409)
    await db
      .update(inboxGoogleClients)
      .set({ deletedAt: new Date() })
      .where(eq(inboxGoogleClients.id, id))
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'inbox_client.delete',
      entity: 'inbox_google_clients',
      entityId: id,
      meta: { label: client.label },
    })
    return c.json({ ok: true })
  })

  .post('/mailboxes', async (c) => {
    const body = mailboxBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'invalid_body' }, 400)
    const db = createDb(c.env.DB)
    const [client] = await db
      .select({ id: inboxGoogleClients.id })
      .from(inboxGoogleClients)
      .where(and(eq(inboxGoogleClients.id, body.data.clientId), isNull(inboxGoogleClients.deletedAt)))
    if (!client) return c.json({ error: 'client_not_found' }, 404)
    const [row] = await db
      .insert(inboxMailboxes)
      .values(body.data)
      .returning({
        id: inboxMailboxes.id,
        companyLabel: inboxMailboxes.companyLabel,
        name: inboxMailboxes.name,
        status: inboxMailboxes.status,
      })
    if (!row) return c.json({ error: 'insert_failed' }, 500)
    return c.json(row, 201)
  })

  .patch('/mailboxes/:id', async (c) => {
    const body = mailboxPatch.safeParse(await c.req.json().catch(() => null))
    if (!body.success || Object.keys(body.data).length === 0)
      return c.json({ error: 'invalid_body' }, 400)
    const db = createDb(c.env.DB)
    if (body.data.clientId) {
      const [client] = await db
        .select({ id: inboxGoogleClients.id })
        .from(inboxGoogleClients)
        .where(
          and(eq(inboxGoogleClients.id, body.data.clientId), isNull(inboxGoogleClients.deletedAt)),
        )
      if (!client) return c.json({ error: 'client_not_found' }, 404)
    }
    const updated = await db
      .update(inboxMailboxes)
      .set(body.data)
      .where(eq(inboxMailboxes.id, c.req.param('id')))
      .returning({ id: inboxMailboxes.id })
    if (updated.length === 0) return c.json({ error: 'not_found' }, 404)
    return c.json({ ok: true })
  })

  // ปิดกล่อง (soft — เก็บ token ไว้ เผื่อเปิดกลับ) / เปิดกลับ
  .post('/mailboxes/:id/disable', async (c) => {
    const db = createDb(c.env.DB)
    const updated = await db
      .update(inboxMailboxes)
      .set({ status: 'disabled' })
      .where(eq(inboxMailboxes.id, c.req.param('id')))
      .returning({ id: inboxMailboxes.id })
    if (updated.length === 0) return c.json({ error: 'not_found' }, 404)
    return c.json({ ok: true })
  })

  .post('/mailboxes/:id/enable', async (c) => {
    const db = createDb(c.env.DB)
    const [box] = await db
      .select({ id: inboxMailboxes.id, refreshTokenEnc: inboxMailboxes.refreshTokenEnc })
      .from(inboxMailboxes)
      .where(eq(inboxMailboxes.id, c.req.param('id')))
    if (!box) return c.json({ error: 'not_found' }, 404)
    const status = box.refreshTokenEnc ? 'connected' : 'disconnected'
    await db.update(inboxMailboxes).set({ status }).where(eq(inboxMailboxes.id, box.id))
    return c.json({ ok: true, status })
  })

  // เริ่มเชื่อม Gmail — redirect ไป Google (offline + consent การันตี refresh token)
  .get('/mailboxes/:id/connect', async (c) => {
    const db = createDb(c.env.DB)
    const [box] = await db
      .select()
      .from(inboxMailboxes)
      .where(eq(inboxMailboxes.id, c.req.param('id')))
    if (!box) return c.json({ error: 'not_found' }, 404)
    if (box.status === 'disabled') return c.json({ error: 'mailbox_disabled' }, 400)
    const [client] = await db
      .select({ clientId: inboxGoogleClients.clientId })
      .from(inboxGoogleClients)
      .where(and(eq(inboxGoogleClients.id, box.clientId), isNull(inboxGoogleClients.deletedAt)))
    if (!client) return c.json({ error: 'client_not_found' }, 404)

    const state = newToken().slice(0, 32)
    setCookie(c, INBOX_STATE_COOKIE, `${state}.${box.id}`, {
      httpOnly: true,
      secure: c.env.APP_URL.startsWith('https://'),
      sameSite: 'Lax',
      path: '/',
      maxAge: 600,
    })
    const params = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: `${c.env.APP_URL}/api/inbox/google/callback`,
      response_type: 'code',
      scope: `openid email ${GMAIL_SCOPE}`,
      access_type: 'offline',
      prompt: 'consent',
      state,
    })
    if (box.emailAddress) params.set('login_hint', box.emailAddress)
    return c.redirect(`${GOOGLE_AUTH_URL}?${params}`)
  })

  // Google เด้งกลับ — แลก code → ยืนยัน scope ผ่าน Gmail profile → เก็บ token เข้ารหัส
  .get('/google/callback', async (c) => {
    const fail = (code: string) => c.redirect(`/admin?inbox_error=${code}`)
    const { code, state } = c.req.query()
    const stateCookie = getCookie(c, INBOX_STATE_COOKIE)
    deleteCookie(c, INBOX_STATE_COOKIE, { path: '/' })
    const [cookieState, mailboxId] = stateCookie?.split('.') ?? []
    if (!code || !state || !cookieState || state !== cookieState || !mailboxId)
      return c.json({ error: 'invalid_state' }, 400)

    const db = createDb(c.env.DB)
    const [box] = await db.select().from(inboxMailboxes).where(eq(inboxMailboxes.id, mailboxId))
    if (!box || box.status === 'disabled') return fail('mailbox_not_found')
    const [client] = await db
      .select()
      .from(inboxGoogleClients)
      .where(and(eq(inboxGoogleClients.id, box.clientId), isNull(inboxGoogleClients.deletedAt)))
    if (!client) return fail('client_not_found')

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: client.clientId,
        client_secret: await decryptSecret(client.clientSecretEnc, c.env.INBOX_ENC_KEY),
        redirect_uri: `${c.env.APP_URL}/api/inbox/google/callback`,
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenRes.ok) return fail('token_exchange')
    const token = (await tokenRes.json()) as {
      access_token?: string
      refresh_token?: string
      id_token?: string
    }
    if (!token.access_token) return fail('token_exchange')
    // ไม่มี refresh token = เชื่อมต่อระยะยาวไม่ได้ (ไม่ควรเกิดเพราะ prompt=consent)
    if (!token.refresh_token) return fail('no_refresh_token')

    // ยืนยันว่า scope gmail.modify ถูก grant จริง (ผู้ใช้กดเอาออกตอน consent ได้)
    const profileRes = await fetch(GMAIL_PROFILE_URL, {
      headers: { authorization: `Bearer ${token.access_token}` },
    })
    if (!profileRes.ok) return fail('gmail_scope_denied')
    const profile = (await profileRes.json()) as { emailAddress?: string }
    if (!profile.emailAddress) return fail('gmail_scope_denied')

    // กันเชื่อมบัญชี Gmail เดียวกันซ้ำเข้าหลายกล่อง
    const [dup] = await db
      .select({ id: inboxMailboxes.id })
      .from(inboxMailboxes)
      .where(
        and(
          eq(inboxMailboxes.emailAddress, profile.emailAddress),
          eq(inboxMailboxes.status, 'connected'),
          ne(inboxMailboxes.id, box.id),
        ),
      )
      .limit(1)
    if (dup) return fail('already_connected')

    await db
      .update(inboxMailboxes)
      .set({
        emailAddress: profile.emailAddress,
        gmailAccountId: decodeJwtSub(token.id_token) ?? profile.emailAddress,
        refreshTokenEnc: await encryptSecret(token.refresh_token, c.env.INBOX_ENC_KEY),
        status: 'connected',
        connectedAt: new Date(),
      })
      .where(eq(inboxMailboxes.id, box.id))
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'inbox_mailbox.connect',
      entity: 'inbox_mailboxes',
      entityId: box.id,
      meta: { emailAddress: profile.emailAddress },
    })
    return c.redirect('/admin?inbox=connected')
  })
