import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

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
  // โดเมน auto-provision member (SPEC §4.1) — '' = ปิด · default ตอน migrate กัน production เดิมพัง
  memberDomain: text('member_domain').notNull().default('@seedwebs.com'),
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

export const SERVICE_CATEGORIES = ['hosting', 'domain', 'ma', 'server', 'ssl', 'other'] as const

/** บริการต่อเนื่อง (SPEC §4.17) → MRR/ARR + ใกล้หมดอายุ */
export const recurringServices = sqliteTable(
  'recurring_services',
  {
    id: id(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    projectId: text('project_id').references(() => projects.id),
    label: text('label').notNull(),
    category: text('category', { enum: SERVICE_CATEGORIES }).notNull().default('other'),
    period: text('period', { enum: ['monthly', 'yearly'] }).notNull(),
    amountSatang: integer('amount_satang').notNull(),
    nextDueDate: text('next_due_date'), // YYYY-MM-DD วันต่ออายุถัดไป
    status: text('status', { enum: ['active', 'cancelled'] }).notNull().default('active'),
    note: text('note'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('recurring_client_idx').on(t.clientId, t.status)],
)

/** โน้ต/ข้อควรจำต่อลูกค้า (วันวางบิล/ที่อยู่ส่งเอกสาร ฯลฯ) */
export const clientNotes = sqliteTable(
  'client_notes',
  {
    id: id(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    body: text('body').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('client_notes_client_idx').on(t.clientId)],
)

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

export const EXPENSE_CATEGORIES = ['hosting', 'travel', 'equipment', 'software', 'other'] as const
export const EXPENSE_STATUSES = ['pending', 'approved', 'rejected', 'reimbursed'] as const

/** เงินสดย่อย (SPEC §4.9) — pending → approved/rejected → reimbursed (owner อนุมัติ) */
export const expenses = sqliteTable(
  'expenses',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    expenseDate: text('expense_date').notNull(), // YYYY-MM-DD
    amountSatang: integer('amount_satang').notNull(),
    category: text('category', { enum: EXPENSE_CATEGORIES }).notNull().default('other'),
    description: text('description').notNull(),
    receiptKey: text('receipt_key'), // R2
    paidBy: text('paid_by', { enum: ['company', 'self'] }).notNull().default('self'),
    projectId: text('project_id').references(() => projects.id),
    status: text('status', { enum: EXPENSE_STATUSES }).notNull().default('pending'),
    approvedBy: text('approved_by'),
    approvedAt: integer('approved_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('expenses_user_idx').on(t.userId, t.status), index('expenses_date_idx').on(t.expenseDate)],
)

export const CALENDAR_EVENT_TYPES = ['holiday', 'leave', 'meeting', 'deadline', 'other'] as const

/** ปฏิทินทีม (SPEC §4.14) — เก็บเฉพาะ event ที่สร้างเอง · ตัดรอบ/จ่ายเงินเดือน = virtual จาก config */
export const calendarEvents = sqliteTable(
  'calendar_events',
  {
    id: id(),
    title: text('title').notNull(),
    startDate: text('start_date').notNull(), // YYYY-MM-DD (all-day ระบุเวลาในชื่อได้ตามสไตล์ mockup)
    endDate: text('end_date'), // ช่วงหลายวัน (รวมวันสุดท้าย)
    type: text('type', { enum: CALENDAR_EVENT_TYPES }).notNull().default('other'),
    userId: text('user_id').references(() => users.id), // วันลาของใคร → team activity
    projectId: text('project_id').references(() => projects.id),
    source: text('source', { enum: ['local', 'gcal'] }).notNull().default('local'), // gcal = P3
    gcalId: text('gcal_id'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('calendar_events_date_idx').on(t.startDate)],
)

/**
 * [P3 §4.12] thread ในอีเมลกลาง — folder (unassigned/mine/assigned/closed/spam) derive จาก assignee+status
 * unread = true เมื่อมีเมลเข้าใหม่ (sync) · เปิดอ่านในระบบ → false · เมลเข้าบน thread closed → เปิดใหม่
 */
export const inboxThreads = sqliteTable(
  'inbox_threads',
  {
    id: id(),
    mailboxId: text('mailbox_id')
      .notNull()
      .references(() => inboxMailboxes.id),
    gmailThreadId: text('gmail_thread_id').notNull(),
    subject: text('subject').notNull().default(''),
    contactEmail: text('contact_email'), // คู่สนทนา (อีเมลเปล่า lowercase) — ผูกการ์ดลูกค้า/ประวัติ
    status: text('status', { enum: ['open', 'snoozed', 'closed', 'spam'] })
      .notNull()
      .default('open'),
    unread: integer('unread', { mode: 'boolean' }).notNull().default(false),
    assigneeId: text('assignee_id').references(() => users.id),
    tags: text('tags', { mode: 'json' }).$type<string[]>(),
    lastMessageAt: integer('last_message_at', { mode: 'timestamp_ms' }).notNull(),
    snoozeUntil: integer('snooze_until', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('inbox_threads_mailbox_gmail_idx').on(t.mailboxId, t.gmailThreadId),
    index('inbox_threads_mailbox_last_idx').on(t.mailboxId, t.lastMessageAt),
    index('inbox_threads_folder_idx').on(t.status, t.assigneeId),
  ],
)

/** [P3 §4.12] ข้อความในอีเมลกลาง — metadata ใน D1, body เต็มอยู่ R2 เสมอ (กัน D1 บวม — §13) */
export const inboxMessages = sqliteTable(
  'inbox_messages',
  {
    id: id(),
    threadId: text('thread_id')
      .notNull()
      .references(() => inboxThreads.id),
    gmailMessageId: text('gmail_message_id').notNull(),
    direction: text('direction', { enum: ['in', 'out'] }).notNull(),
    fromAddr: text('from_addr').notNull().default(''), // header เต็ม "ชื่อ <email>" ไว้แสดงผล
    toAddr: text('to_addr').notNull().default(''),
    ccAddr: text('cc_addr'),
    snippet: text('snippet').notNull().default(''),
    bodyKey: text('body_key'), // R2 key (contentType อยู่ใน R2 metadata) — null = เมลไม่มี body
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }).notNull(), // = internalDate ของ Gmail
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('inbox_messages_thread_gmail_idx').on(t.threadId, t.gmailMessageId),
    index('inbox_messages_thread_sent_idx').on(t.threadId, t.sentAt),
  ],
)

/** [P3 §4.12] ไฟล์แนบ — เก็บ metadata ตอน sync · ตัวไฟล์โหลด lazy ครั้งแรกที่เปิดแล้ว cache ลง R2 */
export const inboxAttachments = sqliteTable(
  'inbox_attachments',
  {
    id: id(),
    messageId: text('message_id')
      .notNull()
      .references(() => inboxMessages.id),
    gmailAttachmentId: text('gmail_attachment_id').notNull(),
    r2Key: text('r2_key'), // null = ยังไม่เคยโหลด
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('inbox_attachments_message_idx').on(t.messageId)],
)

/** [P3 §4.12] สถานะ sync ราย mailbox — lastHistoryId เป็น text (uint64) · lastError โชว์ใน ตั้งค่า */
export const gmailSyncState = sqliteTable(
  'gmail_sync_state',
  {
    id: id(),
    mailboxId: text('mailbox_id')
      .notNull()
      .references(() => inboxMailboxes.id),
    lastHistoryId: text('last_history_id'),
    lastSyncAt: integer('last_sync_at', { mode: 'timestamp_ms' }),
    lastError: text('last_error'),
  },
  (t) => [uniqueIndex('gmail_sync_state_mailbox_idx').on(t.mailboxId)],
)

/**
 * [P3 §4.12] OAuth client (Internal) ของอีเมลกลาง — ต่อบริษัท/Workspace
 * เพิ่มผ่านหน้า ตั้งค่า เท่านั้น (repo public — ห้าม hardcode/seed) · secret เข้ารหัส AES-GCM ก่อนเก็บ
 */
export const inboxGoogleClients = sqliteTable('inbox_google_clients', {
  id: id(),
  label: text('label').notNull(), // ชื่อเรียก เช่นชื่อบริษัท — ใช้เลือกตอนเพิ่มกล่อง
  clientId: text('client_id').notNull(),
  clientSecretEnc: text('client_secret_enc').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }), // soft-delete (SPEC §9)
})

/**
 * [P3 §4.12] กล่องเมลที่เชื่อม — สร้างผ่าน ตั้งค่า แล้วกด "เชื่อม Gmail"
 * emailAddress/gmailAccountId มาจากบัญชีที่ consent จริง (ไม่ให้พิมพ์เอง) · refresh token เข้ารหัส
 */
export const inboxMailboxes = sqliteTable(
  'inbox_mailboxes',
  {
    id: id(),
    clientId: text('client_id')
      .notNull()
      .references(() => inboxGoogleClients.id),
    companyLabel: text('company_label').notNull(), // text อิสระ ไม่ใช่ enum — จัดกลุ่ม dropdown กล่อง
    name: text('name').notNull(), // ชื่อกล่องที่ทีมเห็น
    emailAddress: text('email_address'),
    gmailAccountId: text('gmail_account_id'),
    refreshTokenEnc: text('refresh_token_enc'),
    status: text('status', { enum: ['connected', 'disconnected', 'disabled'] })
      .notNull()
      .default('disconnected'),
    connectedAt: integer('connected_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('inbox_mailboxes_status_idx').on(t.status)],
)

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
export type RecurringService = typeof recurringServices.$inferSelect
export type ClientNote = typeof clientNotes.$inferSelect
export type Expense = typeof expenses.$inferSelect
export type CalendarEvent = typeof calendarEvents.$inferSelect
export type InboxGoogleClient = typeof inboxGoogleClients.$inferSelect
export type InboxMailbox = typeof inboxMailboxes.$inferSelect
export type InboxThread = typeof inboxThreads.$inferSelect
export type InboxMessage = typeof inboxMessages.$inferSelect
export type InboxAttachment = typeof inboxAttachments.$inferSelect
export type GmailSyncState = typeof gmailSyncState.$inferSelect
