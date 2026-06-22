import { createDb, apiTokens, users, type User } from '@seedoffice/db'
import { and, desc, eq, isNull } from 'drizzle-orm'

export const API_TOKEN_PREFIX = 'sko_'

/**
 * token = `sko_<256-bit hex>` · DB เก็บเฉพาะ SHA-256 hash (token หลุดจาก DB ใช้ไม่ได้)
 * โชว์ token เต็มครั้งเดียวตอนสร้าง — แพตเทิร์นเดียวกับ session (lib/session.ts)
 */
export function newApiToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return API_TOKEN_PREFIX + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** สร้าง PAT ใหม่ → คืน token เต็ม (โชว์ครั้งเดียว) + id (= hash) */
export async function createApiToken(
  env: Env,
  userId: string,
  name: string,
  scopes: string[],
): Promise<{ token: string; id: string }> {
  const token = newApiToken()
  const id = await hashToken(token)
  await createDb(env.DB).insert(apiTokens).values({ id, userId, name, scopes })
  return { token, id }
}

/** resolve token → user + scopes (ต้องไม่ถูกเพิกถอน + user active) · touch lastUsedAt */
export async function userFromApiToken(
  env: Env,
  token: string,
): Promise<{ user: User; scopes: string[] } | null> {
  if (!token.startsWith(API_TOKEN_PREFIX)) return null
  const db = createDb(env.DB)
  const id = await hashToken(token)
  const rows = await db
    .select({ user: users, scopes: apiTokens.scopes })
    .from(apiTokens)
    .innerJoin(users, eq(apiTokens.userId, users.id))
    .where(and(eq(apiTokens.id, id), isNull(apiTokens.revokedAt), eq(users.status, 'active')))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, id))
  return { user: row.user, scopes: row.scopes ?? [] }
}

/** token ของ user (ไม่รวมที่เพิกถอน) — ไม่คืน secret/hash ที่เดาค่าจริงได้ */
export async function listApiTokens(env: Env, userId: string) {
  return createDb(env.DB)
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      scopes: apiTokens.scopes,
      lastUsedAt: apiTokens.lastUsedAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt))
}

/** หา owner ของ token (ไว้เช็คสิทธิ์ก่อนเพิกถอน) — null = ไม่มี/เพิกถอนแล้ว */
export async function apiTokenOwner(env: Env, id: string): Promise<string | null> {
  const rows = await createDb(env.DB)
    .select({ userId: apiTokens.userId })
    .from(apiTokens)
    .where(and(eq(apiTokens.id, id), isNull(apiTokens.revokedAt)))
    .limit(1)
  return rows[0]?.userId ?? null
}

/** เพิกถอน (soft) */
export async function revokeApiToken(env: Env, id: string): Promise<void> {
  await createDb(env.DB)
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), isNull(apiTokens.revokedAt)))
}
