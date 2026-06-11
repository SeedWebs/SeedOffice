import {
  createDb,
  gmailSyncState,
  inboxAttachments,
  inboxGoogleClients,
  inboxMailboxes,
  inboxMessages,
  inboxThreads,
  type Db,
  type InboxMailbox,
} from '@seedoffice/db'
import { and, eq, isNotNull, isNull, lte } from 'drizzle-orm'
import { decryptSecret } from './crypto'
import { extractEmail, parseGmailMessage, type GmailMessage } from './gmail'

/**
 * Sync ขาเข้าอีเมลกลาง (SPEC §4.12 · E2)
 * - initial (หลังเชื่อม): backfill INBOX ล่าสุด ~50 ฉบับ + ตั้ง baseline historyId
 * - incremental: history.list (messageAdded) ตั้งแต่ lastHistoryId
 * - historyId เก่าเกิน (404) → fallback ดึงตามช่วงเวลา q=after: แล้วตั้ง baseline ใหม่
 * - refresh token ใช้ไม่ได้ → กล่อง disconnected + lastError (โชว์ใน ตั้งค่า ให้กดเชื่อมใหม่)
 * - idempotent: เมลซ้ำกันด้วย unique(threadId, gmailMessageId) — cron ทับซ้อนกันได้ไม่พัง
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const INITIAL_BACKFILL = 50
const MAX_HISTORY_PAGES = 10

/** token ของกล่องถูกเพิกถอน (เปลี่ยนรหัสผ่าน/ถอนสิทธิ์) — ต้องให้ owner กดเชื่อมใหม่ */
export class ReconnectError extends Error {
  constructor() {
    super('token_revoked')
  }
}

/** ขอ access token ของกล่อง (refresh flow) — ใช้ร่วมกันทั้ง sync/ไฟล์แนบ/ส่งเมล */
export async function getAccessToken(env: Env, mailbox: InboxMailbox): Promise<string> {
  const db = createDb(env.DB)
  const [client] = await db
    .select()
    .from(inboxGoogleClients)
    .where(and(eq(inboxGoogleClients.id, mailbox.clientId), isNull(inboxGoogleClients.deletedAt)))
  if (!client) throw new Error('client_not_found')
  if (!mailbox.refreshTokenEnc) throw new ReconnectError()
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: await decryptSecret(client.clientSecretEnc, env.INBOX_ENC_KEY),
      refresh_token: await decryptSecret(mailbox.refreshTokenEnc, env.INBOX_ENC_KEY),
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    if (body.error === 'invalid_grant') throw new ReconnectError()
    throw new Error(`token_refresh_failed (${res.status})`)
  }
  const { access_token } = (await res.json()) as { access_token?: string }
  if (!access_token) throw new Error('token_refresh_failed (no access_token)')
  return access_token
}

async function gmailGet<T>(token: string, path: string): Promise<{ status: number; data: T }> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  const data = (await res.json().catch(() => ({}))) as T
  return { status: res.status, data }
}

/**
 * เก็บ 1 ข้อความลง D1 + body ลง R2 — คืน true ถ้าเป็นข้อความใหม่ (ไม่ใช่ของซ้ำ)
 * mode 'backfill' = ดึงประวัติตอนเพิ่งเชื่อม: ของที่เคลียร์จาก INBOX แล้วเข้าเป็น closed/อ่านแล้ว
 * (ทีมใช้ Gmail แบบเคลียร์กล่อง — เจอจริงตอนเชื่อมกล่องแรก: ทั้งกล่อง 201 ฉบับ แต่ INBOX = 0)
 * mode 'live' = เมลเดินปกติ: เมลเข้า → unread + ปลุก closed/snoozed
 */
async function ingestMessage(
  db: Db,
  env: Env,
  mailbox: InboxMailbox,
  full: GmailMessage,
  mode: 'live' | 'backfill' = 'live',
): Promise<boolean> {
  const msg = parseGmailMessage(full)
  if (['TRASH', 'DRAFT', 'CHAT'].some((l) => msg.labelIds.includes(l))) return false
  const direction =
    mailbox.emailAddress && extractEmail(msg.fromAddr) === mailbox.emailAddress.toLowerCase()
      ? 'out'
      : 'in'
  const isSpam = msg.labelIds.includes('SPAM')
  const inInbox = msg.labelIds.includes('INBOX')
  const contact =
    direction === 'in'
      ? extractEmail(msg.fromAddr)
      : extractEmail((msg.toAddr.split(',')[0] ?? '').trim())

  // หา/สร้าง thread ของกล่องนี้
  let [thread] = await db
    .select()
    .from(inboxThreads)
    .where(
      and(eq(inboxThreads.mailboxId, mailbox.id), eq(inboxThreads.gmailThreadId, msg.gmailThreadId)),
    )
  if (!thread) {
    const inserted = await db
      .insert(inboxThreads)
      .values({
        mailboxId: mailbox.id,
        gmailThreadId: msg.gmailThreadId,
        subject: msg.subject,
        contactEmail: contact || null,
        // backfill: เฉพาะที่ยังค้าง INBOX = งานเปิด · ที่เคลียร์แล้ว = ประวัติ (closed/อ่านแล้ว)
        status: isSpam ? 'spam' : mode === 'backfill' && !inInbox ? 'closed' : 'open',
        unread:
          direction === 'in' &&
          (mode === 'live' || (inInbox && msg.labelIds.includes('UNREAD'))),
        lastMessageAt: new Date(msg.sentAt),
      })
      .onConflictDoNothing() // cron ซ้อนกันอาจสร้างพร้อมกัน — แพ้ก็ไป select เอา
      .returning()
    thread =
      inserted[0] ??
      (
        await db
          .select()
          .from(inboxThreads)
          .where(
            and(
              eq(inboxThreads.mailboxId, mailbox.id),
              eq(inboxThreads.gmailThreadId, msg.gmailThreadId),
            ),
          )
      )[0]
    if (!thread) throw new Error('thread_upsert_failed')
  }

  // ซ้ำ = เคย sync แล้ว (idempotent)
  const [dup] = await db
    .select({ id: inboxMessages.id })
    .from(inboxMessages)
    .where(
      and(
        eq(inboxMessages.threadId, thread.id),
        eq(inboxMessages.gmailMessageId, msg.gmailMessageId),
      ),
    )
  if (dup) return false

  // body → R2 ก่อน insert row — ถ้า R2 ล้ม row ยังไม่เกิด รอบหน้า retry เองทั้งก้อน
  let bodyKey: string | null = null
  if (msg.body) {
    bodyKey = `inbox/${mailbox.id}/${msg.gmailMessageId}.${msg.body.contentType.includes('html') ? 'html' : 'txt'}`
    await env.FILES.put(bodyKey, msg.body.content, {
      httpMetadata: { contentType: msg.body.contentType },
    })
  }

  const inserted = await db
    .insert(inboxMessages)
    .values({
      threadId: thread.id,
      gmailMessageId: msg.gmailMessageId,
      direction,
      fromAddr: msg.fromAddr,
      toAddr: msg.toAddr,
      ccAddr: msg.ccAddr,
      snippet: msg.snippet,
      bodyKey,
      sentAt: new Date(msg.sentAt),
    })
    .onConflictDoNothing()
    .returning({ id: inboxMessages.id })
  const row = inserted[0]
  if (!row) return false // แพ้ race ให้ cron อีกตัว — ฝั่งนั้นจัดการ thread ต่อแล้ว

  if (msg.attachments.length > 0)
    await db
      .insert(inboxAttachments)
      .values(msg.attachments.map((a) => ({ ...a, messageId: row.id })))

  // อัปเดต thread: เวลาให้ล่าสุด · live + เมลเข้า = unread + ปลุก closed/snoozed กลับมา open · SPAM → spam
  // backfill ไม่แตะ status/unread — list มาใหม่→เก่า สถานะ thread ถูกตั้งจากฉบับล่าสุดตอนสร้างแล้ว
  const newLast = Math.max(thread.lastMessageAt.getTime(), msg.sentAt)
  await db
    .update(inboxThreads)
    .set({
      lastMessageAt: new Date(newLast),
      subject: thread.subject === '' && msg.subject !== '' ? msg.subject : thread.subject,
      ...(isSpam
        ? { status: 'spam' as const }
        : mode === 'live' && direction === 'in'
          ? {
              unread: true,
              status: thread.status === 'closed' || thread.status === 'snoozed' ? 'open' : thread.status,
              snoozeUntil: null,
            }
          : {}),
    })
    .where(eq(inboxThreads.id, thread.id))
  return true
}

/** ดึงข้อความเต็มเป็นชุด (ข้ามตัวที่หายไปแล้ว เช่นโดนลบระหว่างทาง) */
async function ingestByIds(
  db: Db,
  env: Env,
  mailbox: InboxMailbox,
  token: string,
  ids: string[],
  mode: 'live' | 'backfill' = 'live',
): Promise<number> {
  let count = 0
  for (const id of ids) {
    const { status, data } = await gmailGet<GmailMessage>(token, `/messages/${id}?format=full`)
    if (status === 404) continue
    if (status !== 200) throw new Error(`messages.get ${id} → ${status}`)
    if (await ingestMessage(db, env, mailbox, data, mode)) count++
  }
  return count
}

interface Profile {
  emailAddress?: string
  historyId?: string
}

/** initial + fallback ใช้ทางเดียวกัน: list ข้อความ → ingest → baseline จาก profile ปัจจุบัน */
async function listAndIngest(
  db: Db,
  env: Env,
  mailbox: InboxMailbox,
  token: string,
  query: string,
  mode: 'live' | 'backfill',
): Promise<string> {
  const { status: pStatus, data: profile } = await gmailGet<Profile>(token, '/profile')
  if (pStatus !== 200 || !profile.historyId) throw new Error(`profile → ${pStatus}`)
  const { status, data } = await gmailGet<{ messages?: { id: string }[] }>(
    token,
    `/messages?maxResults=${INITIAL_BACKFILL}${query}`,
  )
  if (status !== 200) throw new Error(`messages.list → ${status}`)
  await ingestByIds(db, env, mailbox, token, (data.messages ?? []).map((m) => m.id), mode)
  return profile.historyId
}

interface HistoryPage {
  history?: { messagesAdded?: { message?: { id?: string } }[] }[]
  historyId?: string
  nextPageToken?: string
}

/** sync กล่องเดียว — เรียกจาก cron / หลังเชื่อมเสร็จ / ปุ่ม sync ใน ตั้งค่า */
export async function syncMailbox(env: Env, mailboxId: string): Promise<void> {
  const db = createDb(env.DB)
  const [mailbox] = await db.select().from(inboxMailboxes).where(eq(inboxMailboxes.id, mailboxId))
  if (!mailbox || mailbox.status !== 'connected') return

  const [state] = await db
    .select()
    .from(gmailSyncState)
    .where(eq(gmailSyncState.mailboxId, mailbox.id))

  const writeState = async (patch: {
    lastHistoryId?: string
    lastError: string | null
  }): Promise<void> => {
    await db
      .insert(gmailSyncState)
      .values({ mailboxId: mailbox.id, lastSyncAt: new Date(), ...patch })
      .onConflictDoUpdate({
        target: gmailSyncState.mailboxId,
        set: { lastSyncAt: new Date(), ...patch },
      })
  }

  try {
    const token = await getAccessToken(env, mailbox)

    if (!state?.lastHistoryId) {
      // เพิ่งเชื่อม — backfill ~50 ฉบับล่าสุด "ทั้งกล่อง" (รวม archived/sent — ทีมเคลียร์ INBOX เป็นนิสัย)
      const baseline = await listAndIngest(db, env, mailbox, token, '', 'backfill')
      await writeState({ lastHistoryId: baseline, lastError: null })
      return
    }

    // incremental จาก lastHistoryId
    let pageToken: string | undefined
    let latestHistoryId = state.lastHistoryId
    const ids = new Set<string>()
    for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
      const params = new URLSearchParams({
        startHistoryId: state.lastHistoryId,
        historyTypes: 'messageAdded',
      })
      if (pageToken) params.set('pageToken', pageToken)
      const { status, data } = await gmailGet<HistoryPage>(token, `/history?${params}`)
      if (status === 404) {
        // historyId เก่าเกิน (Gmail เก็บ ~สัปดาห์) — fallback ดึงตามช่วงเวลาที่หายไป
        const sinceSec = Math.floor(
          ((state.lastSyncAt?.getTime() ?? Date.now() - 7 * 86_400_000) - 5 * 60_000) / 1000,
        )
        const baseline = await listAndIngest(
          db,
          env,
          mailbox,
          token,
          `&q=${encodeURIComponent(`after:${sinceSec}`)}`,
          'live', // ช่วงที่หายไปคือเมลเดินปกติ — พฤติกรรม unread/ปลุก thread ต้องเหมือน live
        )
        await writeState({ lastHistoryId: baseline, lastError: null })
        return
      }
      if (status !== 200) throw new Error(`history.list → ${status}`)
      for (const h of data.history ?? [])
        for (const m of h.messagesAdded ?? []) if (m.message?.id) ids.add(m.message.id)
      if (data.historyId) latestHistoryId = data.historyId
      pageToken = data.nextPageToken
      if (!pageToken) break
    }
    await ingestByIds(db, env, mailbox, token, [...ids])
    await writeState({ lastHistoryId: latestHistoryId, lastError: null })
  } catch (e) {
    if (e instanceof ReconnectError) {
      await db
        .update(inboxMailboxes)
        .set({ status: 'disconnected' })
        .where(eq(inboxMailboxes.id, mailbox.id))
      await writeState({ lastError: 'token ถูกเพิกถอน — กด "เชื่อมใหม่" ที่ ตั้งค่า → อีเมลกลาง' })
      return
    }
    await writeState({ lastError: String(e instanceof Error ? e.message : e).slice(0, 300) })
  }
}

/** sync ทุกกล่องที่เชื่อมอยู่ — เรียงทีละกล่อง (3 กล่อง quota จิ๊บจ๊อย ไม่ต้องขนาน) */
export async function syncAllMailboxes(env: Env): Promise<void> {
  const db = createDb(env.DB)
  const boxes = await db
    .select({ id: inboxMailboxes.id })
    .from(inboxMailboxes)
    .where(eq(inboxMailboxes.status, 'connected'))
  for (const b of boxes) await syncMailbox(env, b.id)
}

/**
 * ดึง body ขาเข้าเดิมจาก Gmail มา decode ใหม่ — แก้เมลที่ backfill ไว้ตอน parser ยัง decode charset ผิด
 * (เมลประกาศ windows-874 แต่ bytes เป็น UTF-8) · idempotent · รันครั้งเดียวต่อกล่องหลังแก้ parser
 * เฉพาะ direction='in' (ขาออกเราเก็บ plaintext เองอยู่แล้ว ถูกต้อง)
 */
export async function reprocessMailboxBodies(
  env: Env,
  mailboxId: string,
): Promise<{ updated: number; total: number }> {
  const db = createDb(env.DB)
  const [mailbox] = await db.select().from(inboxMailboxes).where(eq(inboxMailboxes.id, mailboxId))
  if (!mailbox || mailbox.status !== 'connected') return { updated: 0, total: 0 }
  const token = await getAccessToken(env, mailbox) // โยน ReconnectError ถ้า token เพิกถอน — ให้ route จัดการ
  const rows = await db
    .select({ gmailMessageId: inboxMessages.gmailMessageId, bodyKey: inboxMessages.bodyKey })
    .from(inboxMessages)
    .innerJoin(inboxThreads, eq(inboxThreads.id, inboxMessages.threadId))
    .where(
      and(
        eq(inboxThreads.mailboxId, mailbox.id),
        eq(inboxMessages.direction, 'in'),
        isNotNull(inboxMessages.bodyKey),
      ),
    )
  let updated = 0
  for (const r of rows) {
    if (!r.bodyKey) continue
    const { status, data } = await gmailGet<GmailMessage>(token, `/messages/${r.gmailMessageId}?format=full`)
    if (status !== 200) continue
    const parsed = parseGmailMessage(data)
    if (!parsed.body) continue
    await env.FILES.put(r.bodyKey, parsed.body.content, {
      httpMetadata: { contentType: parsed.body.contentType },
    })
    updated++
  }
  return { updated, total: rows.length }
}

/** ปลุก thread ที่ snooze ครบเวลา (cron ทุกนาที) — กลับมา open + unread ให้ทีมเห็น */
export async function wakeSnoozedThreads(env: Env): Promise<void> {
  const db = createDb(env.DB)
  await db
    .update(inboxThreads)
    .set({ status: 'open', unread: true, snoozeUntil: null })
    .where(and(eq(inboxThreads.status, 'snoozed'), lte(inboxThreads.snoozeUntil, new Date())))
}
