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

/** ลูกค้า (CRM §4.17 — entity จริงตั้งแต่ T08 เลี่ยง refactor) */
export const clients = sqliteTable('clients', {
  id: id(),
  name: text('name').notNull(),
  logo: text('logo'), // emoji
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  note: text('note'),
  status: text('status', { enum: ['active', 'archived'] }).notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const PROJECT_STATUSES = ['design', 'dev', 'staging', 'golive', 'ma', 'archived'] as const

/** โปรเจกต์ 2 ประเภท (SPEC §4.3): project = fixed-price มีกำหนดส่ง · recurring = ดูแลรายเดือน/ปี */
export const projects = sqliteTable(
  'projects',
  {
    id: id(),
    code: text('code'),
    name: text('name').notNull(),
    logo: text('logo'), // emoji
    clientId: text('client_id').references(() => clients.id),
    type: text('type', { enum: ['project', 'recurring'] }).notNull(),
    status: text('status', { enum: PROJECT_STATUSES }).notNull().default('dev'),
    quotedSatang: integer('quoted_satang'), // ราคาขาย (fixed) — vendor ห้ามเห็น (ตัดที่ serializer)
    billingType: text('billing_type', { enum: ['fixed', 'recurring'] }).notNull().default('fixed'),
    recurringPeriod: text('recurring_period', { enum: ['monthly', 'yearly'] }),
    startDate: text('start_date'), // YYYY-MM-DD
    dueDate: text('due_date'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('projects_type_idx').on(t.type, t.status), index('projects_client_idx').on(t.clientId)],
)

/** กลุ่มงานในโปรเจกต์ (SPEC §4.4) — เรียงด้วย sortOrder */
export const taskGroups = sqliteTable(
  'task_groups',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('task_groups_project_idx').on(t.projectId, t.sortOrder)],
)

export const TASK_STATUSES = ['todo', 'doing', 'done'] as const

export const tasks = sqliteTable(
  'tasks',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    groupId: text('group_id')
      .notNull()
      .references(() => taskGroups.id),
    sortOrder: integer('sort_order').notNull().default(0),
    title: text('title').notNull(),
    description: text('description'),
    assigneeId: text('assignee_id').references(() => users.id),
    status: text('status', { enum: TASK_STATUSES }).notNull().default('todo'),
    priority: text('priority', { enum: ['low', 'normal', 'high'] }).notNull().default('normal'),
    estimateMinutes: integer('estimate_minutes'),
    startDate: text('start_date'), // YYYY-MM-DD → ไทม์ไลน์ต่อกลุ่ม
    dueDate: text('due_date'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    index('tasks_project_idx').on(t.projectId),
    index('tasks_group_idx').on(t.groupId, t.sortOrder),
    index('tasks_assignee_idx').on(t.assigneeId, t.status),
  ],
)

/** ติดดาว "ทำวันนี้" ต่อคนต่อวัน (SPEC §4.4) — feed งานวันนี้ + standup */
export const taskStars = sqliteTable(
  'task_stars',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    forDate: text('for_date').notNull(), // YYYY-MM-DD (Asia/Bangkok)
  },
  (t) => [index('task_stars_user_date_idx').on(t.userId, t.forDate)],
)

export const taskComments = sqliteTable(
  'task_comments',
  {
    id: id(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('task_comments_task_idx').on(t.taskId)],
)

/** ไฟล์แนบบน R2 — เก็บเฉพาะ metadata, ตัวไฟล์อยู่ R2 (SPEC §6) */
export const taskAttachments = sqliteTable(
  'task_attachments',
  {
    id: id(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    r2Key: text('r2_key').notNull(),
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    uploadedBy: text('uploaded_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('task_attachments_task_idx').on(t.taskId)],
)

/** งวดงาน → กำไร/ขาดทุนต่องวด (SPEC §4.8) */
export const milestones = sqliteTable(
  'milestones',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    budgetSatang: integer('budget_satang'),
    dueDate: text('due_date'),
    status: text('status', { enum: ['planned', 'active', 'done'] }).notNull().default('planned'),
  },
  (t) => [index('milestones_project_idx').on(t.projectId, t.sortOrder)],
)

/** เงินลูกค้าจ่ายเป็นงวด → % บน card (SPEC §4.8) — owner+member เท่านั้น */
export const payments = sqliteTable(
  'payments',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    installmentNo: integer('installment_no').notNull(),
    label: text('label'),
    amountSatang: integer('amount_satang').notNull(),
    dueDate: text('due_date'),
    paidAt: text('paid_at'), // YYYY-MM-DD ที่รับเงิน (null = ยังไม่จ่าย)
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('payments_project_idx').on(t.projectId, t.installmentNo)],
)

/** เวลา = หัวใจลูปเงิน (SPEC §4.5) — snapshot rate ตอนสร้าง · soft-delete เท่านั้น */
export const timeEntries = sqliteTable(
  'time_entries',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    workDate: text('work_date').notNull(), // YYYY-MM-DD (Asia/Bangkok)
    minutes: integer('minutes').notNull(),
    note: text('note'),
    rateSnapshotSatang: integer('rate_snapshot_satang').notNull(),
    source: text('source', { enum: ['timer', 'manual'] }).notNull(),
    editCount: integer('edit_count').notNull().default(0),
    lastEditedBy: text('last_edited_by'),
    editedAt: integer('edited_at', { mode: 'timestamp_ms' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('time_entries_user_date_idx').on(t.userId, t.workDate),
    index('time_entries_task_idx').on(t.taskId),
    index('time_entries_project_idx').on(t.projectId),
  ],
)

/** timer ที่กำลังเดิน — คนละ 1 ตัว (start ใหม่ = ปิดตัวเก่า) · startedAt = epoch ms ดิบ (คณิตเวลา + ส่งให้ FE เดินนาฬิกา) */
export const timerSessions = sqliteTable('timer_sessions', {
  id: id(),
  userId: text('user_id').notNull().unique(),
  taskId: text('task_id')
    .notNull()
    .references(() => tasks.id),
  startedAt: integer('started_at').notNull(),
})

/** เอกสาร/wiki tree (SPEC §4.16) — sub-page ลึกได้ · เก็บ markdown · soft-delete ทั้ง subtree */
export const docs = sqliteTable(
  'docs',
  {
    id: id(),
    parentId: text('parent_id'), // self-ref (FK บังคับที่ API — เลี่ยง circular type)
    sortOrder: integer('sort_order').notNull().default(0),
    icon: text('icon'), // emoji (ตาม mockup)
    title: text('title').notNull(),
    contentMarkdown: text('content_markdown').notNull().default(''),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (t) => [index('docs_parent_idx').on(t.parentId, t.sortOrder)],
)

export const docImages = sqliteTable(
  'doc_images',
  {
    id: id(),
    docId: text('doc_id'),
    r2Key: text('r2_key').notNull(),
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    uploadedBy: text('uploaded_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('doc_images_doc_idx').on(t.docId)],
)

export const ADJUSTMENT_KINDS = [
  'allowance',
  'depreciation',
  'bonus',
  'other_income',
  'sso',
  'wht',
  'other_deduction',
] as const

/**
 * รายการรายได้/หัก ต่อคนต่องวด (SPEC §4.7) — owner กรอกเหมือนที่ทำมือ
 * งวดอ้างด้วย cycleStart (YYYY-MM-DD วันที่ 25) แทน pay_cycles id — งวดเปิดไม่ต้องมีแถวล่วงหน้า
 * bonus = ความลับ (เจ้าตัว + owner เท่านั้น — บังคับที่ API)
 */
export const payAdjustments = sqliteTable(
  'pay_adjustments',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    cycleStart: text('cycle_start').notNull(),
    kind: text('kind', { enum: ADJUSTMENT_KINDS }).notNull(),
    amountSatang: integer('amount_satang').notNull(), // เก็บบวกเสมอ kind บอกทิศ
    note: text('note'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('pay_adjustments_user_cycle_idx').on(t.userId, t.cycleStart)],
)

/** โน้ต owner → พนักงาน ต่องวด (เตือน/ชม) — เจ้าตัว + owner เท่านั้น (SPEC §4.7) */
export const payNotes = sqliteTable(
  'pay_notes',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    cycleStart: text('cycle_start').notNull(),
    body: text('body').notNull(),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => users.id),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('pay_notes_user_cycle_idx').on(t.userId, t.cycleStart)],
)

/** snapshot ตอนปิดงวด — หลักฐานถาวร ไม่เปลี่ยนย้อนหลัง (SPEC §4.7) */
export const payslips = sqliteTable(
  'payslips',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    cycleStart: text('cycle_start').notNull(),
    cycleEnd: text('cycle_end').notNull(),
    payDate: text('pay_date').notNull(),
    minutesTotal: integer('minutes_total').notNull(),
    baseSatang: integer('base_satang').notNull(),
    incomeSatang: integer('income_satang').notNull(),
    deductionSatang: integer('deduction_satang').notNull(),
    netSatang: integer('net_satang').notNull(),
    linesJson: text('lines_json', { mode: 'json' }).$type<Record<string, unknown>>(),
    ownerNote: text('owner_note'),
    closedAt: integer('closed_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('payslips_user_cycle_idx').on(t.userId, t.cycleStart)],
)

/** ทะเบียนงวดที่ปิดแล้ว — กันแก้เวลา/adjustment ย้อนหลังในงวดปิด */
export const payCycleClosures = sqliteTable('pay_cycle_closures', {
  cycleStart: text('cycle_start').primaryKey(),
  cycleEnd: text('cycle_end').notNull(),
  closedBy: text('closed_by')
    .notNull()
    .references(() => users.id),
  closedAt: integer('closed_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
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
export type Client = typeof clients.$inferSelect
export type Project = typeof projects.$inferSelect
export type TaskGroup = typeof taskGroups.$inferSelect
export type Task = typeof tasks.$inferSelect
export type TaskComment = typeof taskComments.$inferSelect
export type TaskAttachment = typeof taskAttachments.$inferSelect
export type TaskStar = typeof taskStars.$inferSelect
export type TimeEntry = typeof timeEntries.$inferSelect
export type TimerSession = typeof timerSessions.$inferSelect
export type Milestone = typeof milestones.$inferSelect
export type Payment = typeof payments.$inferSelect
export type PayAdjustment = typeof payAdjustments.$inferSelect
export type PayNote = typeof payNotes.$inferSelect
export type Payslip = typeof payslips.$inferSelect
export type Doc = typeof docs.$inferSelect
export type DocImage = typeof docImages.$inferSelect
