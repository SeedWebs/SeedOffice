import { auditLogs, createDb } from '@seedoffice/db'
import { env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'
import { writeAudit } from '../src/lib/audit'
import { requireAuth } from '../src/middleware/auth'
import { ownerOnly, teamOnly } from '../src/middleware/roles'
import type { AppEnv } from '../src/types'
import { loginAs, seedUsers } from './helpers'

// app จำลองที่ติด guard เหมือน endpoint จริง — semantics เดียวกับที่ T07+ จะใช้
const guarded = new Hono<AppEnv>()
  .get('/owner-only', requireAuth, ownerOnly, (c) => c.json({ ok: true }))
  .get('/team-only', requireAuth, teamOnly, (c) => c.json({ ok: true }))

beforeEach(async () => {
  await seedUsers()
})

async function statusFor(path: string, email: string): Promise<number> {
  const cookie = await loginAs(guardedWithAuthRoutes, email)
  const res = await guardedWithAuthRoutes.request(path, { headers: { cookie } }, env)
  return res.status
}

// รวม auth routes เพื่อใช้ dev-login ใน loginAs
import { authRoutes } from '../src/routes/auth'
const guardedWithAuthRoutes = new Hono<AppEnv>()
  .route('/api/auth', authRoutes)
  .route('/', guarded)

describe('requireRole — privacy gate ที่ server (SPEC §2)', () => {
  it('owner-only: owner ✓ · member 403 · vendor 403', async () => {
    expect(await statusFor('/owner-only', 'owner@seedwebs.com')).toBe(200)
    expect(await statusFor('/owner-only', 'pond@seedwebs.com')).toBe(403)
    expect(await statusFor('/owner-only', 'somchai@example.com')).toBe(403)
  })
  it('team-only (vendor ❌ การเงิน/P&L): owner ✓ member ✓ vendor 403', async () => {
    expect(await statusFor('/team-only', 'owner@seedwebs.com')).toBe(200)
    expect(await statusFor('/team-only', 'pond@seedwebs.com')).toBe(200)
    expect(await statusFor('/team-only', 'somchai@example.com')).toBe(403)
  })
  it('ไม่ login → 401 (ไม่ใช่ 403)', async () => {
    expect((await guardedWithAuthRoutes.request('/owner-only', {}, env)).status).toBe(401)
  })
})

describe('audit log', () => {
  it('writeAudit เก็บ actor/action/entity + meta (before→after)', async () => {
    await writeAudit(env, {
      actorId: 'u_owner',
      action: 'rate.update',
      entity: 'rate',
      entityId: 'r_test',
      meta: { before: 40000, after: 45000 },
    })
    const rows = await createDb(env.DB).select().from(auditLogs)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actorId: 'u_owner',
      action: 'rate.update',
      entity: 'rate',
      entityId: 'r_test',
      meta: { before: 40000, after: 45000 },
    })
    expect(rows[0]?.at).toBeInstanceOf(Date)
  })
})
