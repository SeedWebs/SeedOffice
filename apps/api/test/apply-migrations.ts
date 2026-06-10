import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import { applyD1Migrations, env } from 'cloudflare:test'

// TEST_MIGRATIONS ใส่มาจาก vitest.config.ts (ไม่ใช่ binding จริงของ worker เลย cast เฉพาะจุดนี้)
await applyD1Migrations(env.DB, (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS)
