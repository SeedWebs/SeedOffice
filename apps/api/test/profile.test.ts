import { createDb, users } from '@seedoffice/db'
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { loginAs, seedUsers } from './helpers'

beforeEach(async () => {
  await seedUsers()
  // storage แชร์ข้ามเทสต์ในไฟล์ + seedUsers = onConflictDoNothing → รีเซ็ตฟิลด์โปรไฟล์ที่แก้เองได้ทุกเทสต์
  await createDb(env.DB).update(users).set({ firstName: null, lastName: null, nickname: null })
})

const appMod = async () => (await import('../src/index')).app
type Me = {
  id: string
  name: string
  email: string
  role: string
  firstName: string | null
  lastName: string | null
  nickname: string | null
}
const patchMe = (app: Awaited<ReturnType<typeof appMod>>, cookie: string, body: unknown) =>
  app.request(
    '/api/me',
    { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) },
    env,
  )

describe('Profile — /api/me (SPEC §4.1)', () => {
  it('แก้ชื่อเล่น → name = ชื่อเล่น · GET /me สะท้อน', async () => {
    const app = await appMod()
    const cookie = await loginAs(app, 'pond@example-co.test')
    const res = await patchMe(app, cookie, { nickname: 'ปอนด์ดี้' })
    expect(res.status).toBe(200)
    expect((await res.json()) as Me).toMatchObject({ nickname: 'ปอนด์ดี้', name: 'ปอนด์ดี้' })
    const got = (await (await app.request('/api/me', { headers: { cookie } }, env)).json()) as Me
    expect(got).toMatchObject({ nickname: 'ปอนด์ดี้', name: 'ปอนด์ดี้' })
  })

  it('ชื่อจริง+นามสกุล (ไม่มีชื่อเล่น) → name = "ชื่อ นามสกุล"', async () => {
    const app = await appMod()
    const cookie = await loginAs(app, 'pond@example-co.test')
    const me = (await (await patchMe(app, cookie, { firstName: 'ปองพล', lastName: 'ใจดี' })).json()) as Me
    expect(me).toMatchObject({ firstName: 'ปองพล', lastName: 'ใจดี', name: 'ปองพล ใจดี' })
  })

  it('ชื่อเล่นชนะ "ชื่อ นามสกุล" ในการเป็น display name', async () => {
    const app = await appMod()
    const cookie = await loginAs(app, 'pond@example-co.test')
    const me = (await (
      await patchMe(app, cookie, { firstName: 'ปองพล', lastName: 'ใจดี', nickname: 'ปอนด์' })
    ).json()) as Me
    expect(me.name).toBe('ปอนด์')
  })

  it('ล้างชื่อเล่น ("") → กลับไปใช้ "ชื่อ นามสกุล"', async () => {
    const app = await appMod()
    const cookie = await loginAs(app, 'pond@example-co.test')
    await patchMe(app, cookie, { firstName: 'ปองพล', lastName: 'ใจดี', nickname: 'ปอนด์' })
    const me = (await (await patchMe(app, cookie, { nickname: '' })).json()) as Me
    expect(me.nickname).toBeNull()
    expect(me.name).toBe('ปองพล ใจดี')
  })

  it('ทุก role แก้โปรไฟล์ตัวเองได้ (รวม vendor) · email/role ไม่เปลี่ยน', async () => {
    const app = await appMod()
    const cookie = await loginAs(app, 'somchai@example.com')
    const me = (await (await patchMe(app, cookie, { nickname: 'ช่าง' })).json()) as Me
    expect(me).toMatchObject({ nickname: 'ช่าง', email: 'somchai@example.com', role: 'vendor' })
  })

  it('ไม่ login → 401 · body ว่าง → 400', async () => {
    const app = await appMod()
    expect(
      (await app.request('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' }, env)).status,
    ).toBe(401)
    const cookie = await loginAs(app, 'pond@example-co.test')
    expect((await patchMe(app, cookie, {})).status).toBe(400)
  })
})
