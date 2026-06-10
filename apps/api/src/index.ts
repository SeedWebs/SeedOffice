import { Hono } from 'hono'
import { requireAuth } from './middleware/auth'
import { ownerOnly, teamOnly } from './middleware/roles'
import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'
import { financeRoutes } from './routes/finance'
import { overviewRoutes } from './routes/overview'
import { payrollAdminRoutes } from './routes/payroll-admin'
import { payrollRoutes } from './routes/payroll'
import { clientPickerRoutes, projectRoutes } from './routes/projects'
import { taskDetailRoutes } from './routes/task-detail'
import { taskRoutes } from './routes/tasks'
import { timeRoutes } from './routes/time'
import { userRoutes } from './routes/users'
import { runScheduled } from './scheduled'
import type { AppEnv } from './types'

const app = new Hono<AppEnv>()

app.get('/api/health', (c) => c.json({ ok: true }))

app.route('/api/auth', authRoutes)
app.use('/api/admin/*', requireAuth, ownerOnly)
app.route('/api/admin', adminRoutes)
app.route('/api/admin', payrollAdminRoutes)
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
app.use('/api/attachments/*', requireAuth)
app.use('/api/overview', requireAuth)
app.use('/api/timer', requireAuth)
app.use('/api/timer/*', requireAuth)
app.use('/api/time/*', requireAuth)
app.use('/api/team-hours', requireAuth)
// การเงินโปรเจกต์ทั้งหมด: vendor 403 (SPEC §4.8)
app.use('/api/projects/:id/finance', requireAuth, teamOnly)
app.use('/api/projects/:id/milestones', requireAuth, teamOnly)
app.use('/api/projects/:id/payments', requireAuth, teamOnly)
app.use('/api/milestones/*', requireAuth, teamOnly)
app.use('/api/payments/*', requireAuth, teamOnly)
app.route('/api', taskRoutes)
app.route('/api', taskDetailRoutes)
app.route('/api', overviewRoutes)
app.route('/api', timeRoutes)
app.route('/api', financeRoutes)
app.use('/api/payroll/*', requireAuth)
app.route('/api', payrollRoutes)

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

export { app } // ใช้ในเทสต์ (app.request)

export default {
  fetch: app.fetch,
  scheduled: (controller: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runScheduled(env, controller.cron))
  },
}
