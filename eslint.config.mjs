import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.wrangler/**', 'worker-configuration.d.ts', 'mockup.html'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // กัน floating promise ตั้งแต่วันแรก (best practice ของ Workers)
      '@typescript-eslint/no-floating-promises': 'off', // ต้องใช้ type-aware lint — เปิดใน T04 ตอนมี route จริง
    },
  },
)
