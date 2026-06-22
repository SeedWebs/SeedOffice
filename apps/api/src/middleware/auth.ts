import { getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { SESSION_COOKIE, userFromToken } from '../lib/session'
import { userFromApiToken } from '../lib/api-token'
import type { AppEnv } from '../types'

/**
 * ต้อง login ด้วย **session cookie เท่านั้น** — set c.var.user ไม่งั้น 401
 * route การเงิน (payroll/finance/expenses/clients/crm) ใช้ตัวนี้ → PAT (ไม่มี cookie) แตะไม่ได้เด็ดขาด (SPEC §4.18)
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return c.json({ error: 'unauthorized' }, 401)
  const user = await userFromToken(c.env, token)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  c.set('user', user)
  await next()
})

/**
 * รับ **session cookie** (browser) หรือ **PAT** `Authorization: Bearer sko_…` (Claude/automation)
 * ใช้เฉพาะ route ที่เปิดให้ PAT (งาน/เวลา) — ผ่าน PAT จะ set c.var.tokenScopes ด้วย แล้วใช้ requireScope() ต่อ
 * cookie มาก่อนเสมอ (คนจริงใช้เว็บ) · ทั้งสองทางลงเอยที่ c.var.user เหมือนกัน → role gate เดิมทำงานปกติ
 */
export const requireAuthOrToken = createMiddleware<AppEnv>(async (c, next) => {
  const cookie = getCookie(c, SESSION_COOKIE)
  if (cookie) {
    const user = await userFromToken(c.env, cookie)
    if (!user) return c.json({ error: 'unauthorized' }, 401)
    c.set('user', user)
    return next()
  }
  const authz = c.req.header('Authorization')
  const bearer = authz?.startsWith('Bearer ') ? authz.slice(7).trim() : null
  if (bearer) {
    const result = await userFromApiToken(c.env, bearer)
    if (!result) return c.json({ error: 'unauthorized' }, 401)
    c.set('user', result.user)
    c.set('tokenScopes', result.scopes)
    return next()
  }
  return c.json({ error: 'unauthorized' }, 401)
})
