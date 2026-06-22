import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.wrangler/**', '**/worker-configuration.d.ts', 'mockup.html'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // กัน floating promise ตั้งแต่วันแรก (best practice ของ Workers)
      '@typescript-eslint/no-floating-promises': 'off', // ต้องใช้ type-aware lint — เปิดใน T04 ตอนมี route จริง
    },
  },
  {
    // native dialog ดูไม่เรียบหรู — ใช้ useDialog() (components/Dialog.tsx) แทนเสมอ
    files: ['apps/web/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'alert', message: 'ใช้ useDialog() แทน' },
        { name: 'confirm', message: 'ใช้ confirmDialog() จาก useDialog() แทน' },
        { name: 'prompt', message: 'ใช้ promptDialog() จาก useDialog() แทน' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'alert', message: 'ใช้ useDialog() แทน' },
        { object: 'window', property: 'confirm', message: 'ใช้ confirmDialog() แทน' },
        { object: 'window', property: 'prompt', message: 'ใช้ promptDialog() แทน' },
      ],
    },
  },
)
