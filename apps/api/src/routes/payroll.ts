import { bkkDateOf, isManualFlagged } from '@seedoffice/core'
import { createDb, rates, timeEntries } from '@seedoffice/db'
import { and, eq, gte, isNull, lte } from 'drizzle-orm'
import { Hono } from 'hono'
import { cycleFor, payrollOf } from '../lib/payroll-core'
import type { AppEnv } from '../types'

/** ค่าตอบแทนของตัวเอง (ทุก role) — เงินเรื่องตัวเองอยู่หน้านี้ที่เดียว (SPEC §4.7) */
export const payrollRoutes = new Hono<AppEnv>().get('/payroll/me', async (c) => {
  const me = c.get('user')
  const today = bkkDateOf(Date.now())
  const cycle = await cycleFor(c.env, c.req.query('date') ?? today)
  const data = await payrollOf(c.env, me.id, cycle)

  const db = createDb(c.env.DB)
  // ชั่วโมงวันนี้ (cross-check กับเป้า/เพดาน)
  const todayRows = await db
    .select({ minutes: timeEntries.minutes })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, me.id),
        gte(timeEntries.workDate, today),
        lte(timeEntries.workDate, today),
        isNull(timeEntries.deletedAt),
      ),
    )
  const myRates = await db.select().from(rates).where(eq(rates.userId, me.id))
  const currentRate = myRates
    .filter((r) => r.effectiveFrom <= today)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0]

  return c.json({
    ...data,
    flagged: isManualFlagged(data.manualRatio),
    todayMinutes: todayRows.reduce((s, r) => s + r.minutes, 0),
    currentRateSatangPerHour: currentRate?.rateSatangPerHour ?? null,
    role: me.role,
  })
})
