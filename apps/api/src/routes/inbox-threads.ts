import {
  clients,
  createDb,
  inboxAttachments,
  inboxCanned,
  inboxGoogleClients,
  inboxMailboxes,
  inboxMessages,
  inboxNotes,
  inboxThreads,
  users,
} from '@seedoffice/db'
import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { writeAudit } from '../lib/audit'
import { decryptSecret } from '../lib/crypto'
import { decodeRfc2047, extractEmail } from '../lib/gmail'
import { getAccessToken, gmailGet, importGmailThread, ReconnectError } from '../lib/inbox-sync'
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

/**
 * เงื่อนไข "มีคำนี้อยู่ข้างใน" ด้วย instr แทน LIKE — D1 จำกัดความยาว LIKE pattern ต่ำมาก (~50 bytes)
 * คำค้นไทยยาวๆ (UTF-8 ตัวละ 3 bytes) ชนลิมิตแล้วระเบิด "LIKE pattern too complex"
 */
const containsQ = (q: string) =>
  or(
    sql`instr(lower(${inboxThreads.subject}), lower(${q})) > 0`,
    sql`instr(lower(${inboxThreads.contactEmail}), lower(${q})) > 0`,
  )

const patchBody = z
  .object({
    status: z.enum(['open', 'closed', 'spam', 'snoozed']),
    assigneeId: z.string().nullable(),
    unread: z.boolean(),
    tags: z.array(z.string().trim().min(1).max(30)).max(10),
    snoozeUntil: z.coerce.date(),
  })
  .partial()
  // เลื่อน (snooze) ต้องบอกเวลาปลุกในอนาคต — cron ทุกนาทีจะปลุกกลับมา open
  .refine((d) => d.status !== 'snoozed' || (d.snoozeUntil && d.snoozeUntil.getTime() > Date.now()), {
    message: 'snooze_requires_future_time',
  })

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

    const qCond = q ? containsQ(q) : undefined

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
        tags: inboxThreads.tags,
        snoozeUntil: inboxThreads.snoozeUntil,
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

    // โน้ตภายในของ thread — UI ผสานเข้า timeline ตามเวลา
    const notes = await db
      .select({
        id: inboxNotes.id,
        body: inboxNotes.body,
        createdAt: inboxNotes.createdAt,
        userId: inboxNotes.userId,
        userName: users.name,
      })
      .from(inboxNotes)
      .innerJoin(users, eq(users.id, inboxNotes.userId))
      .where(eq(inboxNotes.threadId, id))
      .orderBy(inboxNotes.createdAt)

    return c.json({ thread: { ...thread, unread: false }, messages: withBody, notes, client, past })
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
        // เปลี่ยนสถานะ = จัดการแล้ว: ปิด/เลื่อน → ถือว่าอ่านแล้ว · สถานะอื่นล้างเวลาปลุกทิ้ง
        ...(body.data.status && body.data.status !== 'snoozed' ? { snoozeUntil: null } : {}),
        ...(body.data.status === 'closed' || body.data.status === 'snoozed'
          ? { unread: false }
          : {}),
      })
      .where(eq(inboxThreads.id, c.req.param('id')))
      .returning({ id: inboxThreads.id, status: inboxThreads.status })
    if (!updated[0]) return c.json({ error: 'not_found' }, 404)
    return c.json({ ok: true, status: updated[0].status })
  })

  // โน้ตภายใน — ทีมเห็นกันเอง ไม่ถึงลูกค้า (SPEC §4.12)
  .post('/threads/:id/notes', async (c) => {
    const parsed = z
      .object({ body: z.string().trim().min(1).max(10_000) })
      .safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
    const db = createDb(c.env.DB)
    const [thread] = await db
      .select({ id: inboxThreads.id })
      .from(inboxThreads)
      .where(eq(inboxThreads.id, c.req.param('id')))
    if (!thread) return c.json({ error: 'not_found' }, 404)
    const me = c.get('user')
    const [note] = await db
      .insert(inboxNotes)
      .values({ threadId: thread.id, userId: me.id, body: parsed.data.body })
      .returning()
    if (!note) return c.json({ error: 'insert_failed' }, 500)
    return c.json({ ...note, userName: me.name }, 201)
  })

  // ข้อความสำเร็จรูป (canned replies) — ทีมสร้าง/แก้/ใช้ร่วมกัน
  .get('/canned', async (c) => {
    const db = createDb(c.env.DB)
    const items = await db
      .select({ id: inboxCanned.id, title: inboxCanned.title, body: inboxCanned.body })
      .from(inboxCanned)
      .where(isNull(inboxCanned.deletedAt))
      .orderBy(inboxCanned.title)
    return c.json({ items })
  })

  .post('/canned', async (c) => {
    const parsed = z
      .object({ title: z.string().trim().min(1).max(100), body: z.string().trim().min(1).max(10_000) })
      .safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
    const db = createDb(c.env.DB)
    const [row] = await db.insert(inboxCanned).values(parsed.data).returning()
    if (!row) return c.json({ error: 'insert_failed' }, 500)
    return c.json(row, 201)
  })

  .delete('/canned/:id', async (c) => {
    const db = createDb(c.env.DB)
    const updated = await db
      .update(inboxCanned)
      .set({ deletedAt: new Date() })
      .where(and(eq(inboxCanned.id, c.req.param('id')), isNull(inboxCanned.deletedAt)))
      .returning({ id: inboxCanned.id })
    if (!updated[0]) return c.json({ error: 'not_found' }, 404)
    return c.json({ ok: true })
  })

  // hybrid search (SPEC §4.12): local + ค้น Gmail สดทุกกล่องที่เชื่อมแบบขนาน — ค้นย้อนหลังได้ทั้งกล่อง
  .get('/search', async (c) => {
    const parsed = z
      .object({ q: z.string().trim().min(1).max(200), mailbox: z.string().optional() })
      .safeParse(c.req.query())
    if (!parsed.success) return c.json({ error: 'invalid_query' }, 400)
    const { q, mailbox } = parsed.data
    const db = createDb(c.env.DB)

    // 1) local — เหมือนค้นใน list (หัวข้อ/contact)
    const local = await db
      .select({
        id: inboxThreads.id,
        mailboxId: inboxThreads.mailboxId,
        subject: inboxThreads.subject,
        contactEmail: inboxThreads.contactEmail,
        status: inboxThreads.status,
        lastMessageAt: inboxThreads.lastMessageAt,
      })
      .from(inboxThreads)
      .where(and(mailbox ? eq(inboxThreads.mailboxId, mailbox) : undefined, containsQ(q)))
      .orderBy(desc(inboxThreads.lastMessageAt))
      .limit(15)

    // 2) Gmail สด — fan-out ทุกกล่องที่เชื่อม (หรือเฉพาะกล่องที่เลือก) พร้อมกัน
    const boxes = await db
      .select()
      .from(inboxMailboxes)
      .where(
        and(
          eq(inboxMailboxes.status, 'connected'),
          mailbox ? eq(inboxMailboxes.id, mailbox) : undefined,
        ),
      )
    const buckets = await Promise.all(
      boxes.map(async (box) => {
        try {
          const token = await getAccessToken(c.env, box)
          const list = await gmailGet<{ messages?: { id: string; threadId: string }[] }>(
            token,
            `/messages?q=${encodeURIComponent(q)}&maxResults=15`,
          )
          if (list.status !== 200) return { boxName: box.name, error: true, items: [] }
          // เอา thread ละ 1 ฉบับ (สูงสุด 8 thread/กล่อง) ไปดึง metadata ไว้แสดงผล
          const seen = new Map<string, string>()
          for (const m of list.data.messages ?? [])
            if (!seen.has(m.threadId)) seen.set(m.threadId, m.id)
          const items = (
            await Promise.all(
              [...seen.entries()].slice(0, 8).map(async ([tid, mid]) => {
                const meta = await gmailGet<{
                  internalDate?: string
                  payload?: { headers?: { name: string; value: string }[] }
                }>(
                  token,
                  `/messages/${mid}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
                )
                if (meta.status !== 200) return null
                const hdr = (n: string) =>
                  meta.data.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? ''
                return {
                  mailboxId: box.id,
                  gmailThreadId: tid,
                  subject: decodeRfc2047(hdr('subject')),
                  fromAddr: decodeRfc2047(hdr('from')),
                  sentAt: Number(meta.data.internalDate ?? 0),
                }
              }),
            )
          ).filter((x): x is NonNullable<typeof x> => x !== null)
          return { boxName: box.name, error: false, items }
        } catch (e) {
          if (e instanceof ReconnectError)
            await db
              .update(inboxMailboxes)
              .set({ status: 'disconnected' })
              .where(eq(inboxMailboxes.id, box.id))
          return { boxName: box.name, error: true, items: [] }
        }
      }),
    )

    // ผลจาก Gmail ที่เคย import แล้ว → ชี้ไป thread ในระบบแทน (ไม่ต้อง import ซ้ำ)
    const remote = buckets.flatMap((b) => b.items)
    const gmailIds = remote.map((r) => r.gmailThreadId)
    const existing = gmailIds.length
      ? await db
          .select({
            id: inboxThreads.id,
            mailboxId: inboxThreads.mailboxId,
            gmailThreadId: inboxThreads.gmailThreadId,
          })
          .from(inboxThreads)
          .where(inArray(inboxThreads.gmailThreadId, gmailIds))
      : []
    const localIdOf = new Map(existing.map((e) => [`${e.mailboxId}:${e.gmailThreadId}`, e.id]))

    return c.json({
      local,
      remote: remote.map((r) => ({
        ...r,
        localThreadId: localIdOf.get(`${r.mailboxId}:${r.gmailThreadId}`) ?? null,
      })),
      partial: buckets.filter((b) => b.error).map((b) => b.boxName), // กล่องที่ค้นไม่สำเร็จ
    })
  })

  // import thread จากผลค้น Gmail เข้าระบบ (เข้าเป็นประวัติแบบ backfill) แล้วเปิดทำงานต่อได้ปกติ
  .post('/import-thread', async (c) => {
    const parsed = z
      .object({ mailboxId: z.string().min(1), gmailThreadId: z.string().min(1) })
      .safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
    const db = createDb(c.env.DB)
    try {
      const threadId = await importGmailThread(c.env, parsed.data.mailboxId, parsed.data.gmailThreadId)
      if (!threadId) return c.json({ error: 'import_failed' }, 502)
      return c.json({ ok: true, threadId }, 201)
    } catch (e) {
      if (e instanceof ReconnectError) {
        await db
          .update(inboxMailboxes)
          .set({ status: 'disconnected' })
          .where(eq(inboxMailboxes.id, parsed.data.mailboxId))
        return c.json({ error: 'mailbox_disconnected' }, 409)
      }
      return c.json({ error: 'import_failed' }, 502)
    }
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
