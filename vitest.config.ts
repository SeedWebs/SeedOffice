import { defineConfig } from 'vitest/config'

// unit tests ของ packages/* (pure) — integration ของ api (vitest-pool-workers) จะเพิ่มตอน T04+
export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts'],
  },
})
