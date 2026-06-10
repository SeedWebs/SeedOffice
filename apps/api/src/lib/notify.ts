import { createDb, users } from '@seedoffice/db'
import { eq } from 'drizzle-orm'

/**
 * แจ้งเตือนชนเพดานชั่วโมง/วัน (SPEC §4.5: เตือนเว็บ + อีเมล — เจตนา: อยากให้ทีมพัก)
 * เว็บ = banner จาก response/GET /api/timer (ทำแล้ว)
 * อีเมล = รอเลือก provider (Cloudflare Email Sending ต้อง verify domain / หรือ Resend)
 *   → ตอนนี้ log structured ไว้ก่อน · จุดต่อสายอยู่ที่นี่ที่เดียว
 *   → SPEC §11: การส่งอีเมลออกนอกระบบต้อง ask ก่อนเปิดใช้จริง
 */
export async function notifyCapReached(env: Env, userId: string): Promise<void> {
  const db = createDb(env.DB)
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0]
  if (!user) return
  // TODO(email-provider): ส่งอีเมลจริงเมื่อเจ้าของเคาะ provider — ดูคำถามท้าย CP4
  console.log(
    JSON.stringify({
      event: 'cap_reached',
      userId: user.id,
      email: user.email,
      message: `ครบเพดานชั่วโมงทำงานของวันแล้ว — พักได้แล้ว 🌱 (ทำเกินจริงค่อยลง manual ย้อนหลัง)`,
    }),
  )
}
