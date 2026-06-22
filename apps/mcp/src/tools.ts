import { z } from 'zod'

/** เรียก REST ของ SeedOffice (apps/api) แทน user — method + path (+ body) → Response ดิบ */
export type CallApi = (method: string, path: string, body?: unknown) => Promise<Response>

// ตรงกับ CallToolResult ของ MCP SDK (มี index signature [x:string]: unknown)
export type McpResult = {
  content: { type: 'text'; text: string }[]
  isError?: boolean
  [k: string]: unknown
}

/** อ่าน PAT จาก header `Authorization: Bearer sko_…` (null = ไม่มี/ผิดรูป) */
export function bearerOf(request: Request): string | null {
  const authz = request.headers.get('Authorization')
  if (!authz?.startsWith('Bearer ')) return null
  return authz.slice(7).trim() || null
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ต้องเป็น YYYY-MM-DD')
const enc = (s: unknown) => encodeURIComponent(String(s))

function fieldStr(data: unknown, key: string): string {
  if (data && typeof data === 'object' && key in data) {
    const v = (data as Record<string, unknown>)[key]
    return v == null ? '' : String(v)
  }
  return ''
}

/** Response จาก REST → ผล MCP · ไม่ 2xx = isError + ข้อความไทยจาก message/error ของ REST */
async function relay(res: Response, okText?: (data: unknown) => string): Promise<McpResult> {
  const raw = await res.text()
  let data: unknown = raw
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    /* คง raw text ไว้ */
  }
  if (!res.ok) {
    const msg = fieldStr(data, 'message') || fieldStr(data, 'error') || raw || res.statusText
    return { content: [{ type: 'text', text: `เรียก API ไม่สำเร็จ (${res.status}): ${msg}` }], isError: true }
  }
  return { content: [{ type: 'text', text: okText ? okText(data) : JSON.stringify(data, null, 2) }] }
}

export interface ToolDef {
  name: string
  description: string
  inputSchema: z.ZodRawShape
  handler: (callApi: CallApi, args: Record<string, unknown>) => Promise<McpResult>
}

/**
 * Tools = REST ของ SeedOffice แบบบาง (SPEC §4.18 · T2) — scope/role บังคับที่ REST เดิม
 * อ่าน: today, list_my_projects · เขียน: create_task, update_task, star_task, log_time
 */
export const TOOLS: ToolDef[] = [
  {
    name: 'today',
    description:
      'งานวันนี้ของฉัน: task ที่ติดดาว "ทำวันนี้" + task ที่มอบหมายให้ฉันและยังไม่เสร็จ + เวลารวมที่ลงวันนี้/เมื่อวาน (ไว้เช็คอินรายวัน)',
    inputSchema: {},
    handler: (callApi) => callApi('GET', '/api/me/today').then((r) => relay(r)),
  },
  {
    name: 'list_my_projects',
    description:
      'รายชื่อโปรเจกต์ที่ยัง active พร้อมกลุ่มงาน (groups) ในแต่ละโปรเจกต์ — ใช้หา groupId ก่อนเรียก create_task',
    inputSchema: {},
    handler: (callApi) => callApi('GET', '/api/me/projects').then((r) => relay(r)),
  },
  {
    name: 'create_task',
    description: 'สร้าง task ใหม่ในกลุ่มงาน — ต้องมี groupId (เอามาจาก list_my_projects)',
    inputSchema: {
      groupId: z.string().describe('id ของกลุ่มงาน (จาก list_my_projects)'),
      title: z.string().min(1).describe('ชื่องาน'),
      assigneeId: z.string().optional().describe('id ผู้รับผิดชอบ (เว้น = ไม่มอบหมาย)'),
      estimateMinutes: z.number().int().nonnegative().optional().describe('ประมาณการเป็นนาที'),
      startDate: isoDate.optional(),
      dueDate: isoDate.optional(),
    },
    handler: (callApi, a) => {
      const { groupId, ...body } = a
      return callApi('POST', `/api/groups/${enc(groupId)}/tasks`, body).then((r) =>
        relay(r, (d) => `สร้างงานแล้ว: ${fieldStr(d, 'title')} (id ${fieldStr(d, 'id')})`),
      )
    },
  },
  {
    name: 'update_task',
    description: 'แก้ task ที่มีอยู่: เปลี่ยนสถานะ (todo/doing/done), มอบหมาย, ชื่อ, ความสำคัญ, กำหนดวัน',
    inputSchema: {
      taskId: z.string(),
      status: z.enum(['todo', 'doing', 'done']).optional(),
      assigneeId: z.string().nullable().optional().describe('id ผู้รับผิดชอบ · null = เอาออก'),
      title: z.string().min(1).optional(),
      priority: z.enum(['low', 'normal', 'high']).optional(),
      estimateMinutes: z.number().int().nonnegative().nullable().optional(),
      startDate: isoDate.nullable().optional(),
      dueDate: isoDate.nullable().optional(),
    },
    handler: (callApi, a) => {
      const { taskId, ...body } = a
      return callApi('PATCH', `/api/tasks/${enc(taskId)}`, body).then((r) => relay(r))
    },
  },
  {
    name: 'star_task',
    description: 'ติดดาว / เอาดาวออกจาก task สำหรับ "ทำวันนี้"',
    inputSchema: {
      taskId: z.string(),
      on: z.boolean().describe('true = ติดดาว · false = เอาออก'),
    },
    handler: (callApi, a) =>
      callApi('POST', `/api/tasks/${enc(a.taskId)}/star`, { on: a.on }).then((r) => relay(r)),
  },
  {
    name: 'log_time',
    description: 'ลงเวลาทำงานใน task (manual) — เวลาเป็นนาที · ลงย้อนหลังได้ถ้างวดยังไม่ปิด',
    inputSchema: {
      taskId: z.string(),
      workDate: isoDate.describe('วันที่ทำงาน YYYY-MM-DD (โซนเวลาไทย)'),
      minutes: z
        .number()
        .int()
        .min(1)
        .max(24 * 60),
      note: z.string().max(500).optional(),
    },
    handler: (callApi, a) => {
      const { taskId, ...body } = a
      return callApi('POST', `/api/tasks/${enc(taskId)}/time`, body).then((r) =>
        relay(r, (d) => `ลงเวลาแล้ว ${fieldStr(d, 'minutes')} นาที${fieldStr(d, 'overCap') === 'true' ? ' (⚠️ เกินเพดานชั่วโมงของวันนั้น)' : ''}`),
      )
    },
  },
]
