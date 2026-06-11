import {
  calendarConnections,
  calendarEvents,
  createDb,
  inboxGoogleClients,
  users,
  type CalendarConnection,
} from '@seedoffice/db'
import { and, eq, isNull } from 'drizzle-orm'
import { decryptSecret } from './crypto'
import { mapGcalEvent, type GcalEvent } from './gcal'
import { ReconnectError } from './inbox-sync'

/**
 * Sync ขาเข้า Google Calendar (SPEC §4.14 · E6) — อ่านอย่างเดียว (calendar.readonly)
 * - initial: ดึง events ตั้งแต่ 30 วันก่อนหน้า (singleEvents = ขยาย recurring) + เก็บ syncToken
 * - incremental: ใช้ syncToken ดึงเฉพาะที่เปลี่ยน (รวม cancelled → ลบของเดิม)
 * - syncToken หมดอายุ (410) → ล้างแล้ว full resync
 * - refresh token เพิกถอน → connection disconnected + lastError
 * - idempotent: upsert ด้วย gcalId (cron ทับซ้อนได้)
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GCAL_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const MAX_PAGES = 20

/** ขอ access token ของ connection (refresh flow) — ใช้ client ตัวเดียวกับอีเมลกลาง */
async function getCalendarAccessToken(env: Env, conn: CalendarConnection): Promise<string> {
  const db = createDb(env.DB)
  const [client] = await db
    .select()
    .from(inboxGoogleClients)
    .where(and(eq(inboxGoogleClients.id, conn.clientId), isNull(inboxGoogleClients.deletedAt)))
  if (!client) throw new Error('client_not_found')
  if (!conn.refreshTokenEnc) throw new ReconnectError()
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: await decryptSecret(client.clientSecretEnc, env.INBOX_ENC_KEY),
      refresh_token: await decryptSecret(conn.refreshTokenEnc, env.INBOX_ENC_KEY),
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

interface EventsPage {
  items?: GcalEvent[]
  nextPageToken?: string
  nextSyncToken?: string
}

/** ดึงทุกหน้า — คืน items รวม + syncToken ล่าสุด · status 410 = syncToken หมดอายุ */
async function fetchEvents(
  token: string,
  syncToken: string | null,
): Promise<{ items: GcalEvent[]; syncToken: string | null; expired: boolean }> {
  const items: GcalEvent[] = []
  let pageToken: string | undefined
  let nextSyncToken: string | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ maxResults: '250' })
    if (syncToken) params.set('syncToken', syncToken)
    else {
      params.set('singleEvents', 'true')
      params.set('timeMin', new Date(Date.now() - 30 * 86_400_000).toISOString())
    }
    if (pageToken) params.set('pageToken', pageToken)
    const res = await fetch(`${GCAL_EVENTS_URL}?${params}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    if (res.status === 410) return { items: [], syncToken: null, expired: true }
    if (!res.ok) throw new Error(`gcal_events_failed (${res.status})`)
    const data = (await res.json()) as EventsPage
    if (data.items) items.push(...data.items)
    nextSyncToken = data.nextSyncToken ?? nextSyncToken
    if (!data.nextPageToken) break
    pageToken = data.nextPageToken
  }
  return { items, syncToken: nextSyncToken, expired: false }
}

/** เขียน events ที่ map แล้วลง calendar_events (upsert/ลบ ด้วย gcalId) */
async function applyEvents(env: Env, items: GcalEvent[], ownerId: string): Promise<void> {
  const db = createDb(env.DB)
  for (const raw of items) {
    const m = mapGcalEvent(raw)
    if (!m) continue
    const [existing] = await db
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(eq(calendarEvents.gcalId, m.gcalId))
      .limit(1)
    if (m.cancelled) {
      if (existing) await db.delete(calendarEvents).where(eq(calendarEvents.id, existing.id))
      continue
    }
    if (existing) {
      await db
        .update(calendarEvents)
        .set({ title: m.title, startDate: m.startDate, endDate: m.endDate })
        .where(eq(calendarEvents.id, existing.id))
    } else {
      await db.insert(calendarEvents).values({
        title: m.title,
        startDate: m.startDate,
        endDate: m.endDate,
        type: 'meeting',
        source: 'gcal',
        gcalId: m.gcalId,
        createdBy: ownerId,
      })
    }
  }
}

/** sync 1 connection — โยน ReconnectError ถ้า token เพิกถอน (route/cron จัดการ disconnected) */
export async function syncCalendar(env: Env, connectionId: string): Promise<void> {
  const db = createDb(env.DB)
  const [conn] = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.id, connectionId))
  if (!conn || conn.status !== 'connected') return
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.role, 'owner')).limit(1)
  if (!owner) return // ไม่มี owner ให้ผูก createdBy — ข้าม

  const token = await getCalendarAccessToken(env, conn)
  let result = await fetchEvents(token, conn.syncToken)
  if (result.expired) {
    // syncToken หมดอายุ → full resync แล้วตั้ง token ใหม่
    result = await fetchEvents(token, null)
  }
  await applyEvents(env, result.items, owner.id)
  await db
    .update(calendarConnections)
    .set({ syncToken: result.syncToken, lastSyncAt: new Date(), lastError: null })
    .where(eq(calendarConnections.id, conn.id))
}

/** sync ทุก connection ที่เชื่อม (เรียกจาก cron) — กลืน error รายตัวเป็น lastError */
export async function syncAllCalendars(env: Env): Promise<void> {
  const db = createDb(env.DB)
  const conns = await db
    .select({ id: calendarConnections.id })
    .from(calendarConnections)
    .where(eq(calendarConnections.status, 'connected'))
  for (const c of conns) {
    try {
      await syncCalendar(env, c.id)
    } catch (e) {
      const disconnected = e instanceof ReconnectError
      await db
        .update(calendarConnections)
        .set({
          lastError: disconnected ? 'token ถูกเพิกถอน — กดเชื่อมใหม่' : String(e),
          ...(disconnected ? { status: 'disconnected' as const } : {}),
        })
        .where(eq(calendarConnections.id, c.id))
    }
  }
}
