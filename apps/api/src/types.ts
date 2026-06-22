import type { User } from '@seedoffice/db'

/** Hono env ของทั้งแอป — Bindings จาก wrangler types (Env) + ตัวแปรที่ middleware set */
export type AppEnv = {
  Bindings: Env
  Variables: {
    user: User
    /** set เมื่อ auth ผ่าน PAT (SPEC §4.18) — undefined = มาทาง session cookie (คนจริง) */
    tokenScopes?: string[]
  }
}
