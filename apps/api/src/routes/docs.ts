import { createDb, docImages, docs } from '@seedoffice/db'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { writeAudit } from '../lib/audit'
import type { AppEnv } from '../types'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/** เอกสาร (SPEC §4.16) — mount ด้วย requireAuth + teamOnly (vendor 403 ทั้งเมนู+API) */
export const docRoutes = new Hono<AppEnv>()

  // tree ทั้งหมด (ไม่เอาเนื้อหา — โหลดทีละหน้า)
  .get('/', async (c) => {
    const db = createDb(c.env.DB)
    const rows = await db
      .select({
        id: docs.id,
        parentId: docs.parentId,
        sortOrder: docs.sortOrder,
        icon: docs.icon,
        title: docs.title,
      })
      .from(docs)
      .where(isNull(docs.deletedAt))
      .orderBy(asc(docs.sortOrder), asc(docs.createdAt))
    return c.json(rows)
  })

  .post('/', async (c) => {
    const body = z
      .object({
        title: z.string().min(1).max(200),
        parentId: z.string().nullable().optional(),
        icon: z.string().max(8).optional(),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const parentId = body.data.parentId ?? null
    if (parentId) {
      const parent = (
        await db.select().from(docs).where(and(eq(docs.id, parentId), isNull(docs.deletedAt))).limit(1)
      )[0]
      if (!parent) return c.json({ error: 'parent_not_found' }, 404)
    }
    const me = c.get('user')
    const siblings = await db
      .select({ id: docs.id })
      .from(docs)
      .where(and(parentId ? eq(docs.parentId, parentId) : isNull(docs.parentId), isNull(docs.deletedAt)))
    const inserted = await db
      .insert(docs)
      .values({
        title: body.data.title,
        icon: body.data.icon,
        parentId,
        sortOrder: siblings.length,
        createdBy: me.id,
        updatedBy: me.id,
      })
      .returning()
    await writeAudit(c.env, {
      actorId: me.id,
      action: 'doc.create',
      entity: 'doc',
      entityId: inserted[0]?.id ?? '',
      meta: { title: body.data.title, parentId },
    })
    return c.json(inserted[0], 201)
  })

  .get('/:id', async (c) => {
    const db = createDb(c.env.DB)
    const doc = (
      await db
        .select()
        .from(docs)
        .where(and(eq(docs.id, c.req.param('id')), isNull(docs.deletedAt)))
        .limit(1)
    )[0]
    if (!doc) return c.json({ error: 'not_found' }, 404)
    return c.json(doc)
  })

  // autosave (title/icon/content) — content ไม่เขียน audit (จะ spam) · เปลี่ยนชื่อ audit ไว้ตามรอย
  .patch('/:id', async (c) => {
    const body = z
      .object({
        title: z.string().min(1).max(200).optional(),
        icon: z.string().max(8).nullable().optional(),
        contentMarkdown: z.string().max(500_000).optional(),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const me = c.get('user')
    const before = (
      await db
        .select()
        .from(docs)
        .where(and(eq(docs.id, c.req.param('id')), isNull(docs.deletedAt)))
        .limit(1)
    )[0]
    if (!before) return c.json({ error: 'not_found' }, 404)
    const updated = await db
      .update(docs)
      .set({ ...body.data, updatedBy: me.id, updatedAt: new Date() })
      .where(eq(docs.id, before.id))
      .returning()
    if (body.data.title && body.data.title !== before.title)
      await writeAudit(c.env, {
        actorId: me.id,
        action: 'doc.rename',
        entity: 'doc',
        entityId: before.id,
        meta: { before: before.title, after: body.data.title },
      })
    return c.json(updated[0])
  })

  // ย้าย/จัดเรียง — กันย้ายลงใต้ลูกหลานตัวเอง (cycle)
  .post('/:id/move', async (c) => {
    const body = z
      .object({ parentId: z.string().nullable(), sortOrder: z.number().int().min(0) })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const id = c.req.param('id')
    const all = await db
      .select({ id: docs.id, parentId: docs.parentId })
      .from(docs)
      .where(isNull(docs.deletedAt))
    if (body.data.parentId) {
      // เดินขึ้นจาก parent เป้าหมาย — ถ้าเจอตัวเอง = cycle
      let cur: string | null = body.data.parentId
      while (cur) {
        if (cur === id) return c.json({ error: 'cycle', message: 'ย้ายลงใต้หน้าลูกของตัวเองไม่ได้' }, 409)
        cur = all.find((d) => d.id === cur)?.parentId ?? null
      }
      if (!all.some((d) => d.id === body.data.parentId)) return c.json({ error: 'parent_not_found' }, 404)
    }
    const updated = await db
      .update(docs)
      .set({ parentId: body.data.parentId, sortOrder: body.data.sortOrder, updatedBy: c.get('user').id, updatedAt: new Date() })
      .where(and(eq(docs.id, id), isNull(docs.deletedAt)))
      .returning()
    if (!updated[0]) return c.json({ error: 'not_found' }, 404)
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'doc.move',
      entity: 'doc',
      entityId: id,
      meta: body.data,
    })
    return c.json(updated[0])
  })

  // ลบ = soft-delete ทั้ง subtree
  .delete('/:id', async (c) => {
    const db = createDb(c.env.DB)
    const id = c.req.param('id')
    const all = await db
      .select({ id: docs.id, parentId: docs.parentId, title: docs.title })
      .from(docs)
      .where(isNull(docs.deletedAt))
    const target = all.find((d) => d.id === id)
    if (!target) return c.json({ error: 'not_found' }, 404)
    const toDelete = new Set([id])
    let grew = true
    while (grew) {
      grew = false
      for (const d of all)
        if (d.parentId && toDelete.has(d.parentId) && !toDelete.has(d.id)) {
          toDelete.add(d.id)
          grew = true
        }
    }
    const now = new Date()
    for (const did of toDelete)
      await db.update(docs).set({ deletedAt: now }).where(eq(docs.id, did))
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'doc.delete',
      entity: 'doc',
      entityId: id,
      meta: { title: target.title, subtreeCount: toDelete.size },
    })
    return c.json({ ok: true, deleted: toDelete.size })
  })

  // D3: อัปรูป → R2 (ไม่รับ SVG กัน XSS · SPEC §4.16)
  .post('/images', async (c) => {
    const form = await c.req.formData()
    const file = form.get('file')
    const docId = form.get('docId')
    if (!(file instanceof File)) return c.json({ error: 'file_required' }, 400)
    if (!/^image\/(png|jpeg|gif|webp|avif)$/.test(file.type))
      return c.json({ error: 'invalid_type', message: 'รับเฉพาะรูป png/jpeg/gif/webp/avif (ไม่รับ SVG)' }, 415)
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) return c.json({ error: 'file_too_large' }, 413)
    const db = createDb(c.env.DB)
    const me = c.get('user')
    const safeName = file.name.replaceAll('/', '_').slice(0, 120)
    const r2Key = `docs/${crypto.randomUUID()}-${safeName}`
    await c.env.FILES.put(r2Key, file.stream(), { httpMetadata: { contentType: file.type } })
    const inserted = await db
      .insert(docImages)
      .values({
        docId: typeof docId === 'string' && docId ? docId : null,
        r2Key,
        filename: safeName,
        mime: file.type,
        sizeBytes: file.size,
        uploadedBy: me.id,
      })
      .returning()
    return c.json({ id: inserted[0]?.id, url: `/api/docs/images/${inserted[0]?.id}` }, 201)
  })

  .get('/images/:id', async (c) => {
    const db = createDb(c.env.DB)
    const img = (
      await db.select().from(docImages).where(eq(docImages.id, c.req.param('id'))).limit(1)
    )[0]
    if (!img) return c.json({ error: 'not_found' }, 404)
    const obj = await c.env.FILES.get(img.r2Key)
    if (!obj) return c.json({ error: 'object_missing' }, 404)
    return new Response(obj.body, {
      headers: { 'content-type': img.mime, 'cache-control': 'private, max-age=86400' },
    })
  })
