import { rateAt, remainingCapMinutes, splitSessionMinutes } from '@seedoffice/core'
import { companyConfig, createDb, rates, timeEntries, timerSessions, type TimerSession } from '@seedoffice/db'
import { and, eq, isNull } from 'drizzle-orm'
import { writeAudit } from './audit'
import { notifyCapReached } from './notify'

export async function getCapMinutes(env: Env): Promise<number> {
  const db = createDb(env.DB)
  const cfg = (await db.select().from(companyConfig).limit(1))[0]
  return cfg?.workHourCapMinutes ?? 480
}

/** นาทีที่ลงแล้วของ user ในวันหนึ่ง (ไม่รวมที่ถูกลบ) */
export async function loggedMinutes(env: Env, userId: string, workDate: string): Promise<number> {
  const db = createDb(env.DB)
  const rows = await db
    .select({ minutes: timeEntries.minutes })
    .from(timeEntries)
    .where(
      and(eq(timeEntries.userId, userId), eq(timeEntries.workDate, workDate), isNull(timeEntries.deletedAt)),
    )
  return rows.reduce((s, r) => s + r.minutes, 0)
}

export async function rateFor(env: Env, userId: string, workDate: string): Promise<number | null> {
  const db = createDb(env.DB)
  const history = await db.select().from(rates).where(eq(rates.userId, userId))
  return rateAt(history, workDate)
}

/**
 * ปิด timer session → สร้าง time entries
 * กฎ (SPEC §4.5 v0.9): session ยาวสุด = เพดาน (auto-stop ที่ 8 ชม.) ·
 * แบ่ง workDate ที่เที่ยงคืนไทย · ต่อวัน clamp ที่โควตาที่เหลือ (เกิน = ตัดทิ้ง + แจ้ง capped)
 */
export async function closeSession(
  env: Env,
  session: TimerSession,
  taskProjectId: string,
  endMs: number,
): Promise<{ capped: boolean; createdMinutes: number }> {
  const db = createDb(env.DB)
  const capMin = await getCapMinutes(env)
  const sessionEnd = Math.min(endMs, session.startedAt + capMin * 60_000) // เพดาน session
  let capped = endMs > sessionEnd
  let createdMinutes = 0

  if (sessionEnd > session.startedAt) {
    const parts = splitSessionMinutes(session.startedAt, sessionEnd)
    for (const part of parts) {
      const remaining = remainingCapMinutes(await loggedMinutes(env, session.userId, part.workDate), capMin)
      const minutes = Math.min(part.minutes, remaining)
      if (minutes < part.minutes) capped = true
      if (minutes <= 0) continue
      const rate = await rateFor(env, session.userId, part.workDate)
      if (rate === null) continue // ไม่มี rate = ลงเวลาไม่ได้ (กันไว้ตั้งแต่ start แล้ว)
      const inserted = await db
        .insert(timeEntries)
        .values({
          userId: session.userId,
          taskId: session.taskId,
          projectId: taskProjectId,
          workDate: part.workDate,
          minutes,
          rateSnapshotSatang: rate,
          source: 'timer',
        })
        .returning()
      createdMinutes += minutes
      await writeAudit(env, {
        actorId: session.userId,
        action: 'time_entry.create',
        entity: 'time_entry',
        entityId: inserted[0]?.id ?? '',
        meta: { source: 'timer', workDate: part.workDate, minutes },
      })
    }
  }
  await db.delete(timerSessions).where(eq(timerSessions.id, session.id))
  if (capped) await notifyCapReached(env, session.userId)
  return { capped, createdMinutes }
}
