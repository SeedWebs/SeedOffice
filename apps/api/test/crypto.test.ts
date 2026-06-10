import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret } from '../src/lib/crypto'

// key เทสต์คงที่ (32 bytes) — production ใช้ INBOX_ENC_KEY จาก wrangler secret
const KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)))
const OTHER_KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => 255 - i)))

describe('E1 — crypto เข้ารหัส secret/token (AES-GCM)', () => {
  it('round-trip ได้ค่าเดิม และ payload ไม่มี plaintext โผล่', async () => {
    const secret = 'GOCSPX-super-secret-1234'
    const payload = await encryptSecret(secret, KEY)
    expect(payload.startsWith('v1.')).toBe(true)
    expect(payload).not.toContain(secret)
    expect(await decryptSecret(payload, KEY)).toBe(secret)
  })

  it('iv สุ่มต่อครั้ง — เข้ารหัสค่าเดิมสองครั้งได้ payload ต่างกัน', async () => {
    const a = await encryptSecret('same-value', KEY)
    const b = await encryptSecret('same-value', KEY)
    expect(a).not.toBe(b)
    expect(await decryptSecret(a, KEY)).toBe(await decryptSecret(b, KEY))
  })

  it('payload ถูกดัดแปลง → decrypt โยน error (GCM auth)', async () => {
    const payload = await encryptSecret('tamper-me', KEY)
    const [version, ivB64, ctB64] = payload.split('.')
    const ct = b64ToBytes(ctB64 ?? '')
    ct[0] = (ct[0] ?? 0) ^ 0xff
    const tampered = `${version}.${ivB64}.${btoa(String.fromCharCode(...ct))}`
    await expect(decryptSecret(tampered, KEY)).rejects.toThrow()
  })

  it('คีย์ผิด → decrypt โยน error', async () => {
    const payload = await encryptSecret('wrong-key-test', KEY)
    await expect(decryptSecret(payload, OTHER_KEY)).rejects.toThrow()
  })

  it('คีย์ไม่ใช่ 32 bytes / payload รูปแบบผิด → error ชัดเจน', async () => {
    await expect(encryptSecret('x', btoa('short'))).rejects.toThrow(/32 bytes/)
    await expect(decryptSecret('not-a-payload', KEY)).rejects.toThrow(/รูปแบบไม่ถูกต้อง/)
  })
})

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
