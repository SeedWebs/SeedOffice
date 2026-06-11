import { env } from 'cloudflare:test'
import { createDb, inboxGoogleClients, inboxMailboxes, inboxThreads } from '@seedoffice/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { encryptSecret } from '../src/lib/crypto'
import { loginAs, seedUsers } from './helpers'

const json = (cookie: string, body: unknown) => ({
  method: 'POST',
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const b64url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

beforeEach(async () => {
  await seedUsers()
  for (const t of [
    'inbox_notes',
    'inbox_canned',
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

/** 2 กล่อง connected (จำลอง multi-account) + thread local 1 อัน */
async function seedTwoBoxes() {
  const db = createDb(env.DB)
  const [gc] = await db
    .insert(inboxGoogleClients)
    .values({
      label: 'A',
      clientId: 'client-a.apps.googleusercontent.com',
      clientSecretEnc: await encryptSecret('GOCSPX-secret', env.INBOX_ENC_KEY),
    })
    .returning()
  const mkBox = async (name: string, email: string) =>
    (
      await db
        .insert(inboxMailboxes)
        .values({
          clientId: gc!.id,
          companyLabel: 'A',
          name,
          emailAddress: email,
          refreshTokenEnc: await encryptSecret('rt-x', env.INBOX_ENC_KEY),
          status: 'connected',
          connectedAt: new Date(),
        })
        .returning()
    )[0]!
  const box1 = await mkBox('ซัพพอร์ต', 'support@brand-a.test')
  const box2 = await mkBox('บัญชี', 'account@brand-a.test')
  const [localThread] = await db
    .insert(inboxThreads)
    .values({
      mailboxId: box1.id,
      gmailThreadId: 'gt-local',
      subject: 'ขอใบเสนอราคาระบบ LMS',
      contactEmail: 'customer@x.test',
      lastMessageAt: new Date(1_765_000_000_000),
    })
    .returning()
  return { db, box1, box2, localThread: localThread! }
}

/** mock Gmail: list คืน thread ตามกล่อง + metadata + threads.get สำหรับ import */
function mockGmailSearch(calls: string[]) {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    calls.push(url)
    if (url.startsWith('https://oauth2.googleapis.com/token'))
      return Response.json({ access_token: 'at' })
    if (url.includes('/messages?q='))
      return Response.json({
        messages: [
          { id: 'm-old-1', threadId: 'gt-old-1' },
          { id: 'm-old-1b', threadId: 'gt-old-1' }, // thread เดิม — ต้อง dedupe
          { id: 'm-local', threadId: 'gt-local' }, // เคย import แล้ว
        ],
      })
    if (url.includes('format=metadata'))
      return Response.json({
        internalDate: '1735000000000',
        payload: {
          headers: [
            { name: 'Subject', value: 'ใบแจ้งหนี้เดือนมกราคม' },
            { name: 'From', value: 'ลูกค้าเก่า <old@x.test>' },
          ],
        },
      })
    if (url.includes('/threads/gt-old-1?format=full'))
      return Response.json({
        messages: [
          {
            id: 'm-old-1',
            threadId: 'gt-old-1',
            labelIds: [], // archived — ต้องเข้าเป็น closed/อ่านแล้ว
            snippet: 'ใบแจ้งหนี้...',
            internalDate: '1735000000000',
            payload: {
              mimeType: 'text/html',
              headers: [
                { name: 'Subject', value: 'ใบแจ้งหนี้เดือนมกราคม' },
                { name: 'From', value: 'ลูกค้าเก่า <old@x.test>' },
                { name: 'To', value: 'support@brand-a.test' },
              ],
              body: { data: b64url('<p>รายละเอียดใบแจ้งหนี้</p>') },
            },
          },
        ],
      })
    throw new Error(`unexpected fetch: ${url}`)
  })
}

describe('hybrid search — ค้นทุกกล่องขนาน + import on-demand', () => {
  it('vendor 403 ทั้ง search และ import', async () => {
    const vendor = await loginAs(app, 'somchai@example.com')
    expect(
      (await app.request('/api/inbox/search?q=x', { headers: { cookie: vendor } }, env)).status,
    ).toBe(403)
    expect(
      (await app.request('/api/inbox/import-thread', json(vendor, { mailboxId: 'x', gmailThreadId: 'y' }), env))
        .status,
    ).toBe(403)
  })

  it('ค้นแล้วได้ local + remote จากทุกกล่อง · dedupe thread · ตัวที่เคย import ชี้ localThreadId', async () => {
    const { localThread } = await seedTwoBoxes()
    const member = await loginAs(app, 'pond@example-co.test')
    const calls: string[] = []
    mockGmailSearch(calls)

    const res = await app.request(
      `/api/inbox/search?q=${encodeURIComponent('ใบ')}`,
      { headers: { cookie: member } },
      env,
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      local: { subject: string }[]
      remote: { gmailThreadId: string; localThreadId: string | null; subject: string; mailboxId: string }[]
      partial: string[]
    }
    // local เจอจาก LIKE
    expect(data.local.map((l) => l.subject)).toContain('ขอใบเสนอราคาระบบ LMS')
    // ค้นครบ 2 กล่องแบบขนาน (list ถูกเรียก 2 ครั้ง)
    expect(calls.filter((u) => u.includes('/messages?q=')).length).toBe(2)
    // dedupe: gt-old-1 มี 2 ฉบับ → เหลือรายการเดียวต่อกล่อง
    const old1 = data.remote.filter((r) => r.gmailThreadId === 'gt-old-1')
    expect(old1).toHaveLength(2) // กล่องละ 1 (mock คืนชุดเดียวกันทั้ง 2 กล่อง)
    expect(old1[0]!.subject).toBe('ใบแจ้งหนี้เดือนมกราคม')
    // ตัวที่เคยอยู่ในระบบ → ชี้ local id (เฉพาะกล่องที่ mailboxId ตรง)
    const linked = data.remote.find((r) => r.gmailThreadId === 'gt-local' && r.localThreadId)
    expect(linked?.localThreadId).toBe(localThread.id)
    expect(data.partial).toEqual([])
  })

  it('คำค้นไทยยาว (>50 bytes UTF-8) ไม่ระเบิด — regression: D1 LIKE pattern too complex', async () => {
    const { db, box1 } = await seedTwoBoxes()
    await db.insert(inboxThreads).values({
      mailboxId: box1.id,
      gmailThreadId: 'gt-thai-long',
      subject: 'ลูกค้าแจ้งเปิดใช้ปลั๊กอินไม่ได้หลังอัปเดต',
      contactEmail: 'plug@x.test',
      lastMessageAt: new Date(),
    })
    const member = await loginAs(app, 'pond@example-co.test')
    mockGmailSearch([])
    const long = 'เปิดใช้ปลั๊กอินไม่ได้' // ~60 bytes — เคยทำ LIKE ระเบิดบน D1
    const search = await app.request(
      `/api/inbox/search?q=${encodeURIComponent(long)}`,
      { headers: { cookie: member } },
      env,
    )
    expect(search.status).toBe(200)
    const data = (await search.json()) as { local: { subject: string }[] }
    expect(data.local.map((l) => l.subject)).toContain('ลูกค้าแจ้งเปิดใช้ปลั๊กอินไม่ได้หลังอัปเดต')
    // เส้น list (?q=) ใช้เงื่อนไขเดียวกัน — ต้องรอดเหมือนกัน
    const list = await app.request(
      `/api/inbox/threads?folder=all&q=${encodeURIComponent(long)}`,
      { headers: { cookie: member } },
      env,
    )
    expect(list.status).toBe(200)
    expect(((await list.json()) as { threads: unknown[] }).threads).toHaveLength(1)
  })

  it('กล่องหนึ่งหลุดการเชื่อมต่อ → ข้าม + รายงานใน partial (อีกกล่องยังได้ผล)', async () => {
    const { box2 } = await seedTwoBoxes()
    await env.DB.prepare("UPDATE inbox_mailboxes SET refresh_token_enc = NULL WHERE id = ?")
      .bind(box2.id)
      .run() // token หาย → ReconnectError
    const member = await loginAs(app, 'pond@example-co.test')
    const calls: string[] = []
    mockGmailSearch(calls)
    const res = await app.request('/api/inbox/search?q=test', { headers: { cookie: member } }, env)
    const data = (await res.json()) as { remote: unknown[]; partial: string[] }
    expect(data.partial).toEqual(['บัญชี'])
    expect(data.remote.length).toBeGreaterThan(0) // กล่องแรกยังค้นได้
    // กล่องที่ token หาย → ถูก mark disconnected
    const row = await env.DB.prepare('SELECT status FROM inbox_mailboxes WHERE id = ?')
      .bind(box2.id)
      .first<{ status: string }>()
    expect(row?.status).toBe('disconnected')
  })

  it('import thread → เข้าเป็น closed/อ่านแล้ว เปิดดูได้ · import ซ้ำ = id เดิม', async () => {
    const { box1 } = await seedTwoBoxes()
    const member = await loginAs(app, 'pond@example-co.test')
    const calls: string[] = []
    mockGmailSearch(calls)

    const res = await app.request(
      '/api/inbox/import-thread',
      json(member, { mailboxId: box1.id, gmailThreadId: 'gt-old-1' }),
      env,
    )
    expect(res.status).toBe(201)
    const { threadId } = (await res.json()) as { threadId: string }

    const row = await env.DB.prepare(
      'SELECT subject, status, unread, contact_email FROM inbox_threads WHERE id = ?',
    )
      .bind(threadId)
      .first<Record<string, unknown>>()
    expect(row).toMatchObject({
      subject: 'ใบแจ้งหนี้เดือนมกราคม',
      status: 'closed', // backfill semantics — ประวัติ ไม่รก inbox
      unread: 0,
      contact_email: 'old@x.test',
    })
    // เปิด detail ได้ปกติ + body มาจาก R2
    const detail = (await (
      await app.request(`/api/inbox/threads/${threadId}`, { headers: { cookie: member } }, env)
    ).json()) as { messages: { body: { content: string } | null }[] }
    expect(detail.messages[0]?.body?.content).toContain('รายละเอียดใบแจ้งหนี้')

    // import ซ้ำ → idempotent ได้ thread เดิม
    const again = await app.request(
      '/api/inbox/import-thread',
      json(member, { mailboxId: box1.id, gmailThreadId: 'gt-old-1' }),
      env,
    )
    expect(((await again.json()) as { threadId: string }).threadId).toBe(threadId)
    const count = await env.DB.prepare('SELECT COUNT(*) n FROM inbox_threads WHERE gmail_thread_id = ?')
      .bind('gt-old-1')
      .first<{ n: number }>()
    expect(count?.n).toBe(1)
  })
})
