import { createMiddleware } from 'hono/factory'
import type { User } from '@seedoffice/db'
import type { AppEnv } from '../types'

type Role = User['role']

/**
 * จำกัด endpoint ตาม role — ใช้ต่อจาก requireAuth เสมอ
 * Privacy gate ที่ server (SPEC §2): vendor ห้ามแตะ P&L/payroll ทีม/rate คนอื่น → 403
 */
export function requireRole(...roles: Role[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'unauthorized' }, 401)
    if (!roles.includes(user.role)) return c.json({ error: 'forbidden' }, 403)
    await next()
  })
}

/** ทางลัดที่ใช้บ่อย */
export const ownerOnly = requireRole('owner')
export const teamOnly = requireRole('owner', 'member') // vendor ❌ (การเงิน/ลูกค้า/เอกสาร)
