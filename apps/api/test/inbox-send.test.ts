import { env } from 'cloudflare:test'
import { createDb, inboxGoogleClients, inboxMailboxes, inboxMessages, inboxThreads } from '@seedoffice/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { encryptSecret } from '../src/lib/crypto'
import { buildMime, encodeHeaderWord, replySubject, toBase64Url } from '../src/lib/mime'
import { loginAs, seedUsers } from './helpers'

const json = (cookie: string, body: unknown, method = 'POST') => ({
  method,
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

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

const b64decode = (s: string) => {
  const b = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

describe('E4 — MIME builder (pure)', () => {
  it('header ไทย → RFC2047 · ASCII คงเดิม · Re: ไม่ซ้อน', () => {
    expect(encodeHeaderWord('Hello')).toBe('Hello')
    const thai = encodeHeaderWord('เรื่องทดสอบ')
    expect(thai).toMatch(/^=\?UTF-8\?B\?.+\?=$/)
    expect(replySubject('Re: ขอใบเสนอราคา')).toBe('Re: ขอใบเสนอราคา')
    expect(replySubject('ขอใบเสนอราคา')).toBe('Re: ขอใบเสนอราคา')
  })

  it('threading headers ครบ: In-Reply-To + References ต่อสาย · body base64 ถอดกลับเป็นไทยได้', () => {
    const mime = buildMime({
      from: 'Support <support@a.test>',
      to: 'customer@x.test',
      cc: 'boss@x.test',
      subject: 'Re: ทดสอบ',
      bodyText: 'สวัสดีครับ ตอบกลับจากระบบ',
      inReplyTo: '<msg-2@mail.gmail.com>',
      references: '<msg-1@mail.gmail.com>',
    })
    expect(mime).toContain('In-Reply-To: <msg-2@mail.gmail.com>')
    expect(mime).toContain('References: <msg-1@mail.gmail.com> <msg-2@mail.gmail.com>')
    expect(mime).toContain('Cc: boss@x.test')
    const body = mime.split('\r\n\r\n')[1]!
    expect(new TextDecoder().decode(Uint8Array.from(atob(body.replace(/\r\n/g, '')), (c) => c.charCodeAt(0)))).toBe(
      'สวัสดีครับ ตอบกลับจากระบบ',
    )
    expect(toBase64Url(mime)).not.toMatch(/[+/=]/)
  })
})

/** thread พร้อมเมลเข้า 1 ฉบับ (จัดฉากเหมือน sync มาแล้ว) */
async function seedThread() {
  const db = createDb(env.DB)
  const [gc] = await db
    .insert(inboxGoogleClients)
    .values({
      label: 'A',
      clientId: 'client-a.apps.googleusercontent.com',
      clientSecretEnc: await encryptSecret('GOCSPX-secret', env.INBOX_ENC_KEY),
    })
    .returning()
  const [box] = await db
    .insert(inboxMailboxes)
    .values({
      clientId: gc!.id,
      companyLabel: 'A',
      name: 'ฝ่ายซัพพอร์ต',
      emailAddress: 'support@brand-a.test',
      refreshTokenEnc: await encryptSecret('rt-x', env.INBOX_ENC_KEY),
      status: 'connected',
      connectedAt: new Date(),
    })
    .returning()
  const [thread] = await db
    .insert(inboxThreads)
    .values({
      mailboxId: box!.id,
      gmailThreadId: 'gthread-1',
      subject: 'ขอใบเสนอราคา',
      contactEmail: 'customer@brand-x.test',
      unread: true,
      lastMessageAt: new Date(1_765_000_000_000),
    })
    .returning()
  await db.insert(inboxMessages).values({
    threadId: thread!.id,
    gmailMessageId: 'g-in-1',
    direction: 'in',
    fromAddr: 'คุณลูกค้า <customer@brand-x.test>',
    toAddr: 'support@brand-a.test',
    ccAddr: 'boss@brand-x.test, support@brand-a.test',
    snippet: 'ขอใบเสนอราคา...',
    sentAt: new Date(1_765_000_000_000),
  })
  return { db, box: box!, thread: thread! }
}

interface SentCapture {
  raw?: string
  threadId?: string
}

function mockGmailSend(capture: SentCapture, opts: { metaCc?: string } = {}) {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.startsWith('https://oauth2.googleapis.com/token'))
      return Response.json({ access_token: 'at-send' })
    if (url.includes('format=metadata'))
      return Response.json({
        payload: {
          headers: [
            { name: 'Message-ID', value: '<orig-1@mail.gmail.com>' },
            { name: 'References', value: '<root-0@mail.gmail.com>' },
            { name: 'Reply-To', value: 'reply-here@brand-x.test' },
            { name: 'From', value: 'คุณลูกค้า <customer@brand-x.test>' },
            ...(opts.metaCc ? [{ name: 'Cc', value: opts.metaCc }] : []),
          ],
        },
      })
    if (url.endsWith('/messages/send')) {
      const body = JSON.parse(String(init?.body)) as { raw: string; threadId?: string }
      capture.raw = body.raw
      capture.threadId = body.threadId
      return Response.json({ id: 'g-sent-1', threadId: body.threadId ?? 'gthread-new' })
    }
    throw new Error(`unexpected fetch: ${url}`)
  })
}

describe('E4 — reply', () => {
  it('ส่งจาก address กล่อง → To=Reply-To · Cc ตัดตัวเอง · threading ครบ · เก็บขาออก+R2+audit', async () => {
    const { box, thread } = await seedThread()
    const owner = await loginAs(app, 'owner@example-co.test')
    const cap: SentCapture = {}
    mockGmailSend(cap, { metaCc: 'boss@brand-x.test, support@brand-a.test' })

    const res = await app.request(
      `/api/inbox/threads/${thread.id}/reply`,
      json(owner, { body: 'สวัสดีครับ แนบใบเสนอราคาให้แล้วครับ' }),
      env,
    )
    expect(res.status).toBe(201)

    expect(cap.threadId).toBe('gthread-1') // ส่งเข้า thread เดิมของ Gmail
    const mime = b64decode(cap.raw!)
    expect(mime).toContain('To: reply-here@brand-x.test') // เคารพ Reply-To
    expect(mime).toContain('Cc: boss@brand-x.test') // ตัด support@ ตัวเองออก
    expect(mime).not.toContain('Cc: boss@brand-x.test, support')
    expect(mime).toContain('In-Reply-To: <orig-1@mail.gmail.com>')
    expect(mime).toContain('References: <root-0@mail.gmail.com> <orig-1@mail.gmail.com>')
    expect(mime).toContain('From: =?UTF-8?B?') // ชื่อกล่องไทย encode แล้ว
    expect(mime).toContain('<support@brand-a.test>')

    const rows = (
      await env.DB.prepare(
        "SELECT direction, gmail_message_id, body_key, snippet FROM inbox_messages WHERE direction='out'",
      ).all()
    ).results as Record<string, string>[]
    expect(rows).toHaveLength(1)
    expect(rows[0]!.gmail_message_id).toBe('g-sent-1')
    const r2 = await env.FILES.get(rows[0]!.body_key ?? '')
    expect(await r2?.text()).toContain('แนบใบเสนอราคา')
    // thread เวลาอัปเดต
    const t = await env.DB.prepare('SELECT last_message_at FROM inbox_threads WHERE id = ?')
      .bind(thread.id)
      .first<{ last_message_at: number }>()
    expect(t!.last_message_at).toBeGreaterThan(1_765_000_000_000)
    // audit
    const audit = await env.DB.prepare(
      "SELECT COUNT(*) n FROM audit_logs WHERE action='inbox_message.send'",
    ).first<{ n: number }>()
    expect(audit?.n).toBe(1)
    void box
  })

  it('vendor 403 · กล่อง disconnected → 409 · body ว่าง → 400', async () => {
    const { thread } = await seedThread()
    const vendor = await loginAs(app, 'somchai@example.com')
    expect(
      (await app.request(`/api/inbox/threads/${thread.id}/reply`, json(vendor, { body: 'x' }), env))
        .status,
    ).toBe(403)

    const owner = await loginAs(app, 'owner@example-co.test')
    expect(
      (await app.request(`/api/inbox/threads/${thread.id}/reply`, json(owner, { body: '' }), env))
        .status,
    ).toBe(400)

    await env.DB.prepare("UPDATE inbox_mailboxes SET status='disconnected'").run()
    expect(
      (await app.request(`/api/inbox/threads/${thread.id}/reply`, json(owner, { body: 'x' }), env))
        .status,
    ).toBe(409)
  })
})

describe('E4 — compose (เขียนอีเมลใหม่)', () => {
  it('สร้าง thread ใหม่ + มอบหมายให้คนส่ง + เก็บขาออก · to ไม่ใช่อีเมล → 400', async () => {
    const { box } = await seedThread()
    const member = await loginAs(app, 'pond@example-co.test')
    const cap: SentCapture = {}
    mockGmailSend(cap)

    const bad = await app.request(
      '/api/inbox/compose',
      json(member, { mailboxId: box.id, to: 'not-an-email', subject: 'x', body: 'x' }),
      env,
    )
    expect(bad.status).toBe(400)

    const res = await app.request(
      '/api/inbox/compose',
      json(member, {
        mailboxId: box.id,
        to: 'new-customer@y.test',
        subject: 'นำส่งใบเสนอราคา',
        body: 'เรียนคุณลูกค้า ตามที่คุยกันครับ',
      }),
      env,
    )
    expect(res.status).toBe(201)
    const { threadId } = (await res.json()) as { threadId: string }

    expect(cap.threadId).toBeUndefined() // compose ไม่ผูก thread เดิม
    const mime = b64decode(cap.raw!)
    expect(mime).toContain('To: new-customer@y.test')
    expect(mime).not.toContain('In-Reply-To')

    const t = await env.DB.prepare(
      'SELECT subject, contact_email, status, assignee_id, gmail_thread_id FROM inbox_threads WHERE id = ?',
    )
      .bind(threadId)
      .first<Record<string, string>>()
    expect(t).toMatchObject({
      subject: 'นำส่งใบเสนอราคา',
      contact_email: 'new-customer@y.test',
      status: 'open',
      assignee_id: 'u_pond',
      gmail_thread_id: 'gthread-new', // จากคำตอบของ Gmail — เมลตอบกลับจะ sync เข้า thread นี้
    })
  })
})
