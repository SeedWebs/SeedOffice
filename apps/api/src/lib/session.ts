import { createDb, sessions, users, type User } from '@seedoffice/db'
import { and, eq, gt, lt } from 'drizzle-orm'

export const SESSION_COOKIE = 'so_session'
const SESSION_TTL_MS = 30 * 24 * 3_600_000 // 30 วัน

/** token สุ่ม 256-bit hex — ฝั่ง DB เก็บเป็น SHA-256 hash (token หลุดจาก DB ใช้ไม่ได้) */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function createSession(
  env: Env,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await createDb(env.DB)
    .insert(sessions)
    .values({ id: await hashToken(token), userId, expiresAt })
  return { token, expiresAt }
}

/** session ที่ยังไม่หมดอายุ + user ต้อง active เท่านั้น (เพิกถอน = ลบแถว/ปิด user ก็หลุดทันที) */
export async function userFromToken(env: Env, token: string): Promise<User | null> {
  const db = createDb(env.DB)
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.id, await hashToken(token)),
        gt(sessions.expiresAt, new Date()),
        eq(users.status, 'active'),
      ),
    )
    .limit(1)
  return rows[0]?.user ?? null
}

export async function revokeSession(env: Env, token: string): Promise<void> {
  await createDb(env.DB)
    .delete(sessions)
    .where(eq(sessions.id, await hashToken(token)))
}

/** กวาด session หมดอายุทิ้ง (เรียกจาก cron) */
export async function purgeExpiredSessions(env: Env): Promise<void> {
  await createDb(env.DB).delete(sessions).where(lt(sessions.expiresAt, new Date()))
}
