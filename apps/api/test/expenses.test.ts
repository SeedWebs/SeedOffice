import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../src/index'
import { loginAs, seedUsers } from './helpers'

beforeEach(async () => {
  await seedUsers()
  await env.DB.prepare('DELETE FROM expenses').run()
})

function expenseForm(fields: Record<string, string>, receipt?: File) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  if (receipt) fd.append('receipt', receipt)
  return fd
}

const BASE = {
  expenseDate: '2026-06-05',
  amountSatang: '270000',
  category: 'equipment',
  description: 'Stock photo',
  paidBy: 'self',
}

describe('P2 — เงินสดย่อย', () => {
  it('member ลงค่าใช้จ่าย + ใบเสร็จ → owner อนุมัติ → คืนเงิน · ยอดค้างคืนถูกต้องตามขั้น', async () => {
    const m = await loginAs(app, 'pond@seedwebs.com')
    const created = await app.request(
      '/api/expenses',
      { method: 'POST', headers: { cookie: m }, body: expenseForm(BASE, new File([new Uint8Array([255, 216, 255])], 'bill.jpg', { type: 'image/jpeg' })) },
      env,
    )
    expect(created.status).toBe(201)
    const exp = (await created.json()) as { id: string; status: string; receiptKey: string }
    expect(exp.status).toBe('pending')
    expect(exp.receiptKey).toBeTruthy()

    // pending → ค้างคืนยังเป็น 0 (นับเฉพาะ approved)
    let list = (await (await app.request('/api/expenses?month=2026-06', { headers: { cookie: m } }, env)).json()) as { rows: unknown[]; owedSatang: number }
    expect(list.rows).toHaveLength(1)
    expect(list.owedSatang).toBe(0)

    const o = await loginAs(app, 'owner@seedwebs.com')
    // คืนเงินก่อนอนุมัติ = 409
    expect(
      (await app.request(`/api/expenses/${exp.id}/status`, { method: 'PATCH', headers: { cookie: o, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'reimbursed' }) }, env)).status,
    ).toBe(409)
    // อนุมัติ → ค้างคืน ฿2,700
    await app.request(`/api/expenses/${exp.id}/status`, { method: 'PATCH', headers: { cookie: o, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) }, env)
    list = (await (await app.request('/api/expenses?month=2026-06', { headers: { cookie: o } }, env)).json()) as typeof list
    expect(list.owedSatang).toBe(270000)
    // คืนแล้ว → ค้างคืน 0
    await app.request(`/api/expenses/${exp.id}/status`, { method: 'PATCH', headers: { cookie: o, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'reimbursed' }) }, env)
    list = (await (await app.request('/api/expenses?month=2026-06', { headers: { cookie: o } }, env)).json()) as typeof list
    expect(list.owedSatang).toBe(0)
  })

  it('member เห็นเฉพาะของตัวเอง · เปลี่ยนสถานะได้เฉพาะ owner · vendor 403 ทุกเส้น', async () => {
    const m = await loginAs(app, 'pond@seedwebs.com')
    const m2 = await loginAs(app, 'nam@seedwebs.com')
    await app.request('/api/expenses', { method: 'POST', headers: { cookie: m }, body: expenseForm(BASE) }, env)
    await app.request('/api/expenses', { method: 'POST', headers: { cookie: m2 }, body: expenseForm({ ...BASE, description: 'ของน้ำ' }) }, env)

    const mine = (await (await app.request('/api/expenses?month=2026-06', { headers: { cookie: m } }, env)).json()) as { rows: { description: string }[] }
    expect(mine.rows).toHaveLength(1)
    expect(mine.rows[0]?.description).toBe('Stock photo')

    const o = await loginAs(app, 'owner@seedwebs.com')
    const all = (await (await app.request('/api/expenses?month=2026-06', { headers: { cookie: o } }, env)).json()) as { rows: unknown[] }
    expect(all.rows).toHaveLength(2)

    const target = (mine.rows[0] as { id?: string }).id ?? ''
    expect(
      (await app.request(`/api/expenses/${target}/status`, { method: 'PATCH', headers: { cookie: m, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) }, env)).status,
    ).toBe(403)

    const v = await loginAs(app, 'somchai@example.com')
    expect((await app.request('/api/expenses?month=2026-06', { headers: { cookie: v } }, env)).status).toBe(403)
    expect((await app.request('/api/expenses', { method: 'POST', headers: { cookie: v }, body: expenseForm(BASE) }, env)).status).toBe(403)
  })

  it('payroll/me โชว์รอเบิก (pending+approved ที่จ่ายเอง) · CSV export มีแถว', async () => {
    const m = await loginAs(app, 'pond@seedwebs.com')
    await env.DB.prepare("INSERT OR REPLACE INTO rates (id, user_id, rate_satang_per_hour, effective_from, created_at) VALUES ('r_pond','u_pond',40000,'2026-01-01',0)").run()
    await env.DB.prepare('INSERT OR REPLACE INTO company_config (id, cutoff_day, work_hour_cap_minutes) VALUES (1, 25, 480)').run()
    await app.request('/api/expenses', { method: 'POST', headers: { cookie: m }, body: expenseForm(BASE) }, env)
    await app.request('/api/expenses', { method: 'POST', headers: { cookie: m }, body: expenseForm({ ...BASE, amountSatang: '129000', description: 'ค่า domain', paidBy: 'company' }) }, env)

    const me = (await (await app.request('/api/payroll/me', { headers: { cookie: m } }, env)).json()) as { pendingReimburseSatang: number; pendingReimburseItems: unknown[] }
    expect(me.pendingReimburseSatang).toBe(270000) // เฉพาะที่จ่ายเอง
    expect(me.pendingReimburseItems).toHaveLength(1)

    const o = await loginAs(app, 'owner@seedwebs.com')
    const csv = await app.request('/api/expenses/export?month=2026-06', { headers: { cookie: o } }, env)
    expect(csv.headers.get('content-type')).toContain('text/csv')
    const text = await csv.text()
    expect(text).toContain('Stock photo')
    expect(text).toContain('2700.00')
  })
})
