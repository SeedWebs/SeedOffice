import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../src/index'
import { loginAs, seedUsers } from './helpers'

beforeEach(async () => {
  await seedUsers()
})

describe('T07 — admin users/rates/config', () => {
  it('member/vendor เปิด /api/admin/users ไม่ได้ (403) · owner ได้', async () => {
    const member = await loginAs(app, 'pond@example-co.test')
    const vendor = await loginAs(app, 'somchai@example.com')
    const owner = await loginAs(app, 'owner@example-co.test')
    expect((await app.request('/api/admin/users', { headers: { cookie: member } }, env)).status).toBe(403)
    expect((await app.request('/api/admin/users', { headers: { cookie: vendor } }, env)).status).toBe(403)
    const res = await app.request('/api/admin/users', { headers: { cookie: owner } }, env)
    expect(res.status).toBe(200)
    const list = (await res.json()) as { email: string }[]
    expect(list.length).toBeGreaterThanOrEqual(4)
  })

  it('owner provision vendor ใหม่ + ตั้ง rate 2 ครั้ง → ประวัติ 2 แถว ไม่ทับของเก่า', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const created = await app.request(
      '/api/admin/users',
      {
        method: 'POST',
        headers: { cookie: owner, 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'newvendor@example.com',
          name: 'เวนเดอร์ใหม่',
          role: 'vendor',
          rateSatangPerHour: 30000,
          rateEffectiveFrom: '2026-06-01',
        }),
      },
      env,
    )
    expect(created.status).toBe(201)
    const u = (await created.json()) as { id: string }

    const second = await app.request(
      `/api/admin/users/${u.id}/rates`,
      {
        method: 'POST',
        headers: { cookie: owner, 'content-type': 'application/json' },
        body: JSON.stringify({ rateSatangPerHour: 35000, effectiveFrom: '2026-07-01', note: 'ปรับขึ้น' }),
      },
      env,
    )
    expect(second.status).toBe(201)

    const hist = await app.request(`/api/users/${u.id}/rates`, { headers: { cookie: owner } }, env)
    const data = (await hist.json()) as { history: unknown[]; currentRateSatangPerHour: number }
    expect(data.history).toHaveLength(2)
    expect(data.currentRateSatangPerHour).toBe(30000) // วันนี้ (10 มิ.ย.) ยังใช้ rate แรก
  })

  it('vendor ดู rate ตัวเองได้ แต่ดูของคนอื่น = 403 · member ดูของคนอื่นได้', async () => {
    const vendor = await loginAs(app, 'somchai@example.com')
    const member = await loginAs(app, 'pond@example-co.test')
    expect(
      (await app.request('/api/users/u_somchai/rates', { headers: { cookie: vendor } }, env)).status,
    ).toBe(200)
    expect(
      (await app.request('/api/users/u_pond/rates', { headers: { cookie: vendor } }, env)).status,
    ).toBe(403)
    expect(
      (await app.request('/api/users/u_somchai/rates', { headers: { cookie: member } }, env)).status,
    ).toBe(200)
  })

  it('email ซ้ำ → 409 · แก้ config ได้เฉพาะ owner + persist', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const dup = await app.request(
      '/api/admin/users',
      {
        method: 'POST',
        headers: { cookie: owner, 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'pond@example-co.test', name: 'ซ้ำ', role: 'member' }),
      },
      env,
    )
    expect(dup.status).toBe(409)

    const patch = await app.request(
      '/api/admin/config',
      {
        method: 'PATCH',
        headers: { cookie: owner, 'content-type': 'application/json' },
        body: JSON.stringify({ workHourCapMinutes: 420 }),
      },
      env,
    )
    expect(patch.status).toBe(200)
    const cfg = await app.request('/api/config', { headers: { cookie: owner } }, env)
    expect(await cfg.json()).toMatchObject({ cutoffDay: 25, workHourCapMinutes: 420 })

    const member = await loginAs(app, 'pond@example-co.test')
    expect(
      (
        await app.request(
          '/api/admin/config',
          {
            method: 'PATCH',
            headers: { cookie: member, 'content-type': 'application/json' },
            body: JSON.stringify({ cutoffDay: 1 }),
          },
          env,
        )
      ).status,
    ).toBe(403)
  })

  it('memberDomain: รูปแบบผิด → 400 · ตั้งค่าได้ (trim+lowercase) + persist', async () => {
    const owner = await loginAs(app, 'owner@example-co.test')
    const patchCfg = (memberDomain: string) =>
      app.request(
        '/api/admin/config',
        {
          method: 'PATCH',
          headers: { cookie: owner, 'content-type': 'application/json' },
          body: JSON.stringify({ memberDomain }),
        },
        env,
      )
    expect((await patchCfg('no-at-sign.com')).status).toBe(400) // ไม่มี @
    expect((await patchCfg('@nodot')).status).toBe(400) // ไม่มีจุด

    expect((await patchCfg(' @New-Co.TEST ')).status).toBe(200)
    const cfg = await app.request('/api/config', { headers: { cookie: owner } }, env)
    expect(await cfg.json()).toMatchObject({ memberDomain: '@new-co.test' })

    expect((await patchCfg('')).status).toBe(200) // ว่าง = ปิด auto-provision
    const cfg2 = await app.request('/api/config', { headers: { cookie: owner } }, env)
    expect(await cfg2.json()).toMatchObject({ memberDomain: '' })
  })
})
