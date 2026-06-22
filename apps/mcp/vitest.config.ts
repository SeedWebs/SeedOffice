import { defineConfig } from 'vitest/config'

// tools เป็น logic ล้วน (inject callApi) → เทสต์ node ปกติ ไม่ต้องใช้ workerd/service binding
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
})
