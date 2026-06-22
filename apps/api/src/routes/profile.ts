import { createDb, users, type User } from '@seedoffice/db'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../types'

/**
 * โปรไฟล์ตัวเอง (ทุก role) — ดู/แก้ ชื่อจริง/นามสกุล/ชื่อเล่น ของตัวเอง
 * email + role แก้ที่นี่ไม่ได้ (owner provision) · name = display ทั้งแอป → derive จาก nickname || "first last"
 * (หน้า Profile ยังเป็นบ้านของ Access Tokens §4.18 ฝั่ง UI ด้วย)
 */
const nameField = z.string().trim().max(80).nullable()
const profilePatch = z.object({
  firstName: nameField.optional(),
  lastName: nameField.optional(),
  nickname: nameField.optional(),
})

/** display name: ชื่อเล่นมาก่อน → "ชื่อ นามสกุล" → fallback (กันว่าง) */
function displayName(p: {
  firstName: string | null
  lastName: string | null
  nickname: string | null
  fallback: string
}): string {
  const nick = p.nickname?.trim()
  if (nick) return nick
  const full = `${p.firstName?.trim() ?? ''} ${p.lastName?.trim() ?? ''}`.trim()
  return full || p.fallback
}

const meShape = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  avatarUrl: u.avatarUrl,
  firstName: u.firstName,
  lastName: u.lastName,
  nickname: u.nickname,
})

export const profileRoutes = new Hono<AppEnv>()
  .get('/me', (c) => c.json(meShape(c.get('user'))))

  .patch('/me', async (c) => {
    const body = profilePatch.safeParse(await c.req.json().catch(() => null))
    if (!body.success || Object.keys(body.data).length === 0) return c.json({ error: 'invalid_body' }, 400)
    const me = c.get('user')
    // เฉพาะ field ที่ส่งมาเท่านั้นที่เปลี่ยน (partial) · '' → null
    const norm = (v: string | null | undefined) => (v === undefined ? undefined : v === '' ? null : v)
    const merged = {
      firstName: 'firstName' in body.data ? (norm(body.data.firstName) ?? null) : me.firstName,
      lastName: 'lastName' in body.data ? (norm(body.data.lastName) ?? null) : me.lastName,
      nickname: 'nickname' in body.data ? (norm(body.data.nickname) ?? null) : me.nickname,
    }
    const name = displayName({ ...merged, fallback: me.email.split('@')[0] ?? me.email })
    const [updated] = await createDb(c.env.DB)
      .update(users)
      .set({ ...merged, name })
      .where(eq(users.id, me.id))
      .returning()
    if (!updated) return c.json({ error: 'not_found' }, 404)
    return c.json(meShape(updated))
  })
