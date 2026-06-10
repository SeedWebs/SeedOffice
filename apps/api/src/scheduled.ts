import { createDb, tasks, timerSessions } from '@seedoffice/db'
import { eq, lt } from 'drizzle-orm'
import { purgeExpiredSessions } from './lib/session'
import { closeSession, getCapMinutes } from './lib/time-core'

/**
 * Cron (ทุก 30 นาที): กวาด timer ที่วิ่งเกินเพดาน session (ลืมปิด/ปิดแล็ปท็อปหนี)
 * → ปิดให้ที่เพดาน (กฎ SPEC §4.5: ข้ามคืนได้ แต่ครบ 8 ชม. auto-stop) + ล้าง session login หมดอายุ
 * T18 จะเพิ่ม backup รายวันที่นี่ (แยกตาม cron expression)
 */
export async function runScheduled(env: Env, cron: string): Promise<void> {
  void cron // เผื่อแยกงานตาม schedule ใน T18
  const db = createDb(env.DB)
  const capMinutes = await getCapMinutes(env)
  const stale = await db
    .select()
    .from(timerSessions)
    .where(lt(timerSessions.startedAt, Date.now() - capMinutes * 60_000))
  for (const s of stale) {
    const task = (await db.select().from(tasks).where(eq(tasks.id, s.taskId)).limit(1))[0]
    await closeSession(env, s, task?.projectId ?? '', Date.now())
  }
  await purgeExpiredSessions(env)
}
