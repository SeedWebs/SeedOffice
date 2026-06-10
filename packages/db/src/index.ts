/**
 * @seedoffice/db — Drizzle schema + helper
 * ใช้: const db = createDb(c.env.DB)
 */
import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

export type Db = ReturnType<typeof createDb>
export * from './schema'
export { schema }
