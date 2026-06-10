import { env } from 'cloudflare:test'
import { companyConfig, createDb, users } from '@seedoffice/db'

/** โดเมน auto-provision member ของชุดเทสต์ — ตรงกับ memberDomain ที่ seed ลง config ด้านล่าง */
export const TEST_MEMBER_DOMAIN = '@example-co.test'

/** user มาตรฐาน 3 role สำหรับเทสต์ (id คงที่) + config บริษัท (รีเซ็ตทุกครั้ง — storage แชร์ข้ามไฟล์) */
export async function seedUsers() {
  const db = createDb(env.DB)
  const cfg = { cutoffDay: 25, workHourCapMinutes: 480, memberDomain: TEST_MEMBER_DOMAIN }
  await db
    .insert(companyConfig)
    .values({ id: 1, ...cfg })
    .onConflictDoUpdate({ target: companyConfig.id, set: cfg })
  await db
    .insert(users)
    .values([
      { id: 'u_owner', email: 'owner@example-co.test', name: 'เมธ', role: 'owner' },
      { id: 'u_pond', email: 'pond@example-co.test', name: 'ปอนด์', role: 'member' },
      { id: 'u_somchai', email: 'somchai@example.com', name: 'สมชาย', role: 'vendor' },
      {
        id: 'u_gone',
        email: 'gone@example-co.test',
        name: 'ลาออกแล้ว',
        role: 'member',
        status: 'disabled',
      },
    ])
    .onConflictDoNothing()
}

/** login ผ่าน dev-login แล้วคืน Cookie header สำหรับ request ถัดไป */
export async function loginAs(
  app: (typeof import('../src/index'))['app'],
  email: string,
): Promise<string> {
  const res = await app.request(
    '/api/auth/dev-login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    },
    env,
  )
  if (res.status !== 200) throw new Error(`dev-login ${email} ได้ ${res.status}`)
  const setCookie = res.headers.get('set-cookie') ?? ''
  const m = /so_session=([^;]+)/.exec(setCookie)
  if (!m) throw new Error('ไม่มี session cookie')
  return `so_session=${m[1]}`
}
