import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createMcpHandler } from 'agents/mcp'
import { TOOLS, bearerOf, type CallApi } from './tools'

/** สร้าง MCP server ใหม่ต่อ request (stateless) + ผูก tools เข้ากับ callApi ที่ปิดทับ PAT ของ user */
export function buildServer(callApi: CallApi): McpServer {
  const server = new McpServer({ name: 'seedoffice', version: '0.1.0' })
  for (const t of TOOLS) {
    server.tool(t.name, t.description, t.inputSchema, (args) =>
      t.handler(callApi, args as Record<string, unknown>),
    )
  }
  return server
}

/** forward ทุก call ไป Worker หลัก (apps/api) ผ่าน service binding พร้อม PAT ของ user — REST คุม scope/role */
function makeCallApi(env: Env, token: string): CallApi {
  return (method, path, body) =>
    env.API.fetch(
      new Request(`https://seedoffice-api.internal${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    )
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/health') return Response.json({ ok: true, service: 'seedoffice-mcp' })
    if (url.pathname !== '/mcp') return new Response('not found', { status: 404 })

    // PAT บังคับทุก request (รวม initialize) — client ต่อด้วย Custom Header Authorization: Bearer sko_…
    const token = bearerOf(request)
    if (!token) {
      return Response.json(
        { error: 'unauthorized', message: 'ต้องส่ง Authorization: Bearer <PAT> (สร้าง PAT ที่หน้าโปรไฟล์ของ SeedOffice)' },
        { status: 401, headers: { 'www-authenticate': 'Bearer' } },
      )
    }
    return createMcpHandler(buildServer(makeCallApi(env, token)))(request, env, ctx)
  },
}
