import { bkkDateOf } from '@seedoffice/core'

/**
 * Backup D1 → R2 (SPEC §13 / T18): รายวัน เก็บ 30 ชุดล่าสุด
 * ลำดับตาราง parent→child (FK) — restore insert ตามนี้ / ลบย้อนกลับ
 */
const TABLES = [
  'company_config',
  'users',
  'clients',
  'projects',
  'milestones',
  'payments',
  'task_groups',
  'tasks',
  'task_stars',
  'task_comments',
  'task_attachments',
  'time_entries',
  'timer_sessions',
  'rates',
  'pay_adjustments',
  'pay_notes',
  'payslips',
  'pay_cycle_closures',
  'audit_logs',
  'sessions',
] as const

const PREFIX = 'backups/'
const KEEP = 30

export async function runBackup(env: Env): Promise<string> {
  const tables: Record<string, Record<string, unknown>[]> = {}
  for (const t of TABLES) {
    const res = await env.DB.prepare(`SELECT * FROM ${t}`).all()
    tables[t] = (res.results ?? []) as Record<string, unknown>[]
  }
  const key = `${PREFIX}${bkkDateOf(Date.now())}.json`
  await env.FILES.put(key, JSON.stringify({ version: 1, at: Date.now(), tables }), {
    httpMetadata: { contentType: 'application/json' },
  })

  // retention: เก็บ KEEP ชุดล่าสุด (key เรียงตามวันที่อยู่แล้ว)
  const listing = await env.FILES.list({ prefix: PREFIX })
  const keys = listing.objects.map((o) => o.key).sort()
  for (const old of keys.slice(0, Math.max(0, keys.length - KEEP))) await env.FILES.delete(old)

  console.log(JSON.stringify({ event: 'backup_done', key, tables: TABLES.length }))
  return key
}

/** กู้คืนจาก backup (ใช้ตอนกู้ภัย/ทดสอบ): ล้างตารางแล้ว insert กลับตามลำดับ FK */
export async function restoreBackup(env: Env, key: string): Promise<void> {
  const obj = await env.FILES.get(key)
  if (!obj) throw new Error(`ไม่พบ backup: ${key}`)
  const data = (await obj.json()) as { tables: Record<string, Record<string, unknown>[]> }

  for (const t of [...TABLES].reverse()) await env.DB.prepare(`DELETE FROM ${t}`).run()
  for (const t of TABLES) {
    const rows = data.tables[t] ?? []
    for (const row of rows) {
      const cols = Object.keys(row)
      if (cols.length === 0) continue
      const placeholders = cols.map(() => '?').join(',')
      await env.DB.prepare(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${placeholders})`)
        .bind(...cols.map((cName) => row[cName] ?? null))
        .run()
    }
  }
}
