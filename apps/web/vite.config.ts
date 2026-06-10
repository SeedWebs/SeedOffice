import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // dev: vite เสิร์ฟ SPA · /api/* ส่งต่อให้ wrangler dev (worker) — production worker เสิร์ฟทั้งคู่
      '/api': 'http://localhost:8787',
    },
  },
})
