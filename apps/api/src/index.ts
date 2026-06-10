import { Hono } from 'hono'
import { requireAuth } from './middleware/auth'
import { ownerOnly, teamOnly } from './middleware/roles'
import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'
import { calendarRoutes } from './routes/calendar'
import { docRoutes } from './routes/docs'
import { expenseRoutes } from './routes/expenses'
import { teamActivityRoutes } from './routes/team-activity'
import { financeRoutes } from './routes/finance'
import { overviewRoutes } from './routes/overview'
import { payrollAdminRoutes } from './routes/payroll-admin'
import { payrollRoutes } from './routes/payroll'
import { clientRoutes } from './routes/clients'
import { crmItemRoutes } from './routes/crm-items'
import { projectRoutes } from './routes/projects'
import { taskDetailRoutes } from './routes/task-detail'
import { taskRoutes } from './routes/tasks'
import { timeRoutes } from './routes/time'
import { userRoutes } from './routes/users'
import { runScheduled } from './scheduled'

export { PresenceHub } from './do/presence-hub'
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
// ลูกค้า/CRM: owner+member เท่านั้น (SPEC §4.17)
app.use('/api/clients', requireAuth, teamOnly)
app.use('/api/clients/*', requireAuth, teamOnly)
app.use('/api/services/*', requireAuth, teamOnly)
app.use('/api/notes/*', requireAuth, teamOnly)
app.route('/api/clients', clientRoutes)
app.route('/api', crmItemRoutes)
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
app.use('/api/projects/:id/pnl', requireAuth, teamOnly)
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
// เอกสาร: owner+member เท่านั้น (vendor 403 — SPEC §4.16)
app.use('/api/docs', requireAuth, teamOnly)
app.use('/api/docs/*', requireAuth, teamOnly)
app.route('/api/docs', docRoutes)
// เงินสดย่อย: owner+member (vendor ❌ — SPEC §2)
app.use('/api/expenses', requireAuth, teamOnly)
app.use('/api/expenses/*', requireAuth, teamOnly)
app.route('/api/expenses', expenseRoutes)
// ปฏิทินทีม + team activity: owner+member (vendor ไม่เห็น team hub — SPEC §4.10)
app.use('/api/calendar', requireAuth, teamOnly)
app.use('/api/calendar/*', requireAuth, teamOnly)
app.route('/api/calendar', calendarRoutes)
app.use('/api/team-activity', requireAuth, teamOnly)
app.route('/api/team-activity', teamActivityRoutes)

// presence WebSocket (SPEC §4.15 realtime) — owner+member · ส่งต่อให้ DO พร้อมตัวตนที่ auth แล้ว
app.get('/api/presence/ws', requireAuth, teamOnly, async (c) => {
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket')
    return c.json({ error: 'expected_websocket' }, 426)
  const me = c.get('user')
  const headers = new Headers(c.req.raw.headers)
  headers.set('x-user-id', me.id)
  headers.set('x-user-name', me.name)
  const stub = c.env.PRESENCE.get(c.env.PRESENCE.idFromName('global'))
  return stub.fetch(new Request(c.req.raw.url, { headers }))
})

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
