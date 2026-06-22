import { Hono } from 'hono'
import { requireAuth } from './middleware/auth'
import { ownerOnly, teamOnly } from './middleware/roles'
import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'
import { calendarRoutes } from './routes/calendar'
import { calendarConnectRoutes } from './routes/calendar-connect'
import { docRoutes } from './routes/docs'
import { expenseRoutes } from './routes/expenses'
import { teamActivityRoutes } from './routes/team-activity'
import { financeRoutes } from './routes/finance'
import { icsFeedRoutes } from './routes/ics'
import { inboxSettingsRoutes } from './routes/inbox-settings'
import { inboxThreadRoutes } from './routes/inbox-threads'
import { overviewRoutes } from './routes/overview'
import { payrollAdminRoutes } from './routes/payroll-admin'
import { payrollRoutes } from './routes/payroll'
import { clientRoutes } from './routes/clients'
import { crmItemRoutes } from './routes/crm-items'
import { projectRoutes } from './routes/projects'
import { taskDetailRoutes } from './routes/task-detail'
import { taskRoutes } from './routes/tasks'
import { timeRoutes } from './routes/time'
import { profileRoutes } from './routes/profile'
import { tokenRoutes } from './routes/tokens'
import { userRoutes } from './routes/users'
import { runScheduled } from './scheduled'

export { PresenceHub } from './do/presence-hub'
export { InboxThreadHub } from './do/inbox-thread-hub'
import type { AppEnv } from './types'

const app = new Hono<AppEnv>()

app.get('/api/health', (c) => c.json({ ok: true }))

// ICS feed สาธารณะ (SPEC §4.14 · E6) — ไม่มี auth (token ในพาธกันเข้าถึง)
// ต้อง mount ก่อน app.use('/api/calendar/*', requireAuth, ...) ด้านล่าง: Hono รัน handler
// ตามลำดับที่ register — feed ที่ register ก่อนจะตอบจบก่อน middleware auth ของ /api/calendar/* จะทำงาน
app.route('/api/calendar/feed', icsFeedRoutes)

app.route('/api/auth', authRoutes)
app.use('/api/admin/*', requireAuth, ownerOnly)
app.route('/api/admin', adminRoutes)
app.route('/api/admin', payrollAdminRoutes)
app.use('/api/users/*', requireAuth)
app.use('/api/users', requireAuth)
app.use('/api/config', requireAuth)
app.route('/api', userRoutes)
// Personal Access Tokens (SPEC §4.18) — จัดการผ่านเว็บ (cookie) · owner+member · vendor ❌
app.use('/api/tokens', requireAuth, teamOnly)
app.use('/api/tokens/*', requireAuth, teamOnly)
app.route('/api/tokens', tokenRoutes)
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
// เชื่อม Google Calendar (sync ขาเข้า · SPEC §4.14 E6) = owner เท่านั้น
app.use('/api/calendar-connect', requireAuth, ownerOnly)
app.use('/api/calendar-connect/*', requireAuth, ownerOnly)
app.route('/api/calendar-connect', calendarConnectRoutes)
app.use('/api/team-activity', requireAuth, teamOnly)
app.route('/api/team-activity', teamActivityRoutes)
// อีเมลกลาง (SPEC §4.12) — สิทธิ์สองชั้น:
// ใช้งาน inbox (threads/attachments) = owner+member (vendor ❌ ตาม §3)
app.use('/api/inbox/threads', requireAuth, teamOnly)
app.use('/api/inbox/threads/*', requireAuth, teamOnly)
app.use('/api/inbox/attachments/*', requireAuth, teamOnly)
app.use('/api/inbox/compose', requireAuth, teamOnly)
app.use('/api/inbox/canned', requireAuth, teamOnly)
app.use('/api/inbox/canned/*', requireAuth, teamOnly)
app.use('/api/inbox/search', requireAuth, teamOnly)
app.use('/api/inbox/import-thread', requireAuth, teamOnly)
// การติดตั้ง (settings/clients/mailboxes/เชื่อม Google) = owner เท่านั้น
app.use('/api/inbox/settings', requireAuth, ownerOnly)
app.use('/api/inbox/clients', requireAuth, ownerOnly)
app.use('/api/inbox/clients/*', requireAuth, ownerOnly)
app.use('/api/inbox/mailboxes', requireAuth, ownerOnly)
app.use('/api/inbox/mailboxes/*', requireAuth, ownerOnly)
app.use('/api/inbox/google/*', requireAuth, ownerOnly)
app.route('/api/inbox', inboxThreadRoutes)
app.route('/api/inbox', inboxSettingsRoutes)

// collision WebSocket ของอีเมลกลาง (SPEC §4.12) — DO ต่อ thread · owner+member (อยู่ใต้ middleware /api/inbox/threads/* แล้ว)
app.get('/api/inbox/threads/:id/ws', async (c) => {
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket')
    return c.json({ error: 'expected_websocket' }, 426)
  const me = c.get('user')
  const headers = new Headers(c.req.raw.headers)
  headers.set('x-user-id', me.id)
  headers.set('x-user-name', me.name)
  const stub = c.env.INBOX_HUB.get(c.env.INBOX_HUB.idFromName(c.req.param('id')))
  return stub.fetch(new Request(c.req.raw.url, { headers }))
})

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

// โปรไฟล์ตัวเอง (GET/PATCH /api/me) — ทุก role · ดู/แก้ ชื่อจริง/นามสกุล/ชื่อเล่น ของตัวเอง
app.use('/api/me', requireAuth)
app.route('/api', profileRoutes)

export { app } // ใช้ในเทสต์ (app.request)

export default {
  fetch: app.fetch,
  scheduled: (controller: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runScheduled(env, controller.cron))
  },
}
