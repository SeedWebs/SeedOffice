import { API_TOKEN_SCOPES } from '@seedoffice/db'
import { Hono } from 'hono'
import { z } from 'zod'
import { apiTokenOwner, createApiToken, listApiTokens, revokeApiToken } from '../lib/api-token'
import { writeAudit } from '../lib/audit'
import type { AppEnv } from '../types'

/**
 * Personal Access Tokens (SPEC §4.18) — owner+member (mount requireAuth + teamOnly ใน index.ts)
 * จัดการผ่านเว็บ (cookie) เท่านั้น · แต่ละคนเห็น/สร้าง token ของตัวเอง · owner เพิกถอนของใครก็ได้
 * scope = งาน+เวลา (API_TOKEN_SCOPES) — ไม่มี scope การเงิน · token จริงโชว์ครั้งเดียวตอนสร้าง
 */
const createBody = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(API_TOKEN_SCOPES)).min(1),
})

export const tokenRoutes = new Hono<AppEnv>()

  // token ของฉัน (ไม่คืนค่า token จริง — โชว์ครั้งเดียวตอนสร้าง)
  .get('/', async (c) => {
    const tokens = await listApiTokens(c.env, c.get('user').id)
    return c.json({ tokens })
  })

  // สร้าง — คืน token เต็ม "ครั้งเดียว" (client ต้องก็อปเก็บทันที)
  .post('/', async (c) => {
    const body = createBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'invalid_body' }, 400)
    const me = c.get('user')
    const { token, id } = await createApiToken(c.env, me.id, body.data.name, body.data.scopes)
    await writeAudit(c.env, {
      actorId: me.id,
      action: 'api_token.create',
      entity: 'api_tokens',
      entityId: id,
      meta: { name: body.data.name, scopes: body.data.scopes },
    })
    return c.json({ id, name: body.data.name, scopes: body.data.scopes, token }, 201)
  })

  // เพิกถอน — เจ้าของ token หรือ owner เท่านั้น
  .delete('/:id', async (c) => {
    const id = c.req.param('id')
    const me = c.get('user')
    const ownerId = await apiTokenOwner(c.env, id)
    if (!ownerId) return c.json({ error: 'not_found' }, 404)
    if (ownerId !== me.id && me.role !== 'owner') return c.json({ error: 'forbidden' }, 403)
    await revokeApiToken(c.env, id)
    await writeAudit(c.env, {
      actorId: me.id,
      action: 'api_token.revoke',
      entity: 'api_tokens',
      entityId: id,
      meta: { tokenOwner: ownerId },
    })
    return c.json({ ok: true })
  })
