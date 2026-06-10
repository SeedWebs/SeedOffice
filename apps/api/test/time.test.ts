import { auditLogs, createDb } from '@seedoffice/db'
import { env } from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { loginAs, seedUsers } from './helpers'

const json = (cookie: string, body: unknown) => ({
  method: 'POST',
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

async function seedRateAndConfig(capMinutes = 480) {
  await env.DB.prepare(
    "INSERT OR REPLACE INTO rates (id, user_id, rate_satang_per_hour, effective_from, created_at) VALUES ('r_pond','u_pond',40000,'2026-01-01',0), ('r_somchai','u_somchai',35000,'2026-01-01',0)",
  ).run()
  await env.DB.prepare(
    `INSERT OR REPLACE INTO company_config (id, cutoff_day, work_hour_cap_minutes) VALUES (1, 25, ${capMinutes})`,
  ).run()
}

async function makeTask(cookie: string) {
  const p = (await (await app.request('/api/projects', json(cookie, { name: 'P', type: 'project' }), env)).json()) as { id: string }
  const g = (await (await app.request(`/api/projects/${p.id}/groups`, json(cookie, { name: 'G' }), env)).json()) as { id: string }
  const t = (await (await app.request(`/api/groups/${g.id}/tasks`, json(cookie, { title: 'งานเวลา' }), env)).json()) as { id: string; status: string }
  return t
}

beforeEach(async () => {
  await seedUsers()
  await seedRateAndConfig()
  // pool-workers (vitest 4) ไม่มี isolated storage ต่อเทสต์แล้ว — ผลรวมรายวันต้อง deterministic
  await env.DB.prepare('DELETE FROM time_entries').run()
  await env.DB.prepare('DELETE FROM timer_sessions').run()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('T12 — timer + manual + เพดาน + snapshot', () => {
  it('start → stop: ได้ entry source=timer + rateSnapshot ถูกต้อง + task เปลี่ยนเป็น doing', async () => {
    const m = await loginAs(app, 'pond@example-co.test')
    const t = await makeTask(m)

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-10T03:00:00Z')) // 10:00 BKK
    expect((await app.request(`/api/tasks/${t.id}/timer/start`, json(m, {}), env)).status).toBe(200)

    const timerState = (await (await app.request('/api/timer', { headers: { cookie: m } }, env)).json()) as { active: { taskId: string } }
    expect(timerState.active.taskId).toBe(t.id)

    vi.setSystemTime(new Date('2026-06-10T05:30:00Z')) // +2.5 ชม.
    const stop = (await (await app.request('/api/timer/stop', json(m, {}), env)).json()) as { capped: boolean; createdMinutes: number }
    expect(stop).toMatchObject({ capped: false, createdMinutes: 150 })

    const rows = (await (await app.request(`/api/tasks/${t.id}/time`, { headers: { cookie: m } }, env)).json()) as { minutes: number; source: string; workDate: string }[]
    expect(rows[0]).toMatchObject({ minutes: 150, source: 'timer', workDate: '2026-06-10' })

    // task → doing
    const detail = (await (await app.request(`/api/tasks/${t.id}/detail`, { headers: { cookie: m } }, env)).json()) as { status: string }
    expect(detail.status).toBe('doing')

    // rateSnapshot = 40000 (ปอนด์) — เช็คจากตาราง
    const entry = await env.DB.prepare('SELECT rate_snapshot_satang FROM time_entries LIMIT 1').first<{ rate_snapshot_satang: number }>()
    expect(entry?.rate_snapshot_satang).toBe(40000)
  })

  it('start ตัวที่สอง = ปิดตัวแรกอัตโนมัติ (วิ่งทีละตัว)', async () => {
    const m = await loginAs(app, 'pond@example-co.test')
    const t1 = await makeTask(m)
    const t2 = await makeTask(m)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-10T03:00:00Z'))
    await app.request(`/api/tasks/${t1.id}/timer/start`, json(m, {}), env)
    vi.setSystemTime(new Date('2026-06-10T04:00:00Z'))
    await app.request(`/api/tasks/${t2.id}/timer/start`, json(m, {}), env)

    const rows1 = (await (await app.request(`/api/tasks/${t1.id}/time`, { headers: { cookie: m } }, env)).json()) as { minutes: number }[]
    expect(rows1[0]?.minutes).toBe(60) // ตัวแรกถูกปิด 1 ชม.
    const state = (await (await app.request('/api/timer', { headers: { cookie: m } }, env)).json()) as { active: { taskId: string } }
    expect(state.active.taskId).toBe(t2.id)
  })

  it('ชนเพดาน: ครบโควตาวัน → start ถูกบล็อก 403 · stop ที่วิ่งเกิน → ตัดที่เพดาน + capped', async () => {
    await seedRateAndConfig(120) // เพดาน 2 ชม. ให้เทสต์เร็ว
    const m = await loginAs(app, 'pond@example-co.test')
    const t = await makeTask(m)

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-10T03:00:00Z'))
    await app.request(`/api/tasks/${t.id}/timer/start`, json(m, {}), env)
    vi.setSystemTime(new Date('2026-06-10T07:00:00Z')) // วิ่ง 4 ชม. > เพดาน 2
    const stop = (await (await app.request('/api/timer/stop', json(m, {}), env)).json()) as { capped: boolean; createdMinutes: number }
    expect(stop).toMatchObject({ capped: true, createdMinutes: 120 })

    // โควตาหมดแล้ว → เริ่มใหม่ไม่ได้
    const blocked = await app.request(`/api/tasks/${t.id}/timer/start`, json(m, {}), env)
    expect(blocked.status).toBe(403)
    expect(((await blocked.json()) as { error: string }).error).toBe('cap_reached')

    // แต่ manual ย้อนหลังยังลงได้ (escape hatch) + ตอบ overCap
    const manual = await app.request(`/api/tasks/${t.id}/time`, json(m, { workDate: '2026-06-10', minutes: 60 }), env)
    expect(manual.status).toBe(201)
    expect(((await manual.json()) as { overCap: boolean }).overCap).toBe(true)
  })

  it('timer ข้ามคืน: 18:00 → 02:00 BKK แบ่งเป็น 2 entries คนละ workDate', async () => {
    const m = await loginAs(app, 'pond@example-co.test')
    const t = await makeTask(m)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-10T11:00:00Z')) // 18:00 BKK
    await app.request(`/api/tasks/${t.id}/timer/start`, json(m, {}), env)
    vi.setSystemTime(new Date('2026-06-10T19:00:00Z')) // 02:00 BKK วันถัดไป
    await app.request('/api/timer/stop', json(m, {}), env)

    const rows = (await (await app.request(`/api/tasks/${t.id}/time`, { headers: { cookie: m } }, env)).json()) as { workDate: string; minutes: number }[]
    const sorted = rows.slice().sort((a, b) => (a.workDate < b.workDate ? -1 : 1))
    expect(sorted).toHaveLength(2)
    expect(sorted[0]).toMatchObject({ workDate: '2026-06-10', minutes: 360 })
    expect(sorted[1]).toMatchObject({ workDate: '2026-06-11', minutes: 120 })
  })

  it('แก้เวลา: editCount++ + audit before→after · ลบ = soft (หายจากลิสต์แต่ row ยังอยู่)', async () => {
    const m = await loginAs(app, 'pond@example-co.test')
    const t = await makeTask(m)
    const created = (await (
      await app.request(`/api/tasks/${t.id}/time`, json(m, { workDate: '2026-06-09', minutes: 120, note: 'ทำ layout' }), env)
    ).json()) as { id: string }

    const patched = (await (
      await app.request(`/api/time/${created.id}`, { ...json(m, { minutes: 90 }), method: 'PATCH' }, env)
    ).json()) as { editCount: number; minutes: number }
    expect(patched).toMatchObject({ editCount: 1, minutes: 90 })

    const audits = await createDb(env.DB).select().from(auditLogs)
    const upd = audits.find((a) => a.action === 'time_entry.update')
    expect(upd?.meta).toMatchObject({ before: { minutes: 120 }, after: { minutes: 90 } })

    await app.request(`/api/time/${created.id}`, { method: 'DELETE', headers: { cookie: m } }, env)
    const rows = (await (await app.request(`/api/tasks/${t.id}/time`, { headers: { cookie: m } }, env)).json()) as unknown[]
    expect(rows).toHaveLength(0)
    const raw = await env.DB.prepare('SELECT deleted_at FROM time_entries WHERE id = ?').bind(created.id).first<{ deleted_at: number }>()
    expect(raw?.deleted_at).toBeTruthy() // soft-delete จริง
  })

  it('vendor ลงเวลาของตัวเองได้ + เห็นเฉพาะ entries ตัวเอง · แก้ของคนอื่นไม่ได้', async () => {
    const m = await loginAs(app, 'pond@example-co.test')
    const t = await makeTask(m)
    const mine = (await (
      await app.request(`/api/tasks/${t.id}/time`, json(m, { workDate: '2026-06-09', minutes: 60 }), env)
    ).json()) as { id: string }

    const v = await loginAs(app, 'somchai@example.com')
    expect((await app.request(`/api/tasks/${t.id}/time`, json(v, { workDate: '2026-06-09', minutes: 30 }), env)).status).toBe(201)

    const vRows = (await (await app.request(`/api/tasks/${t.id}/time`, { headers: { cookie: v } }, env)).json()) as { userName: string }[]
    expect(vRows).toHaveLength(1)
    expect(vRows[0]?.userName).toBe('สมชาย')

    const mRows = (await (await app.request(`/api/tasks/${t.id}/time`, { headers: { cookie: m } }, env)).json()) as unknown[]
    expect(mRows).toHaveLength(2) // ทีมเห็นหมด (cross-check)

    expect((await app.request(`/api/time/${mine.id}`, { ...json(v, { minutes: 1 }), method: 'PATCH' }, env)).status).toBe(403)
  })

  it('ไม่มี rate → start/manual = 409 no_rate', async () => {
    const m = await loginAs(app, 'owner@example-co.test') // owner ไม่ได้ seed rate ในเทสต์นี้
    const t = await makeTask(m)
    const res = await app.request(`/api/tasks/${t.id}/timer/start`, json(m, {}), env)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toBe('no_rate')
  })
})
