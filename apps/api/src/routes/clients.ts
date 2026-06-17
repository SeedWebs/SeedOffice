import { bkkDateOf, clientMoney, isArchivedStatus, mrrSatang, nextExpiry, arrSatang, resolveStatuses, statusById } from '@seedoffice/core'
import {
  clientNotes,
  clients,
  companyConfig,
  createDb,
  payments,
  projects,
  recurringServices,
  SERVICE_CATEGORIES,
  users,
} from '@seedoffice/db'
import { asc, desc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { writeAudit } from '../lib/audit'
import type { AppEnv } from '../types'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** ลูกค้า/CRM (SPEC §4.17) — mount ด้วย requireAuth + teamOnly (vendor 403 ทั้งชุด) */
export const clientRoutes = new Hono<AppEnv>()

  // list + aggregates ต่อราย (เสนอราคา/จ่าย/ค้าง/MRR/ต่ออายุถัดไป) + ยอดรวมการ์ดสรุป
  .get('/', async (c) => {
    const db = createDb(c.env.DB)
    const today = bkkDateOf(Date.now())
    const allClients = await db
      .select()
      .from(clients)
      .where(eq(clients.status, 'active'))
      .orderBy(asc(clients.name))
    const allProjects = await db.select().from(projects)
    const allPayments = await db.select().from(payments)
    const allServices = await db.select().from(recurringServices)
    const allNotes = await db.select({ clientId: clientNotes.clientId }).from(clientNotes)
    const statuses = resolveStatuses((await db.select({ projectStatuses: companyConfig.projectStatuses }).from(companyConfig).limit(1))[0]?.projectStatuses)

    const rows = allClients.map((cl) => {
      const myProjects = allProjects.filter((p) => p.clientId === cl.id && !isArchivedStatus(statuses, p.status))
      const myProjectIds = new Set(myProjects.map((p) => p.id))
      const myPayments = allPayments.filter((p) => myProjectIds.has(p.projectId))
      const myServices = allServices.filter((s) => s.clientId === cl.id)
      const money = clientMoney({ projects: myProjects, payments: myPayments }, today)
      return {
        id: cl.id,
        name: cl.name,
        logo: cl.logo,
        contactEmail: cl.contactEmail,
        projectCount: myProjects.length,
        ...money,
        mrrSatang: mrrSatang(myServices),
        nextExpiry: nextExpiry(myServices, today),
        hasNotes: allNotes.some((n) => n.clientId === cl.id),
        // ยอดขายปีนี้ = โปรเจกต์ที่เริ่ม (startDate) ในปีปัจจุบัน
        quotedThisYearSatang: myProjects
          .filter((p) => (p.startDate ?? '').startsWith(today.slice(0, 4)))
          .reduce((s, p) => s + (p.quotedSatang ?? 0), 0),
      }
    })

    const activeServices = allServices.filter((s) => s.status === 'active')
    return c.json({
      today,
      rows,
      summary: {
        salesThisYearSatang: rows.reduce((s, r) => s + r.quotedThisYearSatang, 0),
        paidThisYearSatang: rows
          .filter((r) => r.quotedThisYearSatang > 0)
          .reduce((s, r) => s + r.paidSatang, 0),
        mrrSatang: mrrSatang(activeServices),
        arrSatang: arrSatang(activeServices),
        overdueSatang: rows.reduce((s, r) => s + r.overdueSatang, 0),
        overdueClients: rows.filter((r) => r.overdueSatang > 0).length,
        expiringCount: activeServices.filter(
          (s) => s.nextDueDate && nextExpiry([s], today)!.daysUntil <= 30,
        ).length,
      },
    })
  })

  .post('/', async (c) => {
    const body = z
      .object({
        name: z.string().min(1),
        logo: z.string().max(8).optional(),
        contactName: z.string().optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().optional(),
        note: z.string().optional(),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const inserted = await db.insert(clients).values(body.data).returning()
    return c.json(inserted[0], 201)
  })

  // detail: ติดต่อ + เงิน + โปรเจกต์ + payments + recurring + notes
  .get('/:id', async (c) => {
    const db = createDb(c.env.DB)
    const today = bkkDateOf(Date.now())
    const client = (
      await db.select().from(clients).where(eq(clients.id, c.req.param('id'))).limit(1)
    )[0]
    if (!client) return c.json({ error: 'not_found' }, 404)

    const myProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.clientId, client.id))
      .orderBy(asc(projects.name))
    const projectIds = myProjects.map((p) => p.id)
    const myPayments =
      projectIds.length > 0
        ? await db
            .select({ payment: payments, projectName: projects.name })
            .from(payments)
            .innerJoin(projects, eq(payments.projectId, projects.id))
            .where(inArray(payments.projectId, projectIds))
            .orderBy(asc(payments.dueDate))
        : []
    const services = await db
      .select()
      .from(recurringServices)
      .where(eq(recurringServices.clientId, client.id))
      .orderBy(asc(recurringServices.nextDueDate))
    const notes = await db
      .select({ note: clientNotes, byName: users.name })
      .from(clientNotes)
      .innerJoin(users, eq(clientNotes.createdBy, users.id))
      .where(eq(clientNotes.clientId, client.id))
      .orderBy(desc(clientNotes.createdAt))

    const statuses = resolveStatuses((await db.select({ projectStatuses: companyConfig.projectStatuses }).from(companyConfig).limit(1))[0]?.projectStatuses)
    const activeProjects = myProjects.filter((p) => !isArchivedStatus(statuses, p.status))
    return c.json({
      ...client,
      today,
      money: clientMoney(
        {
          projects: activeProjects,
          payments: myPayments.map((p) => p.payment),
        },
        today,
      ),
      mrrSatang: mrrSatang(services),
      arrSatang: arrSatang(services),
      projects: myProjects.map((p) => {
        const s = statusById(statuses, p.status)
        return {
          id: p.id,
          name: p.name,
          logo: p.logo,
          status: p.status,
          statusName: s?.name ?? p.status,
          statusColor: s?.color ?? 'slate',
          statusKind: s?.kind ?? 'active',
          type: p.type,
          quotedSatang: p.quotedSatang,
        }
      }),
      payments: myPayments.map((p) => ({ ...p.payment, projectName: p.projectName })),
      services,
      notes: notes.map((n) => ({ ...n.note, byName: n.byName })),
    })
  })

  .patch('/:id', async (c) => {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        logo: z.string().max(8).nullable().optional(),
        contactName: z.string().nullable().optional(),
        contactEmail: z.string().email().nullable().optional(),
        contactPhone: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
        status: z.enum(['active', 'archived']).optional(),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const updated = await db
      .update(clients)
      .set(body.data)
      .where(eq(clients.id, c.req.param('id')))
      .returning()
    if (!updated[0]) return c.json({ error: 'not_found' }, 404)
    return c.json(updated[0])
  })

  // บริการต่อเนื่อง (เงินต่อเนื่อง → audit)
  .post('/:id/services', async (c) => {
    const body = z
      .object({
        label: z.string().min(1),
        category: z.enum(SERVICE_CATEGORIES).optional(),
        period: z.enum(['monthly', 'yearly']),
        amountSatang: z.number().int().positive(),
        nextDueDate: isoDate.optional(),
        projectId: z.string().optional(),
        note: z.string().optional(),
      })
      .safeParse(await c.req.json())
    if (!body.success) return c.json({ error: 'invalid' }, 400)
    const db = createDb(c.env.DB)
    const client = (
      await db.select().from(clients).where(eq(clients.id, c.req.param('id'))).limit(1)
    )[0]
    if (!client) return c.json({ error: 'not_found' }, 404)
    const inserted = await db
      .insert(recurringServices)
      .values({ clientId: client.id, ...body.data })
      .returning()
    await writeAudit(c.env, {
      actorId: c.get('user').id,
      action: 'recurring_service.create',
      entity: 'recurring_service',
      entityId: inserted[0]?.id ?? '',
      meta: { clientId: client.id, label: body.data.label, amountSatang: body.data.amountSatang, period: body.data.period },
    })
    return c.json(inserted[0], 201)
  })
