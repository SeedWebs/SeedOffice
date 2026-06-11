import { env } from 'cloudflare:test'
import { calendarConnections, createDb, inboxGoogleClients } from '@seedoffice/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptSecret } from '../src/lib/crypto'
import { mapGcalEvent, type GcalEvent } from '../src/lib/gcal'
import { syncAllCalendars, syncCalendar } from '../src/lib/gcal-sync'
import { app } from '../src/index'
import { loginAs, seedUsers } from './helpers'

describe('E6 — mapGcalEvent (pure)', () => {
  it('all-day วันเดียว: end exclusive → endDate null', () => {
    expect(mapGcalEvent({ id: '1', summary: 'หยุด', start: { date: '2026-06-15' }, end: { date: '2026-06-16' } }))
      .toEqual({ gcalId: '1', cancelled: false, title: 'หยุด', startDate: '2026-06-15', endDate: null })
  })
  it('all-day หลายวัน: endDate = end.date − 1', () => {
    expect(mapGcalEvent({ id: '2', summary: 'อบรม', start: { date: '2026-06-15' }, end: { date: '2026-06-18' } }))
      .toMatchObject({ startDate: '2026-06-15', endDate: '2026-06-17' })
  })
  it('มีเวลา วันเดียวกัน (BKK) → endDate null', () => {
    expect(mapGcalEvent({ id: '3', summary: 'ประชุม', start: { dateTime: '2026-06-15T14:00:00+07:00' }, end: { dateTime: '2026-06-15T15:00:00+07:00' } }))
      .toMatchObject({ startDate: '2026-06-15', endDate: null })
  })
  it('มีเวลา ข้ามเที่ยงคืนเป็นวันถัดไปในโซน BKK', () => {
    // 2026-06-15T20:00:00Z = 2026-06-16 03:00 BKK
    expect(mapGcalEvent({ id: '4', summary: 'ดึก', start: { dateTime: '2026-06-15T20:00:00Z' }, end: { dateTime: '2026-06-15T21:00:00Z' } }))
      .toMatchObject({ startDate: '2026-06-16', endDate: null })
  })
  it('cancelled → flag true (ไว้ลบของเดิม)', () => {
    expect(mapGcalEvent({ id: '5', status: 'cancelled' })).toMatchObject({ gcalId: '5', cancelled: true })
  })
  it('ไม่มี summary → "(ไม่มีชื่อ)" · ไม่มีวันเริ่ม (ไม่ cancel) → null', () => {
    expect(mapGcalEvent({ id: '6', start: { date: '2026-06-15' } })).toMatchObject({ title: '(ไม่มีชื่อ)' })
    expect(mapGcalEvent({ id: '7' })).toBeNull()
  })
})

interface MockGcal {
  tokenError?: string
  initial?: GcalEvent[]
  incremental?: GcalEvent[]
  expireSyncToken?: boolean // ตอบ 410 ครั้งแรกที่ใช้ syncToken
  calls: string[]
}

function mockGcal(m: MockGcal) {
  let expired410Sent = false
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    m.calls.push(url)
    if (url.startsWith('https://oauth2.googleapis.com/token'))
      return m.tokenError
        ? Response.json({ error: m.tokenError }, { status: 400 })
        : Response.json({ access_token: 'at-gcal' })
    if (url.includes('/calendar/v3/calendars/primary/events')) {
      const usesSync = url.includes('syncToken=')
      if (usesSync && m.expireSyncToken && !expired410Sent) {
        expired410Sent = true
        return new Response('gone', { status: 410 })
      }
      const items = usesSync ? (m.incremental ?? []) : (m.initial ?? [])
      return Response.json({ items, nextSyncToken: 'tok-next' })
    }
    throw new Error(`unexpected fetch: ${url}`)
  })
}

async function seedConnection(opts: { syncToken?: string | null } = {}) {
  const db = createDb(env.DB)
  const [client] = await db
    .insert(inboxGoogleClients)
    .values({
      label: 'SeedWebs',
      clientId: 'gcal-client.apps.googleusercontent.com',
      clientSecretEnc: await encryptSecret('GOCSPX-x', env.INBOX_ENC_KEY),
    })
    .returning()
  const [conn] = await db
    .insert(calendarConnections)
    .values({
      clientId: client!.id,
      googleEmail: 'team@example-co.test',
      googleAccountId: 'g-acc-cal',
      refreshTokenEnc: await encryptSecret('rt-cal', env.INBOX_ENC_KEY),
      status: 'connected',
      syncToken: opts.syncToken ?? null,
      connectedAt: new Date(),
    })
    .returning()
  return conn!
}

const gcalEvents = () =>
  env.DB.prepare("SELECT id, title, start_date, end_date, gcal_id FROM calendar_events WHERE source = 'gcal' ORDER BY gcal_id").all()

describe('E6 — syncCalendar (mock Google Calendar API)', () => {
  beforeEach(async () => {
    await seedUsers()
    await env.DB.prepare("DELETE FROM calendar_events WHERE source = 'gcal'").run()
    await env.DB.prepare('DELETE FROM calendar_connections').run()
    await env.DB.prepare('DELETE FROM inbox_google_clients').run()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('initial sync: insert gcal events + เก็บ syncToken', async () => {
    mockGcal({
      calls: [],
      initial: [
        { id: 'e1', summary: 'ประชุมทีม', start: { dateTime: '2026-06-15T10:00:00+07:00' }, end: { dateTime: '2026-06-15T11:00:00+07:00' } },
        { id: 'e2', summary: 'หยุดยาว', start: { date: '2026-07-01' }, end: { date: '2026-07-03' } },
      ],
    })
    const conn = await seedConnection()
    await syncCalendar(env, conn.id)

    const rows = (await gcalEvents()).results as { title: string; start_date: string; end_date: string | null; gcal_id: string }[]
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ gcal_id: 'e1', title: 'ประชุมทีม', start_date: '2026-06-15', end_date: null })
    expect(rows[1]).toMatchObject({ gcal_id: 'e2', start_date: '2026-07-01', end_date: '2026-07-02' })
    const after = await createDb(env.DB).select().from(calendarConnections).where(eq(calendarConnections.id, conn.id))
    expect(after[0]!.syncToken).toBe('tok-next')
    expect(after[0]!.lastError).toBeNull()
  })

  it('incremental: cancelled → ลบของเดิม · idempotent (รันซ้ำไม่เพิ่ม)', async () => {
    mockGcal({ calls: [], initial: [{ id: 'e1', summary: 'ก', start: { date: '2026-06-20' }, end: { date: '2026-06-21' } }] })
    const conn = await seedConnection()
    await syncCalendar(env, conn.id) // มี e1
    await syncCalendar(env, conn.id) // syncToken=tok-next → incremental ([] default) ไม่เพิ่ม
    expect((await gcalEvents()).results).toHaveLength(1)

    vi.unstubAllGlobals()
    mockGcal({ calls: [], incremental: [{ id: 'e1', status: 'cancelled' }] })
    await syncCalendar(env, conn.id) // e1 cancelled → ลบ
    expect((await gcalEvents()).results).toHaveLength(0)
  })

  it('syncToken หมดอายุ (410) → full resync', async () => {
    const m: MockGcal = { calls: [], expireSyncToken: true, initial: [{ id: 'r1', summary: 'รีซิงก์', start: { date: '2026-06-25' }, end: { date: '2026-06-26' } }] }
    mockGcal(m)
    const conn = await seedConnection({ syncToken: 'old-token' })
    await syncCalendar(env, conn.id)
    // ครั้งแรกใช้ syncToken → 410 → fallback initial (timeMin) ได้ r1
    expect(m.calls.some((u) => u.includes('syncToken=old-token'))).toBe(true)
    expect(m.calls.some((u) => u.includes('timeMin='))).toBe(true)
    expect((await gcalEvents()).results).toHaveLength(1)
  })

  it('token เพิกถอน (invalid_grant) → connection disconnected + lastError (ผ่าน syncAllCalendars)', async () => {
    mockGcal({ calls: [], tokenError: 'invalid_grant' })
    const conn = await seedConnection()
    await syncAllCalendars(env)
    const [after] = await createDb(env.DB).select().from(calendarConnections).where(eq(calendarConnections.id, conn.id))
    expect(after!.status).toBe('disconnected')
    expect(after!.lastError).toContain('เพิกถอน')
  })
})

describe('E6 — /api/calendar-connect สิทธิ์ owner', () => {
  beforeEach(async () => {
    await seedUsers()
  })

  it('member/vendor → 403 · owner → 200 (connections + clients)', async () => {
    const member = await loginAs(app, 'pond@example-co.test')
    const vendor = await loginAs(app, 'somchai@example.com')
    const owner = await loginAs(app, 'owner@example-co.test')
    expect((await app.request('/api/calendar-connect', { headers: { cookie: member } }, env)).status).toBe(403)
    expect((await app.request('/api/calendar-connect', { headers: { cookie: vendor } }, env)).status).toBe(403)
    const res = await app.request('/api/calendar-connect', { headers: { cookie: owner } }, env)
    expect(res.status).toBe(200)
    expect(await res.json()).toHaveProperty('connections')
  })

  it('connect ต้องระบุ clientId → 400 · client ไม่มี → 404', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    expect((await app.request('/api/calendar-connect/connect', { headers: { cookie: owner }, redirect: 'manual' }, env)).status).toBe(400)
    expect((await app.request('/api/calendar-connect/connect?clientId=nope', { headers: { cookie: owner }, redirect: 'manual' }, env)).status).toBe(404)
  })
})
