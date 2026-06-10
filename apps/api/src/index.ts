import { Hono } from 'hono'
import { requireAuth } from './middleware/auth'
import { ownerOnly } from './middleware/roles'
import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'
import { clientPickerRoutes, projectRoutes } from './routes/projects'
import { taskRoutes } from './routes/tasks'
import { userRoutes } from './routes/users'
import type { AppEnv } from './types'

const app = new Hono<AppEnv>()

app.get('/api/health', (c) => c.json({ ok: true }))

app.route('/api/auth', authRoutes)
app.use('/api/admin/*', requireAuth, ownerOnly)
app.route('/api/admin', adminRoutes)
app.use('/api/users/*', requireAuth)
app.use('/api/users', requireAuth)
app.use('/api/config', requireAuth)
app.route('/api', userRoutes)
app.use('/api/projects/*', requireAuth)
app.use('/api/projects', requireAuth)
app.route('/api/projects', projectRoutes)
app.use('/api/clients', requireAuth)
app.route('/api/clients', clientPickerRoutes)
app.use('/api/groups/*', requireAuth)
app.use('/api/tasks/*', requireAuth)
app.route('/api', taskRoutes)

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
