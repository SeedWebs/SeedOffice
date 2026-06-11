/**
 * สร้าง MIME message สำหรับส่งผ่าน Gmail API (users.messages.send รับ raw base64url)
 * pure ทั้งไฟล์ — ภาษาไทยใน header ต้องเป็น RFC 2047 (=?UTF-8?B?…?=) · body = base64 UTF-8
 * threading ที่ถูกต้อง (SPEC §4.12): In-Reply-To + References ของฉบับที่ตอบ
 */

const te = new TextEncoder()

function b64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

/** encode header ที่อาจมี non-ASCII (ชื่อไทย/หัวข้อไทย) เป็น encoded-word */
export function encodeHeaderWord(value: string): string {
  // ASCII ล้วนและไม่มีอักขระพิเศษของ header → ใช้ตรงๆ
  if (/^[\x20-\x7e]*$/.test(value) && !/[",:;<>@]/.test(value)) return value
  return `=?UTF-8?B?${b64(te.encode(value))}?=`
}

/** "ชื่อ <a@b>" — encode เฉพาะส่วนชื่อ ปล่อย address เดิม */
export function formatAddress(name: string | null, email: string): string {
  if (!name) return email
  return `${encodeHeaderWord(name)} <${email}>`
}

/** base64 แบบตัดบรรทัดทุก 76 ตัวอักษร (RFC 2045) */
function b64Wrapped(text: string): string {
  const full = b64(te.encode(text))
  return full.replace(/(.{76})/g, '$1\r\n')
}

export interface MimeOptions {
  from: string // formatAddress แล้ว
  to: string
  cc?: string | null
  subject: string
  bodyText: string
  inReplyTo?: string | null // Message-ID ของฉบับที่ตอบ เช่น "<abc@mail.gmail.com>"
  references?: string | null // References เดิม (ต่อท้ายด้วย inReplyTo ให้อัตโนมัติ)
}

export function buildMime(o: MimeOptions): string {
  const headers: string[] = [
    `From: ${o.from}`,
    `To: ${o.to}`,
    ...(o.cc ? [`Cc: ${o.cc}`] : []),
    `Subject: ${encodeHeaderWord(o.subject)}`,
    ...(o.inReplyTo
      ? [
          `In-Reply-To: ${o.inReplyTo}`,
          `References: ${[o.references, o.inReplyTo].filter(Boolean).join(' ')}`,
        ]
      : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  ]
  return `${headers.join('\r\n')}\r\n\r\n${b64Wrapped(o.bodyText)}`
}

/** Gmail API ต้องการ raw เป็น base64url */
export function toBase64Url(mime: string): string {
  return b64(te.encode(mime)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** เติม Re: ถ้ายังไม่มี (กัน Re: Re: ซ้อน) */
export function replySubject(subject: string): string {
  return /^\s*re\s*:/i.test(subject) ? subject : `Re: ${subject}`
}
