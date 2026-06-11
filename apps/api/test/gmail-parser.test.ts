import { describe, expect, it } from 'vitest'
import {
  decodeEntities,
  decodeRfc2047,
  extractEmail,
  parseGmailMessage,
  type GmailMessage,
} from '../src/lib/gmail'

/** base64url ของ utf-8 string (เหมือนที่ Gmail ส่ง body.data มา) */
const b64url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const baseMsg = (over: Partial<GmailMessage>): GmailMessage => ({
  id: 'm-1',
  threadId: 't-1',
  labelIds: ['INBOX', 'UNREAD'],
  snippet: 'snippet',
  internalDate: '1765432100000',
  ...over,
})

describe('E2 — gmail parser', () => {
  it('multipart/alternative เลือก text/html + ถอด base64url ภาษาไทย', () => {
    const msg = baseMsg({
      payload: {
        mimeType: 'multipart/alternative',
        headers: [
          { name: 'Subject', value: 'สอบถามเรื่องโดเมน' },
          { name: 'From', value: 'คุณลูกค้า <customer@brand-x.test>' },
          { name: 'To', value: 'support@brand-a.test' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            headers: [{ name: 'Content-Type', value: 'text/plain; charset="UTF-8"' }],
            body: { data: b64url('ข้อความตัวหนังสือ'), size: 10 },
          },
          {
            mimeType: 'text/html',
            headers: [{ name: 'Content-Type', value: 'text/html; charset="UTF-8"' }],
            body: { data: b64url('<p>สวัสดีครับ ขอสอบถามเรื่องโดเมน</p>'), size: 20 },
          },
        ],
      },
    })
    const p = parseGmailMessage(msg)
    expect(p.subject).toBe('สอบถามเรื่องโดเมน')
    expect(p.body?.content).toBe('<p>สวัสดีครับ ขอสอบถามเรื่องโดเมน</p>')
    expect(p.body?.contentType).toContain('text/html')
    expect(p.fromAddr).toBe('คุณลูกค้า <customer@brand-x.test>')
    expect(p.sentAt).toBe(1765432100000)
    expect(p.attachments).toHaveLength(0)
  })

  it('multipart/mixed ซ้อน alternative + ไฟล์แนบ → ได้ html + attachment metadata (ไม่มี bytes)', () => {
    const msg = baseMsg({
      payload: {
        mimeType: 'multipart/mixed',
        parts: [
          {
            mimeType: 'multipart/alternative',
            parts: [
              { mimeType: 'text/plain', body: { data: b64url('plain') } },
              { mimeType: 'text/html', body: { data: b64url('<b>html</b>') } },
            ],
          },
          {
            mimeType: 'application/pdf',
            filename: 'invoice-0042.pdf',
            body: { attachmentId: 'att-123', size: 52341 },
          },
        ],
      },
    })
    const p = parseGmailMessage(msg)
    expect(p.body?.content).toBe('<b>html</b>')
    expect(p.attachments).toEqual([
      {
        gmailAttachmentId: 'att-123',
        filename: 'invoice-0042.pdf',
        mime: 'application/pdf',
        sizeBytes: 52341,
      },
    ])
  })

  it('plain อย่างเดียว → contentType text/plain · ไม่มี body → null', () => {
    const plainOnly = parseGmailMessage(
      baseMsg({ payload: { mimeType: 'text/plain', body: { data: b64url('ข้อความล้วน') } } }),
    )
    expect(plainOnly.body?.content).toBe('ข้อความล้วน')
    expect(plainOnly.body?.contentType).toContain('text/plain')

    const noBody = parseGmailMessage(baseMsg({ payload: { mimeType: 'multipart/mixed' } }))
    expect(noBody.body).toBeNull()
  })

  it('RFC2047: B-encoding ชื่อไทย + Q-encoding underscore/hex + encoded-word ติดกัน', () => {
    const thai = 'บริษัท ทดสอบ'
    const b = btoa(String.fromCharCode(...new TextEncoder().encode(thai)))
    expect(decodeRfc2047(`=?UTF-8?B?${b}?= <a@b.test>`)).toBe(`${thai} <a@b.test>`)
    expect(decodeRfc2047('=?utf-8?Q?Hello_World?=')).toBe('Hello World')
    expect(decodeRfc2047('=?utf-8?Q?=E0=B8=81?=')).toBe('ก')
    // สองก้อนติดกันคั่นช่องว่าง → ต่อกันไม่เหลือช่องว่าง
    expect(decodeRfc2047('=?utf-8?Q?ab?= =?utf-8?Q?cd?=')).toBe('abcd')
  })

  it('extractEmail + decodeEntities', () => {
    expect(extractEmail('คุณลูกค้า <Customer@Brand-X.test>')).toBe('customer@brand-x.test')
    expect(extractEmail('  plain@addr.test ')).toBe('plain@addr.test')
    expect(decodeEntities('it&#39;s &quot;ok&quot; &lt;tag&gt; &amp; done')).toBe(
      'it\'s "ok" <tag> & done',
    )
  })
})
