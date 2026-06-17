import { costSatang, defaultStatusId, isPatchableLogo, parseProjectLogo, resolveStatuses, statusById, uploadLogo } from '@seedoffice/core'
import { clients, companyConfig, createDb, milestones, payments, projects, tasks, timeEntries, users, type Project } from '@seedoffice/db'
import { asc, eq, isNull, ne } from 'drizzle-orm'
import { healthOf } from './finance'
import { Hono } from 'hono'
import { z } from 'zod'
import { writeAudit } from '../lib/audit'
import { teamOnly } from '../middleware/roles'
import type { AppEnv } from '../types'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const MAX_LOGO_BYTES = 2 * 1024 * 1024 // โลโก้ลูกค้า ≤ 2MB

/** vendor ห้ามเห็นการเงินโปรเจกต์ (SPEC §2/§4.8) — ตัดที่ server เสมอ */
function serialize<
  T extends {
    quotedSatang?: number | null
    paidPct?: number | null
    health?: string | null
    usagePct?: number | null
  },
>(p: T, role: string) {
  if (role === 'vendor') {
    const rest: Partial<T> = { ...p }
    delete rest.quotedSatang
    delete rest.paidPct
    delete rest.health
    delete rest.usagePct
    return rest
  }
  return p
}

/** ฝังชื่อ/สี/kind ของสถานะลง row (resolve จาก config) — FE ใช้ render chip + filter โดยไม่ต้องโหลด config ซ้ำ */
function statusFields(statuses: ReturnType<typeof resolveStatuses>, id: string) {
  const s = statusById(statuses, id)
  return { statusName: s?.name ?? id, statusColor: s?.color ?? 'slate', statusKind: s?.kind ?? 'active' }
}

export const projectRoutes = new Hono<AppEnv>()

  // ลิสต์ทั้งหมด (รวม archived — lightbox ใช้ค้น) · vendor ถูกตัดข้อมูลเงิน
  // งานต่อเนื่อง: แนบ todo เปิดอยู่ที่ใกล้กำหนดสุด (ตาราง "เรียงตาม todo ที่ต้องส่งก่อน")
  .get('/', async (c) => {
    const db = createDb(c.env.DB)
    const statuses = resolveStatuses((await db.select({ projectStatuses: companyConfig.projectStatuses }).from(companyConfig).limit(1))[0]?.projectStatuses)
    const rows = await db
      .select({ project: projects, clientName: clients.name })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .orderBy(asc(projects.name))
    const openTasks = await db
      .select({
        projectId: tasks.projectId,
        title: tasks.title,
        dueDate: tasks.dueDate,
        assigneeName: users.name,
      })
      .from(tasks)
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .where(ne(tasks.status, 'done'))
    const firstOpen = new Map<string, (typeof openTasks)[number]>()
    for (const t of openTasks) {
      const cur = firstOpen.get(t.projectId)
      if (!cur || (t.dueDate ?? '9999') < (cur.dueDate ?? '9999')) firstOpen.set(t.projectId, t)
    }
    // %ลูกค้าจ่าย + จุดสี health ต่อโปรเจกต์ (→ card · vendor ถูกตัดที่ serialize)
    const allPayments = await db
      .select({ projectId: payments.projectId, amountSatang: payments.amountSatang, paidAt: payments.paidAt })
      .from(payments)
    const paidPctOf = (projectId: string): number | null => {
      const mine = allPayments.filter((p) => p.projectId === projectId)
      const total = mine.reduce((s, p) => s + p.amountSatang, 0)
      if (total === 0) return null
      return Math.round((mine.filter((p) => p.paidAt).reduce((s, p) => s + p.amountSatang, 0) / total) * 100)
    }
    const allEntries = await db
      .select({ projectId: timeEntries.projectId, minutes: timeEntries.minutes, rateSnapshotSatang: timeEntries.rateSnapshotSatang })
      .from(timeEntries)
      .where(isNull(timeEntries.deletedAt))
    const allMilestones = await db
      .select({ projectId: milestones.projectId, budgetSatang: milestones.budgetSatang, status: milestones.status })
      .from(milestones)
    const role = c.get('user').role
    return c.json(
      rows.map((r) => {
        const cost = costSatang(allEntries.filter((e) => e.projectId === r.project.id))
        const h = healthOf(
          cost,
          r.project.quotedSatang,
          allMilestones.filter((m) => m.projectId === r.project.id),
        )
        return serialize(
          {
            ...r.project,
            ...statusFields(statuses, r.project.status),
            clientName: r.clientName,
            openTodo: firstOpen.get(r.project.id) ?? null,
            paidPct: paidPctOf(r.project.id),
            health: h.health,
            usagePct: h.usagePct,
          },
          role,
        )
      }),
    )
  })

  .get('/:id', async (c) => {
    const db = createDb(c.env.DB)
    const row = (
      await db
        .select({ project: projects, clientName: clients.name })
        .from(projects)
        .leftJoin(clients, eq(projects.clientId, clients.id))
        .where(eq(projects.id, c.req.param('id')))
        .limit(1)
    )[0]
    if (!row) return c.json({ error: 'not_found' }, 404)
    const statuses = resolveStatuses((await db.select({ projectStatuses: companyConfig.projectStatuses }).from(companyConfig).limit(1))[0]?.projectStatuses)
    return c.json(serialize({ ...row.project, ...statusFields(statuses, row.project.status), clientName: row.clientName }, c.get('user').role))
  })

  // สร้างโปรเจกต์ (owner+member) — ลูกค้าใหม่พิมพ์ชื่อ = สร้าง client ให้เลย
  .post('/', teamOnly, async (c) => {
    const body = z
      .object({
        name: z.string().min(1),
        type: z.enum(['project', 'recurring']),
        status: z.string().optional(), // ตรวจกับ config ด้านล่าง
        clientId: z.string().optional(),
        clientName: z.string().min(1).optional(), // ใช้เมื่อไม่มี clientId
        quotedSatang: z.number().int().nonnegative().optional(),
        recurringPeriod: z.enum(['monthly', 'yearly']).optional(),
        startDate: isoDate.optional(),
        dueDate: isoDate.optional(),
        code: z.string().max(12).optional(),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? 'invalid' }, 400)
    const d = body.data
    const db = createDb(c.env.DB)

    // สถานะปรับเองได้ (SPEC §4.3) — ไม่ระบุ = active ตัวแรก · ระบุต้องมีจริงใน config
    const cfg = (await db.select({ projectStatuses: companyConfig.projectStatuses }).from(companyConfig).limit(1))[0]
    const statuses = resolveStatuses(cfg?.projectStatuses)
    if (d.status && !statusById(statuses, d.status)) return c.json({ error: 'invalid_status' }, 400)
    // คงค่าเริ่มเดิม (project→dev · recurring→ma) ถ้า slug นั้นยังอยู่ · ถูกลบ → active ตัวแรก
    const preferred = d.type === 'recurring' ? 'ma' : 'dev'
    const status = d.status ?? (statusById(statuses, preferred) ? preferred : defaultStatusId(statuses))

    let clientId = d.clientId ?? null
    if (!clientId && d.clientName) {
      const existing = (
        await db.select().from(clients).where(eq(clients.name, d.clientName)).limit(1)
      )[0]
      clientId =
        existing?.id ??
        (await db.insert(clients).values({ name: d.clientName }).returning())[0]?.id ??
        null
    }

    const inserted = await db
      .insert(projects)
      .values({
        name: d.name,
        code: d.code,
        type: d.type,
        status,
        clientId,
        quotedSatang: d.type === 'project' ? (d.quotedSatang ?? null) : null,
        billingType: d.type === 'recurring' ? 'recurring' : 'fixed',
        recurringPeriod: d.type === 'recurring' ? (d.recurringPeriod ?? 'monthly') : null,
        startDate: d.startDate,
        dueDate: d.dueDate,
      })
      .returning()
    const p = inserted[0]
    if (!p) return c.json({ error: 'insert_failed' }, 500)
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'project.create',
      entity: 'project',
      entityId: p.id,
      meta: { name: p.name, quotedSatang: p.quotedSatang },
    })
    return c.json(p, 201)
  })

  // แก้โปรเจกต์ (owner+member) — เปลี่ยนงบ = ข้อมูลเงิน → audit before/after
  .patch('/:id', teamOnly, async (c) => {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        // ไอคอน: emoji | lucide:<name> | '' หรือ null = เคลียร์ — upload: ตั้งผ่าน POST /:id/logo เท่านั้น
        logo: z.string().refine(isPatchableLogo, 'invalid_logo').nullable().optional(),
        code: z.string().max(12).nullable().optional(),
        status: z.string().optional(), // ตรวจกับ config ด้านล่าง
        clientId: z.string().nullable().optional(),
        quotedSatang: z.number().int().nonnegative().nullable().optional(),
        recurringPeriod: z.enum(['monthly', 'yearly']).nullable().optional(),
        startDate: isoDate.nullable().optional(),
        dueDate: isoDate.nullable().optional(),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    if (body.data.status) {
      const cfg = (await db.select({ projectStatuses: companyConfig.projectStatuses }).from(companyConfig).limit(1))[0]
      if (!statusById(resolveStatuses(cfg?.projectStatuses), body.data.status))
        return c.json({ error: 'invalid_status' }, 400)
    }
    const before = (
      await db.select().from(projects).where(eq(projects.id, c.req.param('id'))).limit(1)
    )[0]
    if (!before) return c.json({ error: 'not_found' }, 404)
    const updated = await db
      .update(projects)
      .set(body.data)
      .where(eq(projects.id, before.id))
      .returning()
    // เปลี่ยน/เคลียร์ไอคอนทั้งที่ของเดิมเป็นโลโก้อัปโหลด → ลบไฟล์ R2 เก่าทิ้ง (กันขยะ)
    const prev = parseProjectLogo(before.logo)
    if (body.data.logo !== undefined && prev.kind === 'upload') {
      await c.env.FILES.delete(prev.key).catch(() => {})
    }
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'project.update',
      entity: 'project',
      entityId: before.id,
      meta: {
        before: { status: before.status, quotedSatang: before.quotedSatang },
        after: body.data,
      },
    })
    return c.json(serialize(updated[0] as Project, c.get('user').role))
  })

  // อัปโหลดโลโก้ลูกค้า → R2 (owner+member · ไม่รับ SVG กัน XSS เหมือนเอกสาร §4.16)
  // ตั้ง logo = upload:<r2key> · ลบไฟล์เก่าถ้าเคยอัปโหลดไว้
  .post('/:id/logo', teamOnly, async (c) => {
    const db = createDb(c.env.DB)
    const before = (
      await db.select().from(projects).where(eq(projects.id, c.req.param('id'))).limit(1)
    )[0]
    if (!before) return c.json({ error: 'not_found' }, 404)
    const form = await c.req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return c.json({ error: 'file_required' }, 400)
    if (!/^image\/(png|jpeg|gif|webp|avif)$/.test(file.type))
      return c.json({ error: 'invalid_type', message: 'รับเฉพาะรูป png/jpeg/gif/webp/avif (ไม่รับ SVG)' }, 415)
    if (file.size === 0 || file.size > MAX_LOGO_BYTES) return c.json({ error: 'file_too_large' }, 413)
    const r2Key = `project-logos/${before.id}/${crypto.randomUUID()}`
    await c.env.FILES.put(r2Key, file.stream(), { httpMetadata: { contentType: file.type } })
    const updated = await db
      .update(projects)
      .set({ logo: uploadLogo(r2Key) })
      .where(eq(projects.id, before.id))
      .returning()
    const prev = parseProjectLogo(before.logo)
    if (prev.kind === 'upload') await c.env.FILES.delete(prev.key).catch(() => {})
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'project.update',
      entity: 'project',
      entityId: before.id,
      meta: { logo: 'upload', mime: file.type, sizeBytes: file.size },
    })
    return c.json(serialize(updated[0] as Project, c.get('user').role))
  })

  // serve โลโก้ที่อัปโหลด — ทุก role ที่ล็อกอิน (โลโก้ไม่ใช่ข้อมูลเงิน · vendor เห็นได้)
  .get('/:id/logo', async (c) => {
    const db = createDb(c.env.DB)
    const p = (
      await db
        .select({ logo: projects.logo })
        .from(projects)
        .where(eq(projects.id, c.req.param('id')))
        .limit(1)
    )[0]
    if (!p) return c.json({ error: 'not_found' }, 404)
    const parsed = parseProjectLogo(p.logo)
    if (parsed.kind !== 'upload') return c.json({ error: 'no_logo' }, 404)
    const obj = await c.env.FILES.get(parsed.key)
    if (!obj) return c.json({ error: 'object_missing' }, 404)
    return new Response(obj.body, {
      headers: {
        'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
        'cache-control': 'private, max-age=3600',
      },
    })
  })

// (picker ลูกค้าย้ายไปใช้ GET /api/clients ของ CRM — routes/clients.ts)
