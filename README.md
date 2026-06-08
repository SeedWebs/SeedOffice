# SeedOffice

ระบบจัดการงานภายในของทีม **SeedWebs** — รวม งาน/โปรเจกต์ · ลงเวลา · ค่าตอบแทน · อีเมลกลาง · เงินสดย่อย ไว้ที่เดียว เพื่อเลิกใช้ Notion + Everhour + คิดเงินเดือนด้วยมือ

แกนหลักคือลูป **งาน → ชั่วโมงที่ลง → เงิน** (ค่าตอบแทนรายคน + ต้นทุน/กำไรต่อโปรเจกต์)

## สถานะ

🎨 **ช่วงออกแบบ** — ยังไม่เริ่มเขียนโค้ดจริง

- ✅ สเปก (v0.7) — [SPEC.md](./SPEC.md)
- ✅ Mockup กดได้จริง + รองรับมือถือ → **[ดู Live ▸](https://seedwebs.github.io/SeedOffice/)**
- ✅ แผน P1 (T01–T17) — [tasks/plan.md](./tasks/plan.md) · [tasks/todo.md](./tasks/todo.md)
- ⏳ ถัดไป: เริ่ม build P1 (monorepo scaffold)

## Stack (วางแผนไว้สำหรับ P1)

- **Backend:** Cloudflare Workers · Hono · D1 + Drizzle · R2
- **Frontend:** React · Vite · React Router · Tailwind
- **Monorepo:** pnpm workspaces (`apps/web`, `apps/api`, `packages/db`, `packages/core`)

## ในรีโป

| ไฟล์ | คือ |
|------|-----|
| [`mockup.html`](./mockup.html) | prototype กดได้ (source of truth ของดีไซน์) |
| [`SPEC.md`](./SPEC.md) | สเปก ขอบเขต และสิทธิ์ตาม role |
| [`tasks/`](./tasks) | แผน build · task list · progress note |

> ข้อมูลใน mockup เป็นข้อมูลตัวอย่างทั้งหมด

## License

[MIT](./LICENSE)
