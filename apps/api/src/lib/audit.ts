import { auditLogs, createDb } from '@seedoffice/db'

export interface AuditInput {
  actorId: string
  action: string // '<entity>.<verb>' เช่น 'rate.create', 'time_entry.delete'
  entity: string
  entityId: string
  meta?: Record<string, unknown> // ใส่ before/after เมื่อเป็นการแก้/ลบ
}

/** เขียน audit log — การเงิน/เวลาทุกการเปลี่ยนต้องเรียกตัวนี้ (SPEC §11) */
export async function writeAudit(env: Env, input: AuditInput): Promise<void> {
  await createDb(env.DB).insert(auditLogs).values(input)
}
