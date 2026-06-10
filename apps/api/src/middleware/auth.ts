import { getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { SESSION_COOKIE, userFromToken } from '../lib/session'
import type { AppEnv } from '../types'

/** ต้อง login — set c.var.user ให้ route ถัดไป ไม่งั้น 401 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return c.json({ error: 'unauthorized' }, 401)
  const user = await userFromToken(c.env, token)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  c.set('user', user)
  await next()
})
