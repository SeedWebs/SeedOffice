/**
 * แปลงข้อความจาก Gmail API (users.messages.get format=full) เป็นโครงที่ระบบใช้
 * pure ทั้งไฟล์ — ไม่แตะเครือข่าย/DB เทสต์ด้วย fixture ตรงๆ
 * ข้อจำกัดที่รู้: TextDecoder บน workerd รองรับ utf-8 เท่านั้น — เมล charset เก่า (tis-620 ฯลฯ)
 * จะ fallback เป็น utf-8 (อาจเพี้ยน) · เมลยุคปัจจุบันแทบทั้งหมดเป็น utf-8
 */

export interface GmailHeader {
  name: string
  value: string
}

export interface GmailMessagePart {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: { data?: string; size?: number; attachmentId?: string }
  parts?: GmailMessagePart[]
}

export interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string // epoch ms เป็น string
  payload?: GmailMessagePart
}

export interface ParsedAttachment {
  gmailAttachmentId: string
  filename: string
  mime: string
  sizeBytes: number
}

export interface ParsedMessage {
  gmailMessageId: string
  gmailThreadId: string
  labelIds: string[]
  subject: string
  fromAddr: string
  toAddr: string
  ccAddr: string | null
  snippet: string
  /** null = เมลไม่มีเนื้อหา (เช่นแนบไฟล์ล้วน) */
  body: { content: string; contentType: string } | null
  attachments: ParsedAttachment[]
  sentAt: number // epoch ms
}

function b64UrlDecodeBytes(data: string): Uint8Array {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function decodeBytes(bytes: Uint8Array, charset?: string): string {
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/** ดึง email เปล่า lowercase จาก header เช่น 'ชื่อ <a@b.com>' → 'a@b.com' */
export function extractEmail(addr: string): string {
  const m = /<([^>]+)>/.exec(addr)
  return (m?.[1] ?? addr).trim().toLowerCase()
}

/**
 * ถอด RFC 2047 encoded-word ใน header (ชื่อผู้ส่งไทยมาแบบ =?UTF-8?B?...?= เสมอ)
 * รองรับ B (base64) และ Q (quoted-printable: _ = ช่องว่าง, =XX = hex byte)
 */
export function decodeRfc2047(value: string): string {
  // encoded-word ติดกัน (คั่น whitespace) ต้องเชื่อมโดยไม่เหลือช่องว่าง (RFC 2047 §6.2)
  const joined = value.replace(/(\?=)\s+(=\?)/g, '$1$2')
  return joined.replace(
    /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g,
    (_all, charset: string, enc: string, text: string) => {
      try {
        if (enc.toLowerCase() === 'b') return decodeBytes(b64UrlDecodeBytes(text), charset)
        // Q encoding
        const bytes: number[] = []
        for (let i = 0; i < text.length; i++) {
          const ch = text[i]!
          if (ch === '_') bytes.push(0x20)
          else if (ch === '=' && i + 2 < text.length + 1) {
            bytes.push(parseInt(text.slice(i + 1, i + 3), 16))
            i += 2
          } else bytes.push(ch.charCodeAt(0))
        }
        return decodeBytes(new Uint8Array(bytes), charset)
      } catch {
        return text
      }
    },
  )
}

/** snippet ของ Gmail มากับ HTML entities — ถอดตัวที่พบบ่อยพอ */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function header(part: GmailMessagePart | undefined, name: string): string {
  const h = part?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())
  return h?.value ?? ''
}

function charsetOf(contentType: string): string | undefined {
  return /charset="?([^";\s]+)"?/i.exec(contentType)?.[1]
}

/** เดินทุก part (DFS) — payload เองก็นับเป็น part */
function walk(part: GmailMessagePart, visit: (p: GmailMessagePart) => void): void {
  visit(part)
  for (const p of part.parts ?? []) walk(p, visit)
}

/** เลือกเนื้อหา: text/html ก่อน (ไม่ใช่ไฟล์แนบ) → text/plain → null */
function findBody(payload: GmailMessagePart): { content: string; contentType: string } | null {
  let html: GmailMessagePart | undefined
  let plain: GmailMessagePart | undefined
  walk(payload, (p) => {
    if (p.filename || !p.body?.data) return
    const mime = (p.mimeType ?? '').toLowerCase()
    if (mime.startsWith('text/html') && !html) html = p
    if (mime.startsWith('text/plain') && !plain) plain = p
  })
  const chosen = html ?? plain
  if (!chosen?.body?.data) return null
  const charset = charsetOf(header(chosen, 'Content-Type'))
  const content = decodeBytes(b64UrlDecodeBytes(chosen.body.data), charset)
  const isHtml = chosen === html
  return { content, contentType: `text/${isHtml ? 'html' : 'plain'}; charset=utf-8` }
}

function collectAttachments(payload: GmailMessagePart): ParsedAttachment[] {
  const out: ParsedAttachment[] = []
  walk(payload, (p) => {
    if (!p.filename || !p.body?.attachmentId) return
    out.push({
      gmailAttachmentId: p.body.attachmentId,
      filename: decodeRfc2047(p.filename),
      mime: p.mimeType ?? 'application/octet-stream',
      sizeBytes: p.body.size ?? 0,
    })
  })
  return out
}

export function parseGmailMessage(msg: GmailMessage): ParsedMessage {
  const payload = msg.payload ?? {}
  return {
    gmailMessageId: msg.id,
    gmailThreadId: msg.threadId,
    labelIds: msg.labelIds ?? [],
    subject: decodeRfc2047(header(payload, 'Subject')),
    fromAddr: decodeRfc2047(header(payload, 'From')),
    toAddr: decodeRfc2047(header(payload, 'To')),
    ccAddr: header(payload, 'Cc') ? decodeRfc2047(header(payload, 'Cc')) : null,
    snippet: decodeEntities(msg.snippet ?? ''),
    body: findBody(payload),
    attachments: collectAttachments(payload),
    sentAt: Number(msg.internalDate ?? 0),
  }
}
