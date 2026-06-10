import { env } from 'cloudflare:test'
import { createDb, users } from '@seedoffice/db'

/** user มาตรฐาน 3 role สำหรับเทสต์ (id คงที่) */
export async function seedUsers() {
  const db = createDb(env.DB)
  await db
    .insert(users)
    .values([
      { id: 'u_owner', email: 'owner@seedwebs.com', name: 'เมธ', role: 'owner' },
      { id: 'u_pond', email: 'pond@seedwebs.com', name: 'ปอนด์', role: 'member' },
      { id: 'u_somchai', email: 'somchai@example.com', name: 'สมชาย', role: 'vendor' },
      {
        id: 'u_gone',
        email: 'gone@seedwebs.com',
        name: 'ลาออกแล้ว',
        role: 'member',
        status: 'disabled',
      },
    ])
    .onConflictDoNothing()
}

/** login ผ่าน dev-login แล้วคืน Cookie header สำหรับ request ถัดไป */
export async function loginAs(
  app: (typeof import('../src/index'))['default'],
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
