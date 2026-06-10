import { Hono } from 'hono'
import { requireAuth } from './middleware/auth'
import { authRoutes } from './routes/auth'
import type { AppEnv } from './types'

const app = new Hono<AppEnv>()

app.get('/api/health', (c) => c.json({ ok: true }))

app.route('/api/auth', authRoutes)

app.get('/api/me', requireAuth, (c) => {
  const u = c.var.user
  return c.json({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatarUrl: u.avatarUrl,
  })
})

export default app
