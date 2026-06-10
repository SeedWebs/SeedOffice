import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

/**
 * Conventions (SPEC §5/§9)
 * - เงิน = integer สตางค์ · เวลา = integer นาที — ห้าม REAL
 * - instant (สร้างเมื่อ/หมดอายุ) = integer epoch **ms** (UTC)
 * - calendar date ในบริบทไทย (effectiveFrom, workDate, dueDate) = text 'YYYY-MM-DD' (Asia/Bangkok)
 * - id = text (crypto.randomUUID) · ชื่อคอลัมน์ snake_case / ฝั่ง TS camelCase
 */

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

export const users = sqliteTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  googleSub: text('google_sub').unique(),
  role: text('role', { enum: ['owner', 'member', 'vendor'] }).notNull(),
  status: text('status', { enum: ['active', 'disabled'] }).notNull().default('active'),
  avatarUrl: text('avatar_url'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const sessions = sqliteTable(
  'sessions',
  {
    id: id(), // = session token (random 256-bit hex — ไม่ใช่ uuid เดาง่าย, สร้างใน api)
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

/** rate แบบ effective-dated — เปลี่ยน rate = insert แถวใหม่ ไม่แก้ของเก่า (SPEC §4.2) */
export const rates = sqliteTable(
  'rates',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    rateSatangPerHour: integer('rate_satang_per_hour').notNull(),
    effectiveFrom: text('effective_from').notNull(), // YYYY-MM-DD (Asia/Bangkok)
    note: text('note'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('rates_user_idx').on(t.userId, t.effectiveFrom)],
)

/** config ระดับบริษัท — แถวเดียว (id=1) · SPEC §5: ไม่ hardcode */
export const companyConfig = sqliteTable('company_config', {
  id: integer('id').primaryKey().default(1),
  cutoffDay: integer('cutoff_day').notNull().default(25), // งวด 25→24 จ่าย 26
  workHourCapMinutes: integer('work_hour_cap_minutes').notNull().default(480), // 8 ชม./วัน
})

/** log การเปลี่ยนข้อมูลการเงิน/เวลา (SPEC §11: ทุก manual/แก้/ลบ + การเงิน) — meta เก็บ before→after */
export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: id(),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(), // เช่น 'rate.create' · 'time_entry.update' · 'pay_cycle.close'
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    meta: text('meta', { mode: 'json' }).$type<Record<string, unknown>>(),
    at: integer('at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('audit_entity_idx').on(t.entity, t.entityId),
    index('audit_actor_idx').on(t.actorId),
  ],
)

export type User = typeof users.$inferSelect
export type Session = typeof sessions.$inferSelect
export type Rate = typeof rates.$inferSelect
export type CompanyConfig = typeof companyConfig.$inferSelect
export type AuditLog = typeof auditLogs.$inferSelect
