import {
  auditLogs,
  createDb,
  projects,
  taskAttachments,
  taskComments,
  taskGroups,
  tasks,
  users,
} from '@seedoffice/db'
import { asc, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { writeAudit } from '../lib/audit'
import { teamOnly } from '../middleware/roles'
import type { AppEnv } from '../types'

const MAX_FILE_BYTES = 15 * 1024 * 1024 // 15MB ต่อไฟล์

/** task detail: meta + comments + attachments + activity (จาก audit_logs) */
export const taskDetailRoutes = new Hono<AppEnv>()

  .get('/tasks/:id/detail', async (c) => {
    const db = createDb(c.env.DB)
    const taskId = c.req.param('id')
    const row = (
      await db
        .select({ task: tasks, groupName: taskGroups.name, projectName: projects.name, assigneeName: users.name })
        .from(tasks)
        .innerJoin(taskGroups, eq(tasks.groupId, taskGroups.id))
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .leftJoin(users, eq(tasks.assigneeId, users.id))
        .where(eq(tasks.id, taskId))
        .limit(1)
    )[0]
    if (!row) return c.json({ error: 'not_found' }, 404)

    const comments = await db
      .select({ comment: taskComments, userName: users.name, userAvatarUrl: users.avatarUrl })
      .from(taskComments)
      .innerJoin(users, eq(taskComments.userId, users.id))
      .where(eq(taskComments.taskId, taskId))
      .orderBy(asc(taskComments.createdAt))
    const attachments = await db
      .select()
      .from(taskAttachments)
      .where(eq(taskAttachments.taskId, taskId))
      .orderBy(asc(taskAttachments.createdAt))
    const activity = await db
      .select({ log: auditLogs, actorName: users.name, actorAvatarUrl: users.avatarUrl })
      .from(auditLogs)
      .innerJoin(users, eq(auditLogs.actorId, users.id))
      .where(eq(auditLogs.entityId, taskId))
      .orderBy(desc(auditLogs.at))
      .limit(50)

    return c.json({
      ...row.task,
      groupName: row.groupName,
      projectName: row.projectName,
      assigneeName: row.assigneeName,
      comments: comments.map((x) => ({ ...x.comment, userName: x.userName, userAvatarUrl: x.userAvatarUrl })),
      attachments,
      activity: activity.map((x) => ({
        id: x.log.id,
        action: x.log.action,
        actorName: x.actorName,
        actorAvatarUrl: x.actorAvatarUrl,
        meta: x.log.meta,
        at: x.log.at,
      })),
    })
  })

  // comment — เปิดให้ vendor ด้วย (ต้องสื่อสารบนงานที่ตัวเองลงเวลา) · จดเป็น interpretation ไว้ใน SPEC
  .post('/tasks/:id/comments', async (c) => {
    const body = z.object({ body: z.string().min(1).max(4000) }).safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const task = (await db.select().from(tasks).where(eq(tasks.id, c.req.param('id'))).limit(1))[0]
    if (!task) return c.json({ error: 'not_found' }, 404)
    const me = c.get('user')
    const inserted = await db
      .insert(taskComments)
      .values({ taskId: task.id, userId: me.id, body: body.data.body })
      .returning()
    await writeAudit(c.env, {
      actorId: me.id,
      action: 'task.comment',
      entity: 'task',
      entityId: task.id,
      meta: { preview: body.data.body.slice(0, 80) },
    })
    return c.json({ ...inserted[0], userName: me.name }, 201)
  })

  // อัปโหลดไฟล์ → R2 (multipart) — owner+member
  .post('/tasks/:id/attachments', teamOnly, async (c) => {
    const db = createDb(c.env.DB)
    const task = (await db.select().from(tasks).where(eq(tasks.id, c.req.param('id'))).limit(1))[0]
    if (!task) return c.json({ error: 'not_found' }, 404)
    const form = await c.req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return c.json({ error: 'file_required' }, 400)
    if (file.size === 0 || file.size > MAX_FILE_BYTES) return c.json({ error: 'file_too_large' }, 413)

    const safeName = file.name.replaceAll('/', '_').slice(0, 120)
    const r2Key = `tasks/${task.id}/${crypto.randomUUID()}-${safeName}`
    await c.env.FILES.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    })
    const me = c.get('user')
    const inserted = await db
      .insert(taskAttachments)
      .values({
        taskId: task.id,
        r2Key,
        filename: safeName,
        mime: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        uploadedBy: me.id,
      })
      .returning()
    await writeAudit(c.env, {
      actorId: me.id,
      action: 'task.attach',
      entity: 'task',
      entityId: task.id,
      meta: { filename: safeName },
    })
    return c.json(inserted[0], 201)
  })

  // โหลดไฟล์ (auth แล้วทุก role) — รูป inline, อื่นๆ (รวม SVG กัน XSS) บังคับดาวน์โหลด
  .get('/attachments/:id', async (c) => {
    const db = createDb(c.env.DB)
    const att = (
      await db.select().from(taskAttachments).where(eq(taskAttachments.id, c.req.param('id'))).limit(1)
    )[0]
    if (!att) return c.json({ error: 'not_found' }, 404)
    const obj = await c.env.FILES.get(att.r2Key)
    if (!obj) return c.json({ error: 'object_missing' }, 404)
    const inlineSafe = /^image\/(png|jpeg|gif|webp|avif)$/.test(att.mime)
    return new Response(obj.body, {
      headers: {
        'content-type': inlineSafe ? att.mime : 'application/octet-stream',
        'content-disposition': `${inlineSafe ? 'inline' : 'attachment'}; filename="${encodeURIComponent(att.filename)}"`,
        'cache-control': 'private, max-age=3600',
      },
    })
  })

  .delete('/attachments/:id', teamOnly, async (c) => {
    const db = createDb(c.env.DB)
    const att = (
      await db.select().from(taskAttachments).where(eq(taskAttachments.id, c.req.param('id'))).limit(1)
    )[0]
    if (!att) return c.json({ error: 'not_found' }, 404)
    const me = c.get('user')
    if (me.role !== 'owner' && att.uploadedBy !== me.id) return c.json({ error: 'forbidden' }, 403)
    await c.env.FILES.delete(att.r2Key)
    await db.delete(taskAttachments).where(eq(taskAttachments.id, att.id))
    await writeAudit(c.env, {
      actorId: me.id,
      action: 'task.attach_delete',
      entity: 'task',
      entityId: att.taskId,
      meta: { filename: att.filename },
    })
    return c.json({ ok: true })
  })
