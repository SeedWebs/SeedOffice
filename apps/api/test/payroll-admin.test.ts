import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../src/index'
import { loginAs, seedUsers } from './helpers'

const json = (cookie: string, body: unknown) => ({
  method: 'POST',
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

beforeEach(async () => {
  await seedUsers()
  await env.DB.prepare(
    "INSERT OR REPLACE INTO rates (id, user_id, rate_satang_per_hour, effective_from, created_at) VALUES ('r_pond','u_pond',40000,'2026-01-01',0)",
  ).run()
  await env.DB.prepare(
    'INSERT OR REPLACE INTO company_config (id, cutoff_day, work_hour_cap_minutes) VALUES (1, 25, 480)',
  ).run()
  for (const t of ['time_entries', 'pay_adjustments', 'pay_notes', 'payslips', 'pay_cycle_closures'])
    await env.DB.prepare(`DELETE FROM ${t}`).run()
}, 30_000)

async function seedWork(cookie: string) {
  const p = (await (await app.request('/api/projects', json(cookie, { name: 'WP', type: 'project' }), env)).json()) as { id: string }
  const g = (await (await app.request(`/api/projects/${p.id}/groups`, json(cookie, { name: 'G' }), env)).json()) as { id: string }
  const t = (await (await app.request(`/api/groups/${g.id}/tasks`, json(cookie, { title: 'งาน' }), env)).json()) as { id: string }
  // 2 วัน × 8 ชม. ในงวด 25 พ.ค.–24 มิ.ย.
  await env.DB.prepare(
    `INSERT INTO time_entries (id, user_id, task_id, project_id, work_date, minutes, rate_snapshot_satang, source, edit_count, created_at) VALUES
     ('twa','u_pond','${t.id}','${p.id}','2026-06-01',480,40000,'timer',0,0),
     ('twb','u_pond','${t.id}','${p.id}','2026-06-02',480,40000,'timer',0,0)`,
  ).run()
  return { t }
}

describe('T16 — payroll owner + CSV + ปิดงวด', () => {
  it('ตารางทีม: ยอดตรง payrollOf · member เปิดไม่ได้ 403', async () => {
    const o = await loginAs(app, 'owner@seedwebs.com')
    const m = await loginAs(app, 'pond@seedwebs.com')
    await seedWork(m)
    await app.request(
      '/api/admin/payroll/adjustments',
      json(o, { userId: 'u_pond', cycleStart: '2026-05-25', kind: 'bonus', amountSatang: 300_000, note: 'ปิดงานไว' }),
      env,
    )
    const res = (await (
      await app.request('/api/admin/payroll?date=2026-06-10', { headers: { cookie: o } }, env)
    ).json()) as { rows: { userId: string; baseSatang: number; netSatang: number }[]; closed: boolean }
    const pond = res.rows.find((r) => r.userId === 'u_pond')
    expect(pond).toMatchObject({ baseSatang: 640_000, netSatang: 940_000 }) // 16 ชม.×฿400 + โบนัส ฿3,000
    expect(res.closed).toBe(false)

    expect((await app.request('/api/admin/payroll', { headers: { cookie: m } }, env)).status).toBe(403)
  })

  it('โน้ต upsert → โผล่ใน self view ของเจ้าตัว', async () => {
    const o = await loginAs(app, 'owner@seedwebs.com')
    const m = await loginAs(app, 'pond@seedwebs.com')
    await app.request(
      '/api/admin/payroll/notes',
      { ...json(o, { userId: 'u_pond', cycleStart: '2026-05-25', body: 'เดือนนี้เยี่ยมมาก' }), method: 'PUT' },
      env,
    )
    const self = (await (
      await app.request('/api/payroll/me?date=2026-06-10', { headers: { cookie: m } }, env)
    ).json()) as { ownerNote: string }
    expect(self.ownerNote).toBe('เดือนนี้เยี่ยมมาก')
  })

  it('CSV: text/csv + แถวข้อมูล + ยอดบาททศนิยม', async () => {
    const o = await loginAs(app, 'owner@seedwebs.com')
    const m = await loginAs(app, 'pond@seedwebs.com')
    await seedWork(m)
    const res = await app.request('/api/admin/payroll/export?date=2026-06-10', { headers: { cookie: o } }, env)
    expect(res.headers.get('content-type')).toContain('text/csv')
    const text = await res.text()
    expect(text).toContain('สุทธิ')
    expect(text).toContain('"ปอนด์"')
    expect(text).toContain('"6400.00"') // base 16 ชม. × ฿400
  })

  it('ปิดงวด: สร้าง payslip snapshot + ปิดซ้ำ 409 + ล็อกแก้เวลา/รายการย้อนหลัง', async () => {
    const o = await loginAs(app, 'owner@seedwebs.com')
    const m = await loginAs(app, 'pond@seedwebs.com')
    const { t } = await seedWork(m)

    const close = await app.request('/api/admin/payroll/close', json(o, { date: '2026-06-10' }), env)
    expect(close.status).toBe(200)
    expect(((await close.json()) as { payslips: number }).payslips).toBe(1)

    // snapshot ถูกต้อง
    const slip = await env.DB.prepare("SELECT base_satang, net_satang, cycle_start FROM payslips WHERE user_id='u_pond'").first<{ base_satang: number; net_satang: number; cycle_start: string }>()
    expect(slip).toMatchObject({ base_satang: 640_000, net_satang: 640_000, cycle_start: '2026-05-25' })

    // ปิดซ้ำ
    expect((await app.request('/api/admin/payroll/close', json(o, { date: '2026-06-10' }), env)).status).toBe(409)

    // ลงเวลา/แก้/ลบ ในงวดปิด = 409
    expect((await app.request(`/api/tasks/${t.id}/time`, json(m, { workDate: '2026-06-03', minutes: 60 }), env)).status).toBe(409)
    expect((await app.request('/api/time/twa', { ...json(m, { minutes: 1 }), method: 'PATCH' }, env)).status).toBe(409)
    expect((await app.request('/api/time/twa', { method: 'DELETE', headers: { cookie: m } }, env)).status).toBe(409)

    // adjustment งวดปิด = 409
    expect(
      (
        await app.request(
          '/api/admin/payroll/adjustments',
          json(o, { userId: 'u_pond', cycleStart: '2026-05-25', kind: 'bonus', amountSatang: 1 }),
          env,
        )
      ).status,
    ).toBe(409)

    // งวดถัดไป (หลัง 25 มิ.ย.) ยังลงได้ปกติ
    expect((await app.request(`/api/tasks/${t.id}/time`, json(m, { workDate: '2026-06-25', minutes: 60 }), env)).status).toBe(201)
  })
})
