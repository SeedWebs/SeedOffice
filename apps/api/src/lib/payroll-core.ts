import { baseSatang, cycleOf, manualRatio, netOf, type Adjustment, type PayCycle } from '@seedoffice/core'
import { companyConfig, createDb, payAdjustments, payCycleClosures, payNotes, projects, timeEntries } from '@seedoffice/db'
import { and, eq, gte, isNull, lte } from 'drizzle-orm'

/** งวดของ workDate ถูกปิดแล้วหรือยัง — ปิดแล้วห้ามแตะเวลา/adjustment (SPEC §4.7 ไม่เปลี่ยนย้อนหลัง) */
export async function isCycleClosed(env: Env, workDate: string): Promise<boolean> {
  const cycle = await cycleFor(env, workDate)
  const row = (
    await createDb(env.DB)
      .select()
      .from(payCycleClosures)
      .where(eq(payCycleClosures.cycleStart, cycle.start))
      .limit(1)
  )[0]
  return !!row
}

export interface SelfPayroll {
  cycle: PayCycle
  minutesTotal: number
  manualRatio: number
  byProject: { projectId: string; projectName: string; minutes: number }[]
  baseSatang: number
  adjustments: { id: string; kind: Adjustment['kind']; amountSatang: number; note: string | null }[]
  incomeSatang: number
  deductionSatang: number
  netSatang: number
  ownerNote: string | null
}

export async function cycleFor(env: Env, date: string): Promise<PayCycle> {
  const cfg = (await createDb(env.DB).select().from(companyConfig).limit(1))[0]
  return cycleOf(date, cfg?.cutoffDay ?? 25)
}

/**
 * ค่าตอบแทนของคนหนึ่งในงวด — base คำนวณสดจาก entries (ปัดต่อ entry เท่า project cost)
 * ใช้ทั้ง self view (T15) และ owner overview (T16)
 */
export async function payrollOf(env: Env, userId: string, cycle: PayCycle): Promise<SelfPayroll> {
  const db = createDb(env.DB)
  const entries = await db
    .select({
      minutes: timeEntries.minutes,
      rate: timeEntries.rateSnapshotSatang,
      source: timeEntries.source,
      projectId: timeEntries.projectId,
      projectName: projects.name,
    })
    .from(timeEntries)
    .innerJoin(projects, eq(timeEntries.projectId, projects.id))
    .where(
      and(
        eq(timeEntries.userId, userId),
        gte(timeEntries.workDate, cycle.start),
        lte(timeEntries.workDate, cycle.end),
        isNull(timeEntries.deletedAt),
      ),
    )

  let base = 0
  let minutesTotal = 0
  const byProjectMap = new Map<string, { projectId: string; projectName: string; minutes: number }>()
  for (const e of entries) {
    base += baseSatang(e.minutes, e.rate)
    minutesTotal += e.minutes
    const cur = byProjectMap.get(e.projectId)
    if (cur) cur.minutes += e.minutes
    else byProjectMap.set(e.projectId, { projectId: e.projectId, projectName: e.projectName, minutes: e.minutes })
  }

  const adjRows = await db
    .select()
    .from(payAdjustments)
    .where(and(eq(payAdjustments.userId, userId), eq(payAdjustments.cycleStart, cycle.start)))
  const net = netOf(
    base,
    adjRows.map((a) => ({ kind: a.kind, amountSatang: a.amountSatang })),
  )

  const note = (
    await db
      .select()
      .from(payNotes)
      .where(and(eq(payNotes.userId, userId), eq(payNotes.cycleStart, cycle.start)))
      .limit(1)
  )[0]

  return {
    cycle,
    minutesTotal,
    manualRatio: manualRatio(entries),
    byProject: [...byProjectMap.values()].sort((a, b) => b.minutes - a.minutes),
    baseSatang: base,
    adjustments: adjRows.map((a) => ({ id: a.id, kind: a.kind, amountSatang: a.amountSatang, note: a.note })),
    incomeSatang: net.incomeSatang,
    deductionSatang: net.deductionSatang,
    netSatang: net.netSatang,
    ownerNote: note?.body ?? null,
  }
}
