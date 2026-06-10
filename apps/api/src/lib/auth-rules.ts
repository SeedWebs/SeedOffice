import { companyConfig, createDb, users, type User } from '@seedoffice/db'
import { eq } from 'drizzle-orm'

export interface GoogleProfile {
  sub: string
  email: string
  name?: string
  picture?: string
}

/**
 * กฎรับเข้า (SPEC §4.1):
 * - email มีในระบบ + active → ผ่าน (อัปเดต googleSub/ชื่อ/รูปครั้งแรก)
 * - email ตรงโดเมน `memberDomain` ใน company config แต่ยังไม่มีในระบบ → auto-provision เป็น member
 *   (memberDomain ว่าง = ปิด auto-provision — ทุกคนต้องถูก owner เพิ่มก่อน)
 * - อื่นๆ (vendor ต้องถูก owner เพิ่มก่อน / user ถูกปิด) → null = ปฏิเสธ
 */
export async function resolveLoginUser(env: Env, profile: GoogleProfile): Promise<User | null> {
  const db = createDb(env.DB)
  const email = profile.email.toLowerCase()
  const existing = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0]

  if (existing) {
    if (existing.status !== 'active') return null
    const patch: Partial<typeof users.$inferInsert> = {}
    if (!existing.googleSub && profile.sub) patch.googleSub = profile.sub
    if (profile.picture && profile.picture !== existing.avatarUrl) patch.avatarUrl = profile.picture
    if (Object.keys(patch).length > 0) {
      await db.update(users).set(patch).where(eq(users.id, existing.id))
      return { ...existing, ...patch } as User
    }
    return existing
  }

  const cfg = (await db.select().from(companyConfig).limit(1))[0]
  const memberDomain = cfg?.memberDomain ?? ''
  if (memberDomain && email.endsWith(memberDomain)) {
    const inserted = await db
      .insert(users)
      .values({
        email,
        name: profile.name ?? email.split('@')[0] ?? email,
        googleSub: profile.sub,
        role: 'member',
        avatarUrl: profile.picture ?? null,
      })
      .returning()
    return inserted[0] ?? null
  }

  return null
}
