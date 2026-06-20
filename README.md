# SeedOffice

ระบบจัดการงานภายในของทีม **SeedWebs** — รวม งาน/โปรเจกต์ · ลงเวลา · ค่าตอบแทน · อีเมลกลาง · เงินสดย่อย ไว้ที่เดียว เพื่อเลิกใช้ Notion + Everhour + คิดเงินเดือนด้วยมือ

แกนหลักคือลูป **งาน → ชั่วโมงที่ลง → เงิน** (ค่าตอบแทนรายคน + ต้นทุน/กำไรต่อโปรเจกต์)

## สถานะ

🚀 **ขึ้น production แล้ว** → **[office.seedwebs.com](https://office.seedwebs.com)** (deploy แรก มิ.ย. 2026)

ใช้งานจริงครบลูป **งาน → เวลา → เงิน** พร้อมฟีเจอร์รอบข้าง:

- ✅ **P1** — ลูปเงิน (โปรเจกต์/งาน · ลงเวลา timer+manual · ค่าตอบแทนงวด 25→24 · ต้นทุน/กำไร) + เอกสาร + ลูกค้า/CRM
- ✅ **P2** — เงินสดย่อย · team hub + ปฏิทินทีม · realtime presence (Durable Objects) · PWA
- ✅ **P3** — อีเมลกลาง (Gmail: ตอบ/มอบหมาย/ค้นย้อนหลัง) · sync Google Calendar + ICS feed
- ⏳ ถัดไป: P4 (ใบเสนอราคา → FlowAccount) · แจ้งเตือนภายใน · cutover เลิก Notion/Everhour

> ดีไซน์อ้างอิง [mockup.html](./mockup.html) ([ดู Live](https://seedwebs.github.io/SeedOffice/)) · สเปกเต็ม [SPEC.md](./SPEC.md)

## Stack

- **Backend:** Cloudflare Workers · Hono 4 · D1 + Drizzle 0.45 · R2 · Durable Objects (WebSocket presence/collision)
- **Frontend:** React 19 · Vite 8 · React Router 7 · Tailwind 4.3
- **Monorepo:** pnpm workspaces — `apps/web` · `apps/api` · `packages/db` (Drizzle) · `packages/core` (โดเมนการเงินล้วน, TDD)
- **เทสต์:** Vitest 4 (`vitest-pool-workers` รันบน workerd + D1 จริง) + Playwright e2e

## ในรีโป

| ไฟล์ | คือ |
|------|-----|
| [`mockup.html`](./mockup.html) | prototype กดได้ (source of truth ของดีไซน์) |
| [`SPEC.md`](./SPEC.md) | สเปก ขอบเขต และสิทธิ์ตาม role |
| [`tasks/`](./tasks) | แผน build · task list · progress note |

> ข้อมูลใน mockup เป็นข้อมูลตัวอย่างทั้งหมด

## License

[MIT](./LICENSE)
