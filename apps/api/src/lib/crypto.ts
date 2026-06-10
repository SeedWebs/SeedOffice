/**
 * เข้ารหัส secret/token ของอีเมลกลาง ก่อนเก็บลง D1 (SPEC §4.12/§11 — ห้าม credential โผล่ใน DB ตรงๆ)
 * AES-GCM 256 — key = INBOX_ENC_KEY (wrangler secret, base64 ของ 32 bytes)
 * payload = `v1.<iv b64>.<ciphertext b64>` — เผื่อหมุนรูปแบบ/คีย์ภายหลัง
 */

const VERSION = 'v1'

function b64encode(buf: Uint8Array): string {
  let s = ''
  for (const b of buf) s += String.fromCharCode(b)
  return btoa(s)
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = b64decode(keyB64)
  if (raw.length !== 32) throw new Error('INBOX_ENC_KEY ต้องเป็น base64 ของ key 32 bytes')
  return crypto.subtle.importKey('raw', raw.buffer as ArrayBuffer, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

export async function encryptSecret(plain: string, keyB64: string): Promise<string> {
  const key = await importKey(keyB64)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain),
  )
  return `${VERSION}.${b64encode(iv)}.${b64encode(new Uint8Array(ct))}`
}

/** คืน plaintext — โยน error ถ้า payload ถูกแก้หรือคีย์ผิด (GCM auth tag ไม่ผ่าน) */
export async function decryptSecret(payload: string, keyB64: string): Promise<string> {
  const [version, ivB64, ctB64] = payload.split('.')
  if (version !== VERSION || !ivB64 || !ctB64) throw new Error('payload เข้ารหัสรูปแบบไม่ถูกต้อง')
  const key = await importKey(keyB64)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(ivB64).buffer as ArrayBuffer },
    key,
    b64decode(ctB64).buffer as ArrayBuffer,
  )
  return new TextDecoder().decode(plain)
}
