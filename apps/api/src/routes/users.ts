import { bkkDateOf, rateAt, resolveStatuses } from '@seedoffice/core'
import { companyConfig, createDb, rates, users } from '@seedoffice/db'
import { asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../types'

/** routes ที่ทุก role ใช้ (ติด requireAuth ตอน mount) */
export const userRoutes = new Hono<AppEnv>()

  // รายชื่อ user active — ใช้กับ assignee picker (ไม่มีข้อมูลเงิน)
  .get('/users', async (c) => {
    const db = createDb(c.env.DB)
    const list = await db
      .select({ id: users.id, name: users.name, role: users.role, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.status, 'active'))
      .orderBy(asc(users.name))
    return c.json(list)
  })

  // ประวัติ rate — ตัวเอง: ทุก role · ของคนอื่น: owner+member (rate ทีมประกาศอยู่แล้ว) · vendor ❌
  .get('/users/:id/rates', async (c) => {
    const me = c.get('user')
    const targetId = c.req.param('id')
    if (me.role === 'vendor' && targetId !== me.id) return c.json({ error: 'forbidden' }, 403)
    const db = createDb(c.env.DB)
    const history = await db
      .select()
      .from(rates)
      .where(eq(rates.userId, targetId))
      .orderBy(asc(rates.effectiveFrom))
    const current = rateAt(history, bkkDateOf(Date.now()))
    return c.json({ history, currentRateSatangPerHour: current })
  })

  // config บริษัท (เพดานชั่วโมง/วันตัดรอบ) — ทุก role ใช้แสดงผล/ค่า timer
  // เลือกคอลัมน์ชัดเจน: ห้ามส่ง icsToken (token ลับ ICS feed) ออกให้ทุก role — เห็นได้เฉพาะ owner
  .get('/config', async (c) => {
    const db = createDb(c.env.DB)
    const cfg = (
      await db
        .select({
          id: companyConfig.id,
          cutoffDay: companyConfig.cutoffDay,
          workHourCapMinutes: companyConfig.workHourCapMinutes,
          memberDomain: companyConfig.memberDomain,
          projectStatuses: companyConfig.projectStatuses,
        })
        .from(companyConfig)
        .limit(1)
    )[0]
    if (!cfg) return c.json({ error: 'config_missing' }, 500)
    // null = ยังไม่ตั้ง → คืน default 6 ตัว (ทุก role ใช้ render chip/filter)
    return c.json({ ...cfg, projectStatuses: resolveStatuses(cfg.projectStatuses) })
  })
