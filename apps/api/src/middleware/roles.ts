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

/**
 * จำกัด PAT ตาม scope (SPEC §4.18) — ใช้ต่อจาก requireAuthOrToken
 * มาทาง PAT (มี c.var.tokenScopes) → ต้องมีครบทุก scope ที่ต้องการ ไม่งั้น 403
 * มาทาง session cookie (ไม่มี tokenScopes = คนจริง) → ผ่านเสมอ (role gate เดิมคุมสิทธิ์อยู่แล้ว)
 */
export function requireScope(...needed: string[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const scopes = c.get('tokenScopes')
    if (scopes && !needed.every((s) => scopes.includes(s))) {
      return c.json({ error: 'insufficient_scope', need: needed }, 403)
    }
    await next()
  })
}
