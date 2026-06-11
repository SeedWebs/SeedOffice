import { env } from 'cloudflare:test'
import { calendarEvents, createDb } from '@seedoffice/db'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildIcs } from '../src/lib/ics'
import { app } from '../src/index'
import { loginAs, seedUsers } from './helpers'

const CAL = { name: 'ทีม', dtstamp: '20260611T030000Z', prodId: '-//Test//TH' }

describe('E6 — buildIcs (pure RFC5545)', () => {
  it('โครง VCALENDAR + VEVENT ต่อ event + CRLF + all-day DTEND = วันถัดไป (exclusive)', () => {
    const ics = buildIcs([{ uid: 'a@x', summary: 'ประชุม', start: '2026-06-15' }], CAL)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('BEGIN:VEVENT\r\n')
    expect(ics).toContain('UID:a@x\r\n')
    expect(ics).toContain('DTSTART;VALUE=DATE:20260615\r\n')
    expect(ics).toContain('DTEND;VALUE=DATE:20260616\r\n') // +1 วัน
    expect(ics).toContain('SUMMARY:ประชุม\r\n')
    expect(ics.endsWith('\r\n')).toBe(true)
  })

  it('หลายวัน → DTEND = endDate + 1 วัน', () => {
    const ics = buildIcs([{ uid: 'b@x', summary: 'อบรม', start: '2026-06-15', end: '2026-06-17' }], CAL)
    expect(ics).toContain('DTSTART;VALUE=DATE:20260615\r\n')
    expect(ics).toContain('DTEND;VALUE=DATE:20260618\r\n')
  })

  it('escape อักขระพิเศษใน SUMMARY (, ; \\ และขึ้นบรรทัดใหม่)', () => {
    const ics = buildIcs([{ uid: 'c@x', summary: 'a,b;c\\d\ne', start: '2026-06-15' }], CAL)
    expect(ics).toContain('SUMMARY:a\\,b\\;c\\\\d\\ne\r\n')
  })

  it('พับบรรทัดยาว ≤75 octet โดยไม่ตัดกลางตัวอักษรไทย (บรรทัดต่อขึ้นต้นช่องว่าง)', () => {
    const long = 'ก'.repeat(60) // 'ก' = 3 octet → SUMMARY:+180 octet
    const ics = buildIcs([{ uid: 'd@x', summary: long, start: '2026-06-15' }], CAL)
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
    // unfold (CRLF + space) แล้วต้องได้ summary เดิมกลับมา
    const unfolded = ics.split('\r\n').reduce((acc, l) => (l.startsWith(' ') ? acc + l.slice(1) : acc + '\n' + l))
    expect(unfolded).toContain(`SUMMARY:${long}`)
  })
})

describe('E6 — ICS feed สาธารณะ + owner ics-link', () => {
  beforeEach(async () => {
    await seedUsers()
    // เริ่มทุกเทสต์โดยปิดลิงก์ (storage แชร์ข้ามไฟล์)
    const owner = await loginAs(app, 'owner@example-co.test')
    await app.request('/api/admin/ics-link', { method: 'DELETE', headers: { cookie: owner } }, env)
  })

  it('owner สร้างลิงก์ → feed สาธารณะ (ไม่มี cookie) คืน text/calendar + มี event', async () => {
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
    await createDb(env.DB)
      .insert(calendarEvents)
      .values({ id: 'ev_ics_test', title: 'อีเวนต์ทดสอบ ICS', startDate: today, type: 'meeting', createdBy: 'u_owner' })
      .onConflictDoNothing()

    const owner = await loginAs(app, 'owner@example-co.test')
    const gen = await app.request('/api/admin/ics-link/regenerate', { method: 'POST', headers: { cookie: owner } }, env)
    expect(gen.status).toBe(200)
    const { url } = (await gen.json()) as { url: string }
    expect(url).toMatch(/\/api\/calendar\/feed\/[0-9a-f]{64}$/)

    const path = new URL(url).pathname
    const feed = await app.request(path, {}, env) // ไม่มี cookie = สาธารณะ
    expect(feed.status).toBe(200)
    expect(feed.headers.get('content-type')).toContain('text/calendar')
    const body = await feed.text()
    expect(body).toContain('BEGIN:VCALENDAR')
    expect(body).toContain('อีเวนต์ทดสอบ ICS')
  })

  it('token ผิด / ปิดอยู่ / รีเซ็ตแล้วใช้ของเดิม → 404', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    // ปิดอยู่ (beforeEach ลบไปแล้ว) — เดา token → 404
    expect((await app.request(`/api/calendar/feed/${'0'.repeat(64)}`, {}, env)).status).toBe(404)

    const gen1 = await app.request('/api/admin/ics-link/regenerate', { method: 'POST', headers: { cookie: owner } }, env)
    const old = new URL(((await gen1.json()) as { url: string }).url).pathname
    expect((await app.request(old, {}, env)).status).toBe(200)

    // รีเซ็ตใหม่ → ลิงก์เดิมต้องใช้ไม่ได้
    await app.request('/api/admin/ics-link/regenerate', { method: 'POST', headers: { cookie: owner } }, env)
    expect((await app.request(old, {}, env)).status).toBe(404)

    // ปิดลิงก์ → 404
    const gen2 = await app.request('/api/admin/ics-link/regenerate', { method: 'POST', headers: { cookie: owner } }, env)
    const cur = new URL(((await gen2.json()) as { url: string }).url).pathname
    expect((await app.request(cur, {}, env)).status).toBe(200)
    await app.request('/api/admin/ics-link', { method: 'DELETE', headers: { cookie: owner } }, env)
    expect((await app.request(cur, {}, env)).status).toBe(404)
  })

  it('privacy: GET /api/config ไม่หลุด icsToken · member/vendor เข้า /api/admin/ics-link ไม่ได้ (403)', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    await app.request('/api/admin/ics-link/regenerate', { method: 'POST', headers: { cookie: owner } }, env)

    const member = await loginAs(app, 'pond@example-co.test')
    const vendor = await loginAs(app, 'somchai@example.com')
    const cfg = await (await app.request('/api/config', { headers: { cookie: member } }, env)).json()
    expect(cfg).not.toHaveProperty('icsToken')

    expect((await app.request('/api/admin/ics-link', { headers: { cookie: member } }, env)).status).toBe(403)
    expect((await app.request('/api/admin/ics-link', { headers: { cookie: vendor } }, env)).status).toBe(403)
  })
})
