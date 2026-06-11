import { DurableObject } from 'cloudflare:workers'

/**
 * Collision detection ของอีเมลกลาง (SPEC §4.12/§5) — DO ต่อ thread (idFromName(threadId))
 * ใครกำลังเปิดดู/พิมพ์ตอบ thread เดียวกัน — broadcast roster ทุกครั้งที่ เข้า/ออก/เปลี่ยนโหมด
 * ใช้ WebSocket Hibernation เหมือน PresenceHub (attachment อยู่รอดข้าม hibernation)
 */

interface Viewer {
  userId: string
  name: string
  mode: 'view' | 'typing'
}

export class InboxThreadHub extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
      return Response.json({ error: 'expected_websocket' }, { status: 426 })

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket]
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({
      userId: request.headers.get('x-user-id') ?? '',
      name: request.headers.get('x-user-name') ?? '',
      mode: 'view',
    } satisfies Viewer)
    this.broadcastRoster()
    return new Response(null, { status: 101, webSocket: client })
  }

  /**
   * รวมรายชื่อคนใน thread (คนเดียวหลายแท็บ = หนึ่งรายการ, typing ชนะ view) แล้วส่งให้ทุกคน
   * exclude = socket ที่กำลังปิด — ตอน webSocketClose มันยังอยู่ใน getWebSockets() ต้องตัดเอง
   */
  private broadcastRoster(exclude?: WebSocket): void {
    const sockets = this.ctx.getWebSockets().filter((ws) => ws !== exclude)
    const byUser = new Map<string, Viewer>()
    for (const ws of sockets) {
      const v = ws.deserializeAttachment() as Viewer | null
      if (!v?.userId) continue
      const cur = byUser.get(v.userId)
      if (!cur || v.mode === 'typing') byUser.set(v.userId, v)
    }
    const data = JSON.stringify({ type: 'roster', viewers: [...byUser.values()] })
    for (const ws of sockets) {
      try {
        ws.send(data)
      } catch {
        // socket ตายระหว่างส่ง — hibernation API เก็บกวาดเอง
      }
    }
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (message === 'ping') {
      ws.send('pong')
      return
    }
    try {
      const msg = JSON.parse(String(message)) as { type?: string; mode?: string }
      if (msg.type === 'mode' && (msg.mode === 'view' || msg.mode === 'typing')) {
        const v = ws.deserializeAttachment() as Viewer
        ws.serializeAttachment({ ...v, mode: msg.mode })
        this.broadcastRoster()
      }
    } catch {
      // ข้อความนอกรูปแบบ — เมิน
    }
  }

  webSocketClose(ws: WebSocket): void {
    try {
      ws.close()
    } catch {
      // ปิดไปแล้ว
    }
    this.broadcastRoster(ws)
  }
}
