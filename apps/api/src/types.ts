import type { User } from '@seedoffice/db'

/** Hono env ของทั้งแอป — Bindings จาก wrangler types (Env) + ตัวแปรที่ middleware set */
export type AppEnv = {
  Bindings: Env
  Variables: {
    user: User
  }
}
