import { DurableObject } from 'cloudflare:workers'

/**
 * Presence hub (SPEC §4.15) — ตัวเดียวทั้งบริษัท (idFromName('global'))
 * หน้าที่เดียว: รับ WebSocket ของทีม แล้ว broadcast "มีความเคลื่อนไหว timer"
 * payload เบา ({type:'changed'}) — client ไป reload /api/team-activity เอง
 * ใช้ WebSocket Hibernation (ctx.acceptWebSocket) → ไม่กิน duration ตอนเงียบ
 */
export class PresenceHub extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
      return Response.json({ error: 'expected_websocket' }, { status: 426 })

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket]
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({
      userId: request.headers.get('x-user-id') ?? '',
      name: request.headers.get('x-user-name') ?? '',
    })
    return new Response(null, { status: 101, webSocket: client })
  }

  /** RPC จาก worker routes — กระจายให้ทุก socket ที่ต่ออยู่ */
  notify(event: { type: string; [k: string]: unknown }): void {
    const data = JSON.stringify(event)
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data)
      } catch {
        // socket ตายระหว่างส่ง — hibernation API จะเก็บกวาดเอง
      }
    }
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (message === 'ping') ws.send('pong') // keepalive จาก client
  }

  webSocketClose(ws: WebSocket): void {
    try {
      ws.close()
    } catch {
      // ปิดไปแล้ว
    }
  }
}
