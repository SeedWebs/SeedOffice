import { createDb, tasks, timerSessions } from '@seedoffice/db'
import { eq, lt } from 'drizzle-orm'
import { runBackup } from './lib/backup'
import { syncAllMailboxes } from './lib/inbox-sync'
import { purgeExpiredSessions } from './lib/session'
import { closeSession, getCapMinutes } from './lib/time-core'

const BACKUP_CRON = '0 20 * * *' // 03:00 BKK รายวัน
const INBOX_SYNC_CRON = '* * * * *'

/**
 * Cron 3 จังหวะ:
 * - ทุก 1 นาที: sync อีเมลกลาง (E2 — เฉพาะกล่อง connected · ไม่มีกล่อง = จบทันที)
 * - ทุก 30 นาที: กวาด timer วิ่งเกินเพดาน (ปิดให้ที่เพดาน) + ล้าง session login หมดอายุ
 * - รายวัน 03:00 BKK: backup D1 → R2 (T18 — ต้องมาก่อนปิดงวดจริงครั้งแรก)
 */
export async function runScheduled(env: Env, cron: string): Promise<void> {
  if (cron === INBOX_SYNC_CRON) return syncAllMailboxes(env)

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

  if (cron === BACKUP_CRON) await runBackup(env)
}
