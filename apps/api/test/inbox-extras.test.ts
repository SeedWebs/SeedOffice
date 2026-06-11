import { env } from 'cloudflare:test'
import { createDb, inboxGoogleClients, inboxMailboxes, inboxThreads } from '@seedoffice/db'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../src/index'
import { encryptSecret } from '../src/lib/crypto'
import { wakeSnoozedThreads } from '../src/lib/inbox-sync'
import { loginAs, seedUsers } from './helpers'

const json = (cookie: string, body: unknown, method = 'POST') => ({
  method,
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

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
      name: 'ซัพพอร์ต',
      emailAddress: 'support@brand-a.test',
      status: 'connected',
    })
    .returning()
  const [thread] = await db
    .insert(inboxThreads)
    .values({
      mailboxId: box!.id,
      gmailThreadId: 'gt-1',
      subject: 'เรื่องทดสอบ',
      contactEmail: 'customer@x.test',
      lastMessageAt: new Date(1_765_000_000_000),
    })
    .returning()
  return { db, thread: thread! }
}

describe('E5 — โน้ตภายใน', () => {
  it('โพสต์โน้ต → โผล่ใน detail พร้อมชื่อคนเขียน · vendor 403 · ว่าง 400', async () => {
    const { thread } = await seedThread()
    const member = await loginAs(app, 'pond@example-co.test')
    const vendor = await loginAs(app, 'somchai@example.com')

    expect(
      (await app.request(`/api/inbox/threads/${thread.id}/notes`, json(vendor, { body: 'x' }), env))
        .status,
    ).toBe(403)
    expect(
      (await app.request(`/api/inbox/threads/${thread.id}/notes`, json(member, { body: '' }), env))
        .status,
    ).toBe(400)

    const created = await app.request(
      `/api/inbox/threads/${thread.id}/notes`,
      json(member, { body: 'ลูกค้ารายนี้รอใบเสนอราคาอยู่ อย่าลืมตามต่อ' }),
      env,
    )
    expect(created.status).toBe(201)

    const detail = (await (
      await app.request(`/api/inbox/threads/${thread.id}`, { headers: { cookie: member } }, env)
    ).json()) as { notes: { body: string; userName: string }[] }
    expect(detail.notes).toHaveLength(1)
    expect(detail.notes[0]).toMatchObject({ userName: 'ปอนด์' })
  })
})

describe('E5 — tags', () => {
  it('ติด tags ผ่าน PATCH → อ่านได้จาก detail · เกิน 10 → 400', async () => {
    const { thread } = await seedThread()
    const owner = await loginAs(app, 'owner@example-co.test')
    const ok = await app.request(
      `/api/inbox/threads/${thread.id}`,
      json(owner, { tags: ['ด่วน', 'รอลูกค้า'] }, 'PATCH'),
      env,
    )
    expect(ok.status).toBe(200)
    const detail = (await (
      await app.request(`/api/inbox/threads/${thread.id}`, { headers: { cookie: owner } }, env)
    ).json()) as { thread: { tags: string[] | null } }
    expect(detail.thread.tags).toEqual(['ด่วน', 'รอลูกค้า'])

    const tooMany = await app.request(
      `/api/inbox/threads/${thread.id}`,
      json(owner, { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }, 'PATCH'),
      env,
    )
    expect(tooMany.status).toBe(400)
  })
})

describe('E5 — canned replies', () => {
  it('ทีมเพิ่ม/ลิสต์/ลบ (soft) ได้ · vendor 403', async () => {
    const member = await loginAs(app, 'pond@example-co.test')
    const vendor = await loginAs(app, 'somchai@example.com')
    expect((await app.request('/api/inbox/canned', { headers: { cookie: vendor } }, env)).status).toBe(403)

    const created = await app.request(
      '/api/inbox/canned',
      json(member, { title: 'ขอบคุณ + แจ้งรับเรื่อง', body: 'ขอบคุณที่ติดต่อเข้ามาครับ ทีมงานรับเรื่องแล้ว' }),
      env,
    )
    expect(created.status).toBe(201)
    const { id } = (await created.json()) as { id: string }

    let list = (await (
      await app.request('/api/inbox/canned', { headers: { cookie: member } }, env)
    ).json()) as { items: { id: string }[] }
    expect(list.items).toHaveLength(1)

    expect(
      (await app.request(`/api/inbox/canned/${id}`, { method: 'DELETE', headers: { cookie: member } }, env))
        .status,
    ).toBe(200)
    list = (await (
      await app.request('/api/inbox/canned', { headers: { cookie: member } }, env)
    ).json()) as { items: { id: string }[] }
    expect(list.items).toHaveLength(0)
    // soft: แถวยังอยู่
    const row = await env.DB.prepare('SELECT deleted_at FROM inbox_canned WHERE id = ?')
      .bind(id)
      .first<{ deleted_at: number | null }>()
    expect(row?.deleted_at).not.toBeNull()
  })
})

describe('E5 — snooze + ปลุกอัตโนมัติ', () => {
  it('snoozed ต้องมีเวลาอนาคต · เลื่อนแล้ว unread เคลียร์ · cron ปลุกเฉพาะที่ครบเวลา → open+unread', async () => {
    const { db, thread } = await seedThread()
    const owner = await loginAs(app, 'owner@example-co.test')

    expect(
      (await app.request(`/api/inbox/threads/${thread.id}`, json(owner, { status: 'snoozed' }, 'PATCH'), env))
        .status,
    ).toBe(400) // ไม่บอกเวลา
    expect(
      (
        await app.request(
          `/api/inbox/threads/${thread.id}`,
          json(owner, { status: 'snoozed', snoozeUntil: new Date(Date.now() - 1000).toISOString() }, 'PATCH'),
          env,
        )
      ).status,
    ).toBe(400) // เวลาอดีต

    const future = new Date(Date.now() + 3 * 86_400_000).toISOString()
    const ok = await app.request(
      `/api/inbox/threads/${thread.id}`,
      json(owner, { status: 'snoozed', snoozeUntil: future }, 'PATCH'),
      env,
    )
    expect(ok.status).toBe(200)
    const row = await env.DB.prepare('SELECT status, unread, snooze_until FROM inbox_threads WHERE id = ?')
      .bind(thread.id)
      .first<{ status: string; unread: number; snooze_until: number }>()
    expect(row).toMatchObject({ status: 'snoozed', unread: 0 })

    // อีกตัวครบเวลาแล้ว — ต้องถูกปลุก ส่วนตัวอนาคตต้องนิ่ง
    const [due] = await db
      .insert(inboxThreads)
      .values({
        mailboxId: thread.mailboxId,
        gmailThreadId: 'gt-due',
        subject: 'ครบเวลาแล้ว',
        status: 'snoozed',
        snoozeUntil: new Date(Date.now() - 60_000),
        lastMessageAt: new Date(),
      })
      .returning()
    await wakeSnoozedThreads(env)

    const woke = await env.DB.prepare('SELECT status, unread, snooze_until FROM inbox_threads WHERE id = ?')
      .bind(due!.id)
      .first<{ status: string; unread: number; snooze_until: number | null }>()
    expect(woke).toMatchObject({ status: 'open', unread: 1, snooze_until: null })
    const still = await env.DB.prepare('SELECT status FROM inbox_threads WHERE id = ?')
      .bind(thread.id)
      .first<{ status: string }>()
    expect(still?.status).toBe('snoozed') // ยังไม่ถึงเวลา — นิ่ง
  })
})

describe('E5 — collision ws endpoint', () => {
  it('ไม่มี upgrade header → 426 · vendor → 403', async () => {
    const { thread } = await seedThread()
    const member = await loginAs(app, 'pond@example-co.test')
    const vendor = await loginAs(app, 'somchai@example.com')
    expect(
      (await app.request(`/api/inbox/threads/${thread.id}/ws`, { headers: { cookie: member } }, env))
        .status,
    ).toBe(426)
    expect(
      (await app.request(`/api/inbox/threads/${thread.id}/ws`, { headers: { cookie: vendor } }, env))
        .status,
    ).toBe(403)
  })
})
