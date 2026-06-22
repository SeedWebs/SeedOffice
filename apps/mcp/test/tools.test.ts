import { describe, expect, it } from 'vitest'
import { TOOLS, bearerOf, type CallApi, type ToolDef } from '../src/tools'

/** fake callApi: บันทึก call ที่ส่งไป + คืน Response ที่กำหนด */
function stub(status: number, json: unknown) {
  const calls: { method: string; path: string; body?: unknown }[] = []
  const callApi: CallApi = async (method, path, body) => {
    calls.push({ method, path, body })
    return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } })
  }
  return { calls, callApi }
}

const tool = (name: string): ToolDef => {
  const t = TOOLS.find((x) => x.name === name)
  if (!t) throw new Error(`ไม่มี tool ${name}`)
  return t
}

describe('TOOLS registry', () => {
  it('มี tool ครบตามที่ออกแบบ + ชื่อไม่ซ้ำ', () => {
    const names = TOOLS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names.sort()).toEqual(
      ['create_task', 'list_my_projects', 'log_time', 'star_task', 'today', 'update_task'].sort(),
    )
  })
  it('ทุก tool มี description + handler', () => {
    for (const t of TOOLS) {
      expect(t.description.length).toBeGreaterThan(0)
      expect(typeof t.handler).toBe('function')
    }
  })
})

describe('read tools → GET REST', () => {
  it('today → GET /api/me/today', async () => {
    const { calls, callApi } = stub(200, { date: '2026-06-22', starred: [] })
    const res = await tool('today').handler(callApi, {})
    expect(calls[0]).toEqual({ method: 'GET', path: '/api/me/today', body: undefined })
    expect(res.isError).toBeFalsy()
    expect(res.content[0]?.text).toContain('2026-06-22')
  })
  it('list_my_projects → GET /api/me/projects', async () => {
    const { calls, callApi } = stub(200, { projects: [{ id: 'p1', groups: [{ id: 'g1', name: 'A' }] }] })
    await tool('list_my_projects').handler(callApi, {})
    expect(calls[0]?.path).toBe('/api/me/projects')
  })
})

describe('write tools → REST ถูก method/path/body', () => {
  it('create_task → POST /api/groups/:id/tasks (ตัด groupId ออกจาก body)', async () => {
    const { calls, callApi } = stub(201, { id: 't9', title: 'งานใหม่' })
    const res = await tool('create_task').handler(callApi, { groupId: 'g1', title: 'งานใหม่', estimateMinutes: 60 })
    expect(calls[0]).toEqual({ method: 'POST', path: '/api/groups/g1/tasks', body: { title: 'งานใหม่', estimateMinutes: 60 } })
    expect(res.content[0]?.text).toContain('t9')
  })
  it('update_task → PATCH /api/tasks/:id', async () => {
    const { calls, callApi } = stub(200, { id: 't9', status: 'done' })
    await tool('update_task').handler(callApi, { taskId: 't9', status: 'done' })
    expect(calls[0]).toEqual({ method: 'PATCH', path: '/api/tasks/t9', body: { status: 'done' } })
  })
  it('star_task → POST /api/tasks/:id/star body {on}', async () => {
    const { calls, callApi } = stub(200, { ok: true })
    await tool('star_task').handler(callApi, { taskId: 't9', on: true })
    expect(calls[0]).toEqual({ method: 'POST', path: '/api/tasks/t9/star', body: { on: true } })
  })
  it('log_time → POST /api/tasks/:id/time + สรุปนาที + เตือนเกินเพดาน', async () => {
    const { calls, callApi } = stub(201, { id: 'te1', minutes: 90, overCap: true })
    const res = await tool('log_time').handler(callApi, { taskId: 't9', workDate: '2026-06-22', minutes: 90 })
    expect(calls[0]).toEqual({ method: 'POST', path: '/api/tasks/t9/time', body: { workDate: '2026-06-22', minutes: 90 } })
    expect(res.content[0]?.text).toContain('90 นาที')
    expect(res.content[0]?.text).toContain('เกินเพดาน')
  })
})

describe('relay error', () => {
  it('REST ไม่ 2xx → isError + ข้อความไทยจาก message/error + รหัสสถานะ', async () => {
    const { callApi } = stub(403, { error: 'insufficient_scope', message: 'ต้องมี scope tasks:write' })
    const res = await tool('create_task').handler(callApi, { groupId: 'g1', title: 'x' })
    expect(res.isError).toBe(true)
    expect(res.content[0]?.text).toContain('403')
    expect(res.content[0]?.text).toContain('tasks:write')
  })
})

describe('bearerOf', () => {
  const req = (h?: string) => new Request('https://x/mcp', h ? { headers: { Authorization: h } } : undefined)
  it('Bearer sko_… → token', () => expect(bearerOf(req('Bearer sko_abc'))).toBe('sko_abc'))
  it('ไม่มี header → null', () => expect(bearerOf(req())).toBeNull())
  it('ไม่ใช่ Bearer → null', () => expect(bearerOf(req('Basic xyz'))).toBeNull())
  it('Bearer ว่าง → null', () => expect(bearerOf(req('Bearer   '))).toBeNull())
})
