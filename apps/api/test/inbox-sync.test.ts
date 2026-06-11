import { env } from 'cloudflare:test'
import { createDb, inboxGoogleClients, inboxMailboxes } from '@seedoffice/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptSecret } from '../src/lib/crypto'
import type { GmailMessage } from '../src/lib/gmail'
import { syncMailbox } from '../src/lib/inbox-sync'
import { seedUsers } from './helpers'

const b64url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

/** ข้อความ Gmail แบบเต็มอย่างย่อ — พอสำหรับ parser */
function fullMessage(opts: {
  id: string
  threadId: string
  from?: string
  to?: string
  subject?: string
  labels?: string[]
  sentAt?: number
  attachment?: boolean
}): GmailMessage {
  return {
    id: opts.id,
    threadId: opts.threadId,
    labelIds: opts.labels ?? ['INBOX', 'UNREAD'],
    snippet: `snippet ของ ${opts.id}`,
    internalDate: String(opts.sentAt ?? 1765432100000),
    payload: {
      mimeType: 'multipart/mixed',
      headers: [
        { name: 'Subject', value: opts.subject ?? 'เรื่องทดสอบ' },
        { name: 'From', value: opts.from ?? 'ลูกค้า <customer@brand-x.test>' },
        { name: 'To', value: opts.to ?? 'support@brand-a.test' },
      ],
      parts: [
        { mimeType: 'text/html', body: { data: b64url(`<p>เนื้อหาของ ${opts.id}</p>`) } },
        ...(opts.attachment
          ? [
              {
                mimeType: 'application/pdf',
                filename: 'doc.pdf',
                body: { attachmentId: `att-${opts.id}`, size: 1234 },
              },
            ]
          : []),
      ],
    },
  }
}

interface MockGmail {
  tokenError?: string
  profileHistoryId?: string
  list?: { id: string }[] // messages.list (initial/fallback)
  history?: { status: number; ids?: string[]; historyId?: string }
  messages: Record<string, GmailMessage>
  calls: string[]
}

function mockGmail(m: MockGmail) {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    m.calls.push(url)
    if (url.startsWith('https://oauth2.googleapis.com/token'))
      return m.tokenError
        ? Response.json({ error: m.tokenError }, { status: 400 })
        : Response.json({ access_token: 'at-sync' })
    if (url.includes('/profile'))
      return Response.json({
        emailAddress: 'support@brand-a.test',
        historyId: m.profileHistoryId ?? '1000',
      })
    if (url.includes('/history?')) {
      if (m.history?.status === 404) return new Response('not found', { status: 404 })
      return Response.json({
        history: (m.history?.ids ?? []).map((id) => ({ messagesAdded: [{ message: { id } }] })),
        historyId: m.history?.historyId ?? '1010',
      })
    }
    if (url.includes('/messages/')) {
      const id = /\/messages\/([^?]+)/.exec(url)?.[1] ?? ''
      const msg = m.messages[id]
      return msg ? Response.json(msg) : new Response('gone', { status: 404 })
    }
    if (url.includes('/messages?')) return Response.json({ messages: m.list ?? [] })
    throw new Error(`unexpected fetch in test: ${url}`)
  })
}

/** สร้าง client + กล่อง connected ตรงๆ ใน DB (เลี่ยง OAuth flow — เทสต์นั้นมีแล้วใน inbox-settings) */
async function seedConnectedMailbox() {
  const db = createDb(env.DB)
  const [client] = await db
    .insert(inboxGoogleClients)
    .values({
      label: 'บริษัท เอ',
      clientId: 'client-a.apps.googleusercontent.com',
      clientSecretEnc: await encryptSecret('GOCSPX-secret', env.INBOX_ENC_KEY),
    })
    .returning()
  const [box] = await db
    .insert(inboxMailboxes)
    .values({
      clientId: client!.id,
      companyLabel: 'บริษัท เอ',
      name: 'ฝ่ายซัพพอร์ต',
      emailAddress: 'support@brand-a.test',
      gmailAccountId: 'g-acc-1',
      refreshTokenEnc: await encryptSecret('rt-sync', env.INBOX_ENC_KEY),
      status: 'connected',
      connectedAt: new Date(),
    })
    .returning()
  return box!
}

const q = {
  threads: () => env.DB.prepare('SELECT * FROM inbox_threads ORDER BY last_message_at').all(),
  messages: () => env.DB.prepare('SELECT * FROM inbox_messages ORDER BY sent_at').all(),
  state: () => env.DB.prepare('SELECT * FROM gmail_sync_state').first(),
  mailbox: (id: string) =>
    env.DB.prepare('SELECT status FROM inbox_mailboxes WHERE id = ?').bind(id).first<{
      status: string
    }>(),
}

beforeEach(async () => {
  await seedUsers()
  for (const t of [
    'inbox_attachments',
    'inbox_messages',
    'inbox_threads',
    'gmail_sync_state',
    'inbox_mailboxes',
    'inbox_google_clients',
  ])
    await env.DB.prepare(`DELETE FROM ${t}`).run()
})

afterEach(() => vi.unstubAllGlobals())

describe('E2 — initial sync (หลังเชื่อมกล่อง)', () => {
  it('backfill จาก messages.list + body ลง R2 + attachment metadata + ตั้ง baseline', async () => {
    const box = await seedConnectedMailbox()
    mockGmail({
      profileHistoryId: '2000',
      list: [{ id: 'm-1' }, { id: 'm-2' }],
      messages: {
        'm-1': fullMessage({ id: 'm-1', threadId: 't-1', sentAt: 1_765_000_001_000 }),
        'm-2': fullMessage({
          id: 'm-2',
          threadId: 't-1',
          sentAt: 1_765_000_002_000,
          attachment: true,
        }),
      },
      calls: [],
    })
    await syncMailbox(env, box.id)

    const threads = (await q.threads()).results as Record<string, unknown>[]
    expect(threads).toHaveLength(1)
    expect(threads[0]).toMatchObject({
      subject: 'เรื่องทดสอบ',
      contact_email: 'customer@brand-x.test',
      status: 'open',
      unread: 1,
      last_message_at: 1_765_000_002_000,
    })
    const messages = (await q.messages()).results as Record<string, unknown>[]
    expect(messages).toHaveLength(2)
    expect(messages.every((m) => m.direction === 'in')).toBe(true)

    // body อยู่ R2 พร้อม contentType
    const body = await env.FILES.get(String(messages[0]!.body_key))
    expect(await body?.text()).toBe('<p>เนื้อหาของ m-1</p>')
    expect(body?.httpMetadata?.contentType).toContain('text/html')

    // attachment เก็บ metadata, ยังไม่โหลดไฟล์ (r2_key null)
    const att = (await env.DB.prepare('SELECT * FROM inbox_attachments').all()).results
    expect(att).toHaveLength(1)
    expect(att[0]).toMatchObject({ gmail_attachment_id: 'att-m-2', filename: 'doc.pdf', r2_key: null })

    const state = (await q.state()) as Record<string, unknown>
    expect(state.last_history_id).toBe('2000')
    expect(state.last_error).toBeNull()
  })

  it('เมล SENT (เราตอบจาก Gmail เอง) → direction out · ไม่ unread · contact = ผู้รับ', async () => {
    const box = await seedConnectedMailbox()
    mockGmail({
      list: [{ id: 'm-out' }],
      messages: {
        'm-out': fullMessage({
          id: 'm-out',
          threadId: 't-out',
          from: 'ฝ่ายซัพพอร์ต <support@brand-a.test>',
          to: 'ลูกค้า <customer@brand-x.test>',
          labels: ['SENT'],
        }),
      },
      calls: [],
    })
    await syncMailbox(env, box.id)
    const threads = (await q.threads()).results as Record<string, unknown>[]
    expect(threads[0]).toMatchObject({ unread: 0, contact_email: 'customer@brand-x.test' })
    const messages = (await q.messages()).results as Record<string, unknown>[]
    expect(messages[0]!.direction).toBe('out')
  })

  it('SPAM → thread เป็น spam · TRASH/DRAFT ถูกข้าม', async () => {
    const box = await seedConnectedMailbox()
    mockGmail({
      list: [{ id: 'm-spam' }, { id: 'm-trash' }, { id: 'm-draft' }],
      messages: {
        'm-spam': fullMessage({ id: 'm-spam', threadId: 't-s', labels: ['SPAM'] }),
        'm-trash': fullMessage({ id: 'm-trash', threadId: 't-t', labels: ['TRASH'] }),
        'm-draft': fullMessage({ id: 'm-draft', threadId: 't-d', labels: ['DRAFT'] }),
      },
      calls: [],
    })
    await syncMailbox(env, box.id)
    const threads = (await q.threads()).results as Record<string, unknown>[]
    expect(threads).toHaveLength(1)
    expect(threads[0]!.status).toBe('spam')
  })
})

describe('E2 — incremental sync (history.list)', () => {
  it('เมลใหม่เข้า thread ที่ปิดแล้ว → เปิดใหม่ + unread + idempotent เมื่อรันซ้ำ', async () => {
    const box = await seedConnectedMailbox()
    // initial ก่อน — ได้ thread 1 อัน
    mockGmail({
      profileHistoryId: '2000',
      list: [{ id: 'm-1' }],
      messages: { 'm-1': fullMessage({ id: 'm-1', threadId: 't-1', sentAt: 1_765_000_001_000 }) },
      calls: [],
    })
    await syncMailbox(env, box.id)
    // ทีมปิด thread (จำลองสิ่งที่ E3 จะทำ)
    await env.DB.prepare("UPDATE inbox_threads SET status='closed', unread=0").run()

    // ลูกค้าตอบกลับ → history เจอ m-2
    vi.unstubAllGlobals()
    const mock: MockGmail = {
      history: { status: 200, ids: ['m-2'], historyId: '2050' },
      messages: {
        'm-2': fullMessage({ id: 'm-2', threadId: 't-1', sentAt: 1_765_000_009_000 }),
      },
      calls: [],
    }
    mockGmail(mock)
    await syncMailbox(env, box.id)

    let threads = (await q.threads()).results as Record<string, unknown>[]
    expect(threads[0]).toMatchObject({ status: 'open', unread: 1, last_message_at: 1_765_000_009_000 })
    expect((await q.messages()).results).toHaveLength(2)
    const state = (await q.state()) as Record<string, unknown>
    expect(state.last_history_id).toBe('2050')

    // รันซ้ำ history เดิม → ไม่มีอะไรซ้ำ/พัง
    await syncMailbox(env, box.id)
    expect((await q.messages()).results).toHaveLength(2)
    threads = (await q.threads()).results as Record<string, unknown>[]
    expect(threads).toHaveLength(1)
  })

  it('historyId เก่าเกิน (404) → fallback ดึงตามช่วงเวลา + ตั้ง baseline ใหม่', async () => {
    const box = await seedConnectedMailbox()
    mockGmail({
      profileHistoryId: '2000',
      list: [{ id: 'm-1' }],
      messages: { 'm-1': fullMessage({ id: 'm-1', threadId: 't-1' }) },
      calls: [],
    })
    await syncMailbox(env, box.id) // baseline 2000

    vi.unstubAllGlobals()
    const mock: MockGmail = {
      profileHistoryId: '9000',
      history: { status: 404 },
      list: [{ id: 'm-1' }, { id: 'm-new' }], // ทับซ้อนของเดิม 1 ตัว — ต้อง dedupe
      messages: {
        'm-1': fullMessage({ id: 'm-1', threadId: 't-1' }),
        'm-new': fullMessage({ id: 'm-new', threadId: 't-2', sentAt: 1_765_111_111_000 }),
      },
      calls: [],
    }
    mockGmail(mock)
    await syncMailbox(env, box.id)

    expect((await q.messages()).results).toHaveLength(2) // m-1 ไม่ซ้ำ
    expect((await q.threads()).results).toHaveLength(2)
    const state = (await q.state()) as Record<string, unknown>
    expect(state.last_history_id).toBe('9000')
    expect(mock.calls.some((u) => u.includes('q=after%3A'))).toBe(true)
  })
})

describe('E2 — ความผิดพลาด', () => {
  it('refresh token ถูกเพิกถอน (invalid_grant) → กล่อง disconnected + lastError บอกทางแก้', async () => {
    const box = await seedConnectedMailbox()
    mockGmail({ tokenError: 'invalid_grant', messages: {}, calls: [] })
    await syncMailbox(env, box.id)
    expect((await q.mailbox(box.id))?.status).toBe('disconnected')
    const state = (await q.state()) as Record<string, unknown>
    expect(String(state.last_error)).toContain('เชื่อมใหม่')
  })

  it('Gmail ล่มกลางทาง → เก็บ lastError ไว้ดูใน ตั้งค่า (กล่องยัง connected)', async () => {
    const box = await seedConnectedMailbox()
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.startsWith('https://oauth2.googleapis.com/token'))
        return Response.json({ access_token: 'at' })
      return new Response('boom', { status: 500 })
    })
    await syncMailbox(env, box.id)
    expect((await q.mailbox(box.id))?.status).toBe('connected')
    const state = (await q.state()) as Record<string, unknown>
    expect(String(state.last_error)).toContain('500')
  })

  it('กล่องที่ยังไม่เชื่อม/ปิดอยู่ → ไม่ทำอะไรเลย', async () => {
    const box = await seedConnectedMailbox()
    await env.DB.prepare("UPDATE inbox_mailboxes SET status='disabled'").run()
    const mock: MockGmail = { messages: {}, calls: [] }
    mockGmail(mock)
    await syncMailbox(env, box.id)
    expect(mock.calls).toHaveLength(0)
    expect(await q.state()).toBeNull()
  })
})
