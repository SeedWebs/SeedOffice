import { env } from 'cloudflare:test'
import {
  clients,
  createDb,
  inboxAttachments,
  inboxGoogleClients,
  inboxMailboxes,
  inboxMessages,
  inboxThreads,
} from '@seedoffice/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { encryptSecret } from '../src/lib/crypto'
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
    'clients',
  ])
    await env.DB.prepare(`DELETE FROM ${t}`).run()
})

afterEach(() => vi.unstubAllGlobals())

/** กล่อง + threads ครบทุก folder + ข้อความ/ไฟล์แนบ/บอดี้ใน R2 — จัดฉากเหมือนผ่าน sync มาแล้ว */
async function seedInbox() {
  const db = createDb(env.DB)
  const [gc] = await db
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
      clientId: gc!.id,
      companyLabel: 'บริษัท เอ',
      name: 'ฝ่ายซัพพอร์ต',
      emailAddress: 'support@brand-a.test',
      refreshTokenEnc: await encryptSecret('rt-x', env.INBOX_ENC_KEY),
      status: 'connected',
      connectedAt: new Date(),
    })
    .returning()

  const mkThread = async (over: Partial<typeof inboxThreads.$inferInsert>) =>
    (
      await db
        .insert(inboxThreads)
        .values({
          mailboxId: box!.id,
          gmailThreadId: `gt-${Math.random()}`,
          subject: 'เรื่องทดสอบ',
          contactEmail: 'customer@brand-x.test',
          lastMessageAt: new Date(1_765_000_000_000),
          ...over,
        })
        .returning()
    )[0]!

  const open = await mkThread({ subject: 'ขอใบเสนอราคา', unread: true })
  const mine = await mkThread({ subject: 'งานของฉัน', assigneeId: 'u_owner' })
  const assigned = await mkThread({ subject: 'มอบหมายให้ปอนด์', assigneeId: 'u_pond' })
  const closed = await mkThread({ subject: 'จบไปแล้ว', status: 'closed', contactEmail: 'other@z.test' })
  const spam = await mkThread({ subject: 'โฆษณา', status: 'spam' })

  await env.FILES.put(`inbox/${box!.id}/g-1.html`, '<p>สวัสดีครับ ขอใบเสนอราคา</p>', {
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
  })
  const [msg] = await db
    .insert(inboxMessages)
    .values({
      threadId: open.id,
      gmailMessageId: 'g-1',
      direction: 'in',
      fromAddr: 'คุณลูกค้า <customer@brand-x.test>',
      toAddr: 'support@brand-a.test',
      snippet: 'ขอใบเสนอราคาเว็บไซต์...',
      bodyKey: `inbox/${box!.id}/g-1.html`,
      sentAt: new Date(1_765_000_000_000),
    })
    .returning()
  const [att] = await db
    .insert(inboxAttachments)
    .values({
      messageId: msg!.id,
      gmailAttachmentId: 'gatt-1',
      filename: 'สเปคงาน.pdf',
      mime: 'application/pdf',
      sizeBytes: 1234,
    })
    .returning()

  return { db, box: box!, open, mine, assigned, closed, spam, msg: msg!, att: att! }
}

describe('E3 — permission: ใช้งาน inbox = owner+member · vendor ❌ · ติดตั้งยังเป็น owner', () => {
  it('member ใช้ threads ได้ · vendor 403 ทุกเส้น · member แตะ settings ไม่ได้', async () => {
    await seedInbox()
    const member = await loginAs(app, 'pond@example-co.test')
    const vendor = await loginAs(app, 'somchai@example.com')

    expect((await app.request('/api/inbox/threads', { headers: { cookie: member } }, env)).status).toBe(200)
    expect((await app.request('/api/inbox/threads', { headers: { cookie: vendor } }, env)).status).toBe(403)
    expect(
      (await app.request('/api/inbox/threads/xx', { headers: { cookie: vendor } }, env)).status,
    ).toBe(403)
    expect(
      (await app.request('/api/inbox/attachments/xx/download', { headers: { cookie: vendor } }, env))
        .status,
    ).toBe(403)
    expect(
      (await app.request('/api/inbox/settings', { headers: { cookie: member } }, env)).status,
    ).toBe(403)
  })
})

describe('E3 — list: folder/counts/ตัวเลือกกล่อง/ค้นหา', () => {
  it('counts ถูกต่อ folder · default = ยังไม่มอบหมาย · mine ของแต่ละคนต่างกัน', async () => {
    await seedInbox()
    const owner = await loginAs(app, 'owner@example-co.test')
    const res = (await (
      await app.request('/api/inbox/threads', { headers: { cookie: owner } }, env)
    ).json()) as {
      threads: { subject: string }[]
      counts: Record<string, number>
      mailboxes: { unread: number }[]
    }
    expect(res.counts).toMatchObject({
      unassigned: 1, // open ที่ไม่มีเจ้าของ = ขอใบเสนอราคา
      mine: 1, // ของ owner
      assigned: 2, // open ที่มีเจ้าของ (owner + ปอนด์)
      closed: 1,
      spam: 1,
      all: 5,
      drafts: 0,
    })
    expect(res.threads.map((t) => t.subject)).toContain('ขอใบเสนอราคา')
    expect(res.mailboxes[0]?.unread).toBe(1)
  })

  it('folder=mine ของ member เห็นเฉพาะของตัวเอง · q ค้นหัวข้อ · mailbox filter', async () => {
    const { box } = await seedInbox()
    const member = await loginAs(app, 'pond@example-co.test')
    const mine = (await (
      await app.request('/api/inbox/threads?folder=mine', { headers: { cookie: member } }, env)
    ).json()) as { threads: { subject: string }[] }
    expect(mine.threads.map((t) => t.subject)).toEqual(['มอบหมายให้ปอนด์'])

    const q = (await (
      await app.request('/api/inbox/threads?folder=all&q=ใบเสนอ', { headers: { cookie: member } }, env)
    ).json()) as { threads: { subject: string }[] }
    expect(q.threads.map((t) => t.subject)).toEqual(['ขอใบเสนอราคา'])

    const byBox = (await (
      await app.request(`/api/inbox/threads?folder=all&mailbox=${box.id}`, { headers: { cookie: member } }, env)
    ).json()) as { threads: unknown[] }
    expect(byBox.threads).toHaveLength(5)
    const ghost = (await (
      await app.request('/api/inbox/threads?folder=all&mailbox=ghost', { headers: { cookie: member } }, env)
    ).json()) as { threads: unknown[] }
    expect(ghost.threads).toHaveLength(0)
  })

  it('แถว list มี เลขที่ (number) · preview · ไอคอนแนบ · ผู้ส่งล่าสุด', async () => {
    await seedInbox()
    const owner = await loginAs(app, 'owner@example-co.test')
    const res = (await (
      await app.request('/api/inbox/threads?folder=all&q=ใบเสนอ', { headers: { cookie: owner } }, env)
    ).json()) as {
      threads: {
        number: number
        preview: string | null
        hasAttachment: number
        latestFrom: string | null
      }[]
    }
    const t = res.threads[0]!
    expect(t.number).toBeGreaterThan(0)
    expect(t.preview).toContain('ขอใบเสนอราคา')
    expect(t.hasAttachment).toBe(1)
    expect(t.latestFrom).toContain('คุณลูกค้า')
  })
})

describe('E3 — detail: mark read + body จาก R2 + การ์ดลูกค้า + อีเมลที่ผ่านมา', () => {
  it('เปิดแล้ว unread → false · body html มา · client เทียบจาก contactEmail · past ไม่รวมตัวเอง', async () => {
    const { db, open } = await seedInbox()
    await db.insert(clients).values({
      name: 'บริษัท แบรนด์เอ็กซ์',
      contactEmail: 'customer@brand-x.test',
      logo: '🏢',
    })
    const owner = await loginAs(app, 'owner@example-co.test')
    const res = await app.request(`/api/inbox/threads/${open.id}`, { headers: { cookie: owner } }, env)
    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      thread: { unread: boolean }
      messages: { body: { content: string; contentType: string } | null; attachments: unknown[] }[]
      client: { name: string } | null
      past: { items: { subject: string }[]; total: number }
    }
    expect(data.thread.unread).toBe(false)
    expect(data.messages[0]?.body?.content).toContain('ขอใบเสนอราคา')
    expect(data.messages[0]?.body?.contentType).toContain('text/html')
    expect(data.messages[0]?.attachments).toHaveLength(1)
    expect(data.client?.name).toBe('บริษัท แบรนด์เอ็กซ์')
    // past = thread อื่นของ contact เดียวกัน (mine/assigned/spam ใช้ contact เดียวกัน = 3)
    expect(data.past.total).toBe(3)

    const row = await env.DB.prepare('SELECT unread FROM inbox_threads WHERE id = ?')
      .bind(open.id)
      .first<{ unread: number }>()
    expect(row?.unread).toBe(0)
  })
})

describe('E3 — PATCH: สถานะ/มอบหมาย', () => {
  it('ปิด → unread เคลียร์ · เปิดกลับ · มอบหมาย member ได้ / vendor ไม่ได้ / ghost ไม่ได้', async () => {
    const { open } = await seedInbox()
    const member = await loginAs(app, 'pond@example-co.test')

    const closed = await app.request(
      `/api/inbox/threads/${open.id}`,
      json(member, { status: 'closed' }, 'PATCH'),
      env,
    )
    expect(closed.status).toBe(200)
    const row = await env.DB.prepare('SELECT status, unread FROM inbox_threads WHERE id = ?')
      .bind(open.id)
      .first<{ status: string; unread: number }>()
    expect(row).toMatchObject({ status: 'closed', unread: 0 })

    await app.request(`/api/inbox/threads/${open.id}`, json(member, { status: 'open', assigneeId: 'u_pond' }, 'PATCH'), env)
    const row2 = await env.DB.prepare('SELECT status, assignee_id FROM inbox_threads WHERE id = ?')
      .bind(open.id)
      .first<{ status: string; assignee_id: string }>()
    expect(row2).toMatchObject({ status: 'open', assignee_id: 'u_pond' })

    expect(
      (await app.request(`/api/inbox/threads/${open.id}`, json(member, { assigneeId: 'u_somchai' }, 'PATCH'), env)).status,
    ).toBe(400) // vendor
    expect(
      (await app.request(`/api/inbox/threads/${open.id}`, json(member, { assigneeId: 'ghost' }, 'PATCH'), env)).status,
    ).toBe(400)
    expect(
      (await app.request(`/api/inbox/threads/${open.id}`, json(member, {}, 'PATCH'), env)).status,
    ).toBe(400)
  })
})

describe('E3 — attachment download (lazy + cache R2)', () => {
  it('ครั้งแรกดึงจาก Gmail → cache → ครั้งสองอ่านจาก R2 ไม่แตะ Gmail', async () => {
    const { att } = await seedInbox()
    const owner = await loginAs(app, 'owner@example-co.test')
    const calls: string[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input)
      calls.push(url)
      if (url.startsWith('https://oauth2.googleapis.com/token'))
        return Response.json({ access_token: 'at' })
      if (url.includes('/attachments/gatt-1'))
        return Response.json({ data: btoa('PDF-BYTES').replace(/\+/g, '-').replace(/\//g, '_') })
      throw new Error(`unexpected fetch: ${url}`)
    })

    const first = await app.request(
      `/api/inbox/attachments/${att.id}/download`,
      { headers: { cookie: owner } },
      env,
    )
    expect(first.status).toBe(200)
    expect(await first.text()).toBe('PDF-BYTES')
    expect(first.headers.get('content-disposition')).toContain("filename*=UTF-8''")
    expect(calls.some((u) => u.includes('/attachments/gatt-1'))).toBe(true)

    calls.length = 0
    const second = await app.request(
      `/api/inbox/attachments/${att.id}/download`,
      { headers: { cookie: owner } },
      env,
    )
    expect(second.status).toBe(200)
    expect(await second.text()).toBe('PDF-BYTES')
    expect(calls).toHaveLength(0) // มาจาก R2 cache ล้วน
  })

  it('กล่องหลุดการเชื่อมต่อ + ยังไม่เคย cache → 409 บอกชัด', async () => {
    const { att } = await seedInbox()
    await env.DB.prepare("UPDATE inbox_mailboxes SET status='disconnected'").run()
    const owner = await loginAs(app, 'owner@example-co.test')
    const res = await app.request(
      `/api/inbox/attachments/${att.id}/download`,
      { headers: { cookie: owner } },
      env,
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'mailbox_disconnected' })
  })
})
