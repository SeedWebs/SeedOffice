import {
  clients,
  createDb,
  inboxAttachments,
  inboxGoogleClients,
  inboxMailboxes,
  inboxMessages,
  inboxThreads,
  users,
} from '@seedoffice/db'
import { and, desc, eq, isNull, like, ne, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { writeAudit } from '../lib/audit'
import { decryptSecret } from '../lib/crypto'
import { extractEmail } from '../lib/gmail'
import { getAccessToken, ReconnectError } from '../lib/inbox-sync'
import { buildMime, formatAddress, replySubject, toBase64Url } from '../lib/mime'
import type { AppEnv } from '../types'

/**
 * อีเมลกลาง — ใช้งาน inbox (SPEC §4.12 · E3) — owner+member (vendor ❌ mount ใน index.ts)
 * folder = derived: unassigned/mine/assigned (เฉพาะ open) · closed · spam · all = ทุกสถานะ
 * เลขที่ของ thread = rowid (ไม่ลบ thread จึงไม่ซ้ำ) · เปิด detail = mark read
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

const FOLDERS = ['unassigned', 'mine', 'drafts', 'assigned', 'closed', 'spam', 'all'] as const

const listQuery = z.object({
  mailbox: z.string().optional(), // ไม่ส่ง = ทั้งหมด
  folder: z.enum(FOLDERS).default('unassigned'),
  q: z.string().trim().max(200).optional(),
})

const patchBody = z
  .object({
    status: z.enum(['open', 'closed', 'spam']),
    assigneeId: z.string().nullable(),
    unread: z.boolean(),
  })
  .partial()

export const inboxThreadRoutes = new Hono<AppEnv>()

  .get('/threads', async (c) => {
    const parsed = listQuery.safeParse(c.req.query())
    if (!parsed.success) return c.json({ error: 'invalid_query' }, 400)
    const { mailbox, folder, q } = parsed.data
    const me = c.get('user')
    const db = createDb(c.env.DB)

    // ตัวเลือกกล่อง + unread badge (นับเฉพาะ open ที่ยังไม่อ่าน)
    const mailboxes = await db
      .select({
        id: inboxMailboxes.id,
        name: inboxMailboxes.name,
        companyLabel: inboxMailboxes.companyLabel,
        emailAddress: inboxMailboxes.emailAddress,
        status: inboxMailboxes.status,
        unread: sql<number>`(SELECT COUNT(*) FROM inbox_threads t
          WHERE t.mailbox_id = inbox_mailboxes.id AND t.unread = 1 AND t.status = 'open')`,
      })
      .from(inboxMailboxes)
      .where(ne(inboxMailboxes.status, 'disabled'))
      .orderBy(inboxMailboxes.companyLabel, inboxMailboxes.name)

    const mbCond = mailbox ? eq(inboxThreads.mailboxId, mailbox) : undefined

    const [counts] = await db
      .select({
        unassigned: sql<number>`COALESCE(SUM(CASE WHEN status='open' AND assignee_id IS NULL THEN 1 ELSE 0 END), 0)`,
        mine: sql<number>`COALESCE(SUM(CASE WHEN status='open' AND assignee_id = ${me.id} THEN 1 ELSE 0 END), 0)`,
        assigned: sql<number>`COALESCE(SUM(CASE WHEN status='open' AND assignee_id IS NOT NULL THEN 1 ELSE 0 END), 0)`,
        closed: sql<number>`COALESCE(SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END), 0)`,
        spam: sql<number>`COALESCE(SUM(CASE WHEN status='spam' THEN 1 ELSE 0 END), 0)`,
        all: sql<number>`COUNT(*)`,
      })
      .from(inboxThreads)
      .where(mbCond)

    const folderCond = {
      unassigned: and(eq(inboxThreads.status, 'open'), isNull(inboxThreads.assigneeId)),
      mine: and(eq(inboxThreads.status, 'open'), eq(inboxThreads.assigneeId, me.id)),
      drafts: sql`0 = 1`, // [E4] ฉบับร่าง — ยังไม่มี
      assigned: and(eq(inboxThreads.status, 'open'), sql`assignee_id IS NOT NULL`),
      closed: eq(inboxThreads.status, 'closed'),
      spam: eq(inboxThreads.status, 'spam'),
      all: undefined,
    }[folder]

    const qCond = q
      ? or(like(inboxThreads.subject, `%${q}%`), like(inboxThreads.contactEmail, `%${q}%`))
      : undefined

    const threads = await db
      .select({
        id: inboxThreads.id,
        number: sql<number>`rowid`,
        mailboxId: inboxThreads.mailboxId,
        subject: inboxThreads.subject,
        contactEmail: inboxThreads.contactEmail,
        status: inboxThreads.status,
        unread: inboxThreads.unread,
        assigneeId: inboxThreads.assigneeId,
        lastMessageAt: inboxThreads.lastMessageAt,
        preview: sql<string | null>`(SELECT snippet FROM inbox_messages m
          WHERE m.thread_id = inbox_threads.id ORDER BY m.sent_at DESC LIMIT 1)`,
        latestFrom: sql<string | null>`(SELECT from_addr FROM inbox_messages m
          WHERE m.thread_id = inbox_threads.id AND m.direction = 'in' ORDER BY m.sent_at DESC LIMIT 1)`,
        hasAttachment: sql<number>`EXISTS(SELECT 1 FROM inbox_attachments a
          JOIN inbox_messages m ON a.message_id = m.id WHERE m.thread_id = inbox_threads.id)`,
      })
      .from(inboxThreads)
      .where(and(mbCond, folderCond, qCond))
      .orderBy(desc(inboxThreads.lastMessageAt))
      .limit(100)

    return c.json({ threads, counts: { ...counts, drafts: 0 }, mailboxes })
  })

  // detail — เปิดแล้วถือว่าอ่าน (mark read) + แนบ body จาก R2 + การ์ดลูกค้า + อีเมลที่ผ่านมา
  .get('/threads/:id', async (c) => {
    const db = createDb(c.env.DB)
    const id = c.req.param('id')
    const [thread] = await db
      .select({
        id: inboxThreads.id,
        number: sql<number>`rowid`,
        mailboxId: inboxThreads.mailboxId,
        subject: inboxThreads.subject,
        contactEmail: inboxThreads.contactEmail,
        status: inboxThreads.status,
        unread: inboxThreads.unread,
        assigneeId: inboxThreads.assigneeId,
        lastMessageAt: inboxThreads.lastMessageAt,
      })
      .from(inboxThreads)
      .where(eq(inboxThreads.id, id))
    if (!thread) return c.json({ error: 'not_found' }, 404)

    if (thread.unread)
      await db.update(inboxThreads).set({ unread: false }).where(eq(inboxThreads.id, id))

    const messages = await db
      .select()
      .from(inboxMessages)
      .where(eq(inboxMessages.threadId, id))
      .orderBy(inboxMessages.sentAt)
    const atts = messages.length
      ? await db
          .select()
          .from(inboxAttachments)
          .where(
            sql`${inboxAttachments.messageId} IN (SELECT id FROM inbox_messages WHERE thread_id = ${id})`,
          )
      : []

    // body จาก R2 (thread ปกติสั้น — โหลดหมดทีเดียว)
    const withBody = await Promise.all(
      messages.map(async (m) => {
        let body: { content: string; contentType: string } | null = null
        if (m.bodyKey) {
          const obj = await c.env.FILES.get(m.bodyKey)
          if (obj)
            body = {
              content: await obj.text(),
              contentType: obj.httpMetadata?.contentType ?? 'text/plain',
            }
        }
        return {
          id: m.id,
          direction: m.direction,
          fromAddr: m.fromAddr,
          toAddr: m.toAddr,
          ccAddr: m.ccAddr,
          snippet: m.snippet,
          sentAt: m.sentAt,
          body,
          attachments: atts
            .filter((a) => a.messageId === m.id)
            .map((a) => ({
              id: a.id,
              filename: a.filename,
              mime: a.mime,
              sizeBytes: a.sizeBytes,
            })),
        }
      }),
    )

    // การ์ดลูกค้า: เทียบ contactEmail กับ CRM
    const client = thread.contactEmail
      ? ((await db
          .select({ id: clients.id, name: clients.name, logo: clients.logo })
          .from(clients)
          .where(eq(clients.contactEmail, thread.contactEmail))
          .limit(1))[0] ?? null)
      : null

    // อีเมลที่ผ่านมา (thread อื่นของ contact เดียวกัน)
    const past: { items: { id: string; subject: string; lastMessageAt: Date }[]; total: number } = {
      items: [],
      total: 0,
    }
    if (thread.contactEmail) {
      const cond = and(
        eq(inboxThreads.contactEmail, thread.contactEmail),
        ne(inboxThreads.id, thread.id),
      )
      past.items = await db
        .select({
          id: inboxThreads.id,
          subject: inboxThreads.subject,
          lastMessageAt: inboxThreads.lastMessageAt,
        })
        .from(inboxThreads)
        .where(cond)
        .orderBy(desc(inboxThreads.lastMessageAt))
        .limit(5)
      const [t] = await db.select({ n: sql<number>`COUNT(*)` }).from(inboxThreads).where(cond)
      past.total = t?.n ?? 0
    }

    return c.json({ thread: { ...thread, unread: false }, messages: withBody, client, past })
  })

  // เปลี่ยนสถานะ / มอบหมาย / mark unread — owner+member (SPEC §3: อีเมลกลาง R/W ทั้งทีม)
  .patch('/threads/:id', async (c) => {
    const body = patchBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success || Object.keys(body.data).length === 0)
      return c.json({ error: 'invalid_body' }, 400)
    const db = createDb(c.env.DB)

    if (body.data.assigneeId) {
      const [assignee] = await db
        .select({ id: users.id, role: users.role, status: users.status })
        .from(users)
        .where(eq(users.id, body.data.assigneeId))
      // vendor ไม่เห็นอีเมลกลาง — มอบหมายให้ไม่ได้
      if (!assignee || assignee.status !== 'active' || assignee.role === 'vendor')
        return c.json({ error: 'invalid_assignee' }, 400)
    }

    const updated = await db
      .update(inboxThreads)
      .set({
        ...body.data,
        // เปลี่ยนสถานะ = จัดการแล้ว: ปิด → ถือว่าอ่านแล้ว + ล้าง snooze
        ...(body.data.status ? { snoozeUntil: null } : {}),
        ...(body.data.status === 'closed' ? { unread: false } : {}),
      })
      .where(eq(inboxThreads.id, c.req.param('id')))
      .returning({ id: inboxThreads.id, status: inboxThreads.status })
    if (!updated[0]) return c.json({ error: 'not_found' }, 404)
    return c.json({ ok: true, status: updated[0].status })
  })

  // ตอบจากในระบบ → ส่งผ่าน Gmail API จาก address ของกล่อง + threading ถูกต้อง (SPEC §4.12)
  .post('/threads/:id/reply', async (c) => {
    const parsed = z
      .object({ body: z.string().trim().min(1).max(50_000) })
      .safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
    const db = createDb(c.env.DB)
    const me = c.get('user')

    const [thread] = await db
      .select()
      .from(inboxThreads)
      .where(eq(inboxThreads.id, c.req.param('id')))
    if (!thread) return c.json({ error: 'not_found' }, 404)
    const [mailbox] = await db
      .select()
      .from(inboxMailboxes)
      .where(eq(inboxMailboxes.id, thread.mailboxId))
    if (!mailbox || mailbox.status !== 'connected' || !mailbox.emailAddress)
      return c.json({ error: 'mailbox_disconnected' }, 409)

    // ฉบับอ้างอิง: เมลเข้าใหม่สุด (ถ้าไม่มี = thread ที่เราเริ่มเอง ใช้ฉบับล่าสุด)
    const [refMsg] =
      (await db
        .select()
        .from(inboxMessages)
        .where(and(eq(inboxMessages.threadId, thread.id), eq(inboxMessages.direction, 'in')))
        .orderBy(desc(inboxMessages.sentAt))
        .limit(1)) ??
      []
    const [anyMsg] = refMsg
      ? [refMsg]
      : await db
          .select()
          .from(inboxMessages)
          .where(eq(inboxMessages.threadId, thread.id))
          .orderBy(desc(inboxMessages.sentAt))
          .limit(1)
    if (!anyMsg) return c.json({ error: 'empty_thread' }, 400)

    let token: string
    try {
      token = await getAccessToken(c.env, mailbox)
    } catch (e) {
      if (e instanceof ReconnectError) {
        await db
          .update(inboxMailboxes)
          .set({ status: 'disconnected' })
          .where(eq(inboxMailboxes.id, mailbox.id))
        return c.json({ error: 'mailbox_disconnected' }, 409)
      }
      return c.json({ error: 'token_refresh_failed' }, 502)
    }

    // ดึง header ที่ไม่ได้เก็บไว้ (Message-ID/References/Reply-To/Cc) จาก Gmail ณ ตอนตอบ
    const metaRes = await fetch(
      `${GMAIL_API}/messages/${anyMsg.gmailMessageId}?format=metadata` +
        '&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Reply-To' +
        '&metadataHeaders=From&metadataHeaders=Cc',
      { headers: { authorization: `Bearer ${token}` } },
    )
    if (!metaRes.ok) return c.json({ error: 'gmail_fetch_failed' }, 502)
    const meta = (await metaRes.json()) as {
      payload?: { headers?: { name: string; value: string }[] }
    }
    const header = (name: string) =>
      meta.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null

    const to =
      anyMsg.direction === 'in'
        ? (header('Reply-To') ?? header('From') ?? anyMsg.fromAddr)
        : anyMsg.toAddr
    // reply-all เฉพาะ Cc เดิม — ตัด address กล่องเราเองกันวนกลับ
    const ccRaw = anyMsg.direction === 'in' ? header('Cc') : anyMsg.ccAddr
    const cc = ccRaw
      ?.split(',')
      .map((s) => s.trim())
      .filter((s) => s && extractEmail(s) !== mailbox.emailAddress!.toLowerCase())
      .join(', ')

    const mime = buildMime({
      from: formatAddress(mailbox.name, mailbox.emailAddress),
      to,
      cc: cc || null,
      subject: replySubject(thread.subject),
      bodyText: parsed.data.body,
      inReplyTo: header('Message-ID'),
      references: header('References'),
    })
    const sendRes = await fetch(`${GMAIL_API}/messages/send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ raw: toBase64Url(mime), threadId: thread.gmailThreadId }),
    })
    if (!sendRes.ok) return c.json({ error: 'gmail_send_failed' }, 502)
    const sent = (await sendRes.json()) as { id?: string }
    if (!sent.id) return c.json({ error: 'gmail_send_failed' }, 502)

    const now = new Date()
    const bodyKey = `inbox/${mailbox.id}/${sent.id}.txt`
    await c.env.FILES.put(bodyKey, parsed.data.body, {
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    })
    const [row] = await db
      .insert(inboxMessages)
      .values({
        threadId: thread.id,
        gmailMessageId: sent.id,
        direction: 'out',
        fromAddr: `${mailbox.name} <${mailbox.emailAddress}>`,
        toAddr: to,
        ccAddr: cc || null,
        snippet: parsed.data.body.replace(/\s+/g, ' ').slice(0, 120),
        bodyKey,
        sentAt: now,
      })
      .onConflictDoNothing() // cron sync อาจเก็บฉบับนี้จาก SENT มาก่อนเรา — ไม่ซ้ำ
      .returning({ id: inboxMessages.id })
    await db
      .update(inboxThreads)
      .set({ lastMessageAt: now })
      .where(eq(inboxThreads.id, thread.id))
    await writeAudit(c.env, {
      actorId: me.id,
      action: 'inbox_message.send',
      entity: 'inbox_threads',
      entityId: thread.id,
      meta: { to, gmailMessageId: sent.id },
    })
    return c.json({ ok: true, messageId: row?.id ?? null }, 201)
  })

  // เขียนอีเมลใหม่ (compose) — สร้าง thread ใหม่ มอบหมายให้คนส่ง
  .post('/compose', async (c) => {
    const parsed = z
      .object({
        mailboxId: z.string().min(1),
        to: z.string().trim().email(),
        subject: z.string().trim().min(1).max(500),
        body: z.string().trim().min(1).max(50_000),
      })
      .safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
    const db = createDb(c.env.DB)
    const me = c.get('user')
    const [mailbox] = await db
      .select()
      .from(inboxMailboxes)
      .where(eq(inboxMailboxes.id, parsed.data.mailboxId))
    if (!mailbox || mailbox.status !== 'connected' || !mailbox.emailAddress)
      return c.json({ error: 'mailbox_disconnected' }, 409)

    let token: string
    try {
      token = await getAccessToken(c.env, mailbox)
    } catch (e) {
      if (e instanceof ReconnectError) {
        await db
          .update(inboxMailboxes)
          .set({ status: 'disconnected' })
          .where(eq(inboxMailboxes.id, mailbox.id))
        return c.json({ error: 'mailbox_disconnected' }, 409)
      }
      return c.json({ error: 'token_refresh_failed' }, 502)
    }

    const mime = buildMime({
      from: formatAddress(mailbox.name, mailbox.emailAddress),
      to: parsed.data.to,
      subject: parsed.data.subject,
      bodyText: parsed.data.body,
    })
    const sendRes = await fetch(`${GMAIL_API}/messages/send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ raw: toBase64Url(mime) }),
    })
    if (!sendRes.ok) return c.json({ error: 'gmail_send_failed' }, 502)
    const sent = (await sendRes.json()) as { id?: string; threadId?: string }
    if (!sent.id || !sent.threadId) return c.json({ error: 'gmail_send_failed' }, 502)

    const now = new Date()
    const [thread] = await db
      .insert(inboxThreads)
      .values({
        mailboxId: mailbox.id,
        gmailThreadId: sent.threadId,
        subject: parsed.data.subject,
        contactEmail: parsed.data.to.toLowerCase(),
        status: 'open',
        assigneeId: me.id,
        lastMessageAt: now,
      })
      .returning({ id: inboxThreads.id })
    if (!thread) return c.json({ error: 'insert_failed' }, 500)
    const bodyKey = `inbox/${mailbox.id}/${sent.id}.txt`
    await c.env.FILES.put(bodyKey, parsed.data.body, {
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    })
    await db.insert(inboxMessages).values({
      threadId: thread.id,
      gmailMessageId: sent.id,
      direction: 'out',
      fromAddr: `${mailbox.name} <${mailbox.emailAddress}>`,
      toAddr: parsed.data.to,
      snippet: parsed.data.body.replace(/\s+/g, ' ').slice(0, 120),
      bodyKey,
      sentAt: now,
    })
    await writeAudit(c.env, {
      actorId: me.id,
      action: 'inbox_message.compose',
      entity: 'inbox_threads',
      entityId: thread.id,
      meta: { to: parsed.data.to },
    })
    return c.json({ ok: true, threadId: thread.id }, 201)
  })

  // โหลดไฟล์แนบ — lazy: ครั้งแรกดึงจาก Gmail แล้ว cache ลง R2 (SPEC §6)
  .get('/attachments/:id/download', async (c) => {
    const db = createDb(c.env.DB)
    const [row] = await db
      .select({
        att: inboxAttachments,
        gmailMessageId: inboxMessages.gmailMessageId,
        mailboxId: inboxThreads.mailboxId,
      })
      .from(inboxAttachments)
      .innerJoin(inboxMessages, eq(inboxMessages.id, inboxAttachments.messageId))
      .innerJoin(inboxThreads, eq(inboxThreads.id, inboxMessages.threadId))
      .where(eq(inboxAttachments.id, c.req.param('id')))
    if (!row) return c.json({ error: 'not_found' }, 404)

    // RFC 5987 — ชื่อไฟล์ไทยต้อง encode
    const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(row.att.filename)}`

    if (row.att.r2Key) {
      const obj = await c.env.FILES.get(row.att.r2Key)
      if (obj)
        return new Response(obj.body, {
          headers: { 'content-type': row.att.mime, 'content-disposition': disposition },
        })
    }

    // ยังไม่เคยโหลด — ดึงจาก Gmail (ต้องมี token ใช้ได้)
    const [mailbox] = await db
      .select()
      .from(inboxMailboxes)
      .where(eq(inboxMailboxes.id, row.mailboxId))
    if (!mailbox || mailbox.status !== 'connected' || !mailbox.refreshTokenEnc)
      return c.json({ error: 'mailbox_disconnected' }, 409)
    const [gClient] = await db
      .select()
      .from(inboxGoogleClients)
      .where(eq(inboxGoogleClients.id, mailbox.clientId))
    if (!gClient) return c.json({ error: 'client_not_found' }, 409)

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: gClient.clientId,
        client_secret: await decryptSecret(gClient.clientSecretEnc, c.env.INBOX_ENC_KEY),
        refresh_token: await decryptSecret(mailbox.refreshTokenEnc, c.env.INBOX_ENC_KEY),
        grant_type: 'refresh_token',
      }),
    })
    if (!tokenRes.ok) return c.json({ error: 'token_refresh_failed' }, 502)
    const { access_token } = (await tokenRes.json()) as { access_token?: string }

    const attRes = await fetch(
      `${GMAIL_API}/messages/${row.gmailMessageId}/attachments/${row.att.gmailAttachmentId}`,
      { headers: { authorization: `Bearer ${access_token}` } },
    )
    if (!attRes.ok) return c.json({ error: 'gmail_fetch_failed' }, 502)
    const { data } = (await attRes.json()) as { data?: string }
    if (!data) return c.json({ error: 'gmail_fetch_failed' }, 502)

    const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)

    const r2Key = `inbox/${row.mailboxId}/${row.gmailMessageId}/att-${row.att.id}`
    await c.env.FILES.put(r2Key, bytes, { httpMetadata: { contentType: row.att.mime } })
    await db
      .update(inboxAttachments)
      .set({ r2Key })
      .where(eq(inboxAttachments.id, row.att.id))

    return new Response(bytes, {
      headers: { 'content-type': row.att.mime, 'content-disposition': disposition },
    })
  })
