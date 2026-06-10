# SeedOffice — คู่มือสำหรับ Claude Code

Internal tool ของทีม SeedWebs: ลูป **งาน → ชั่วโมงที่ลง → เงิน** (แทน Notion + Everhour + คิดเงินเดือนมือ)
สถานะ: **เริ่ม build P1** — อ่านก่อนทำงาน: [SPEC.md](./SPEC.md) (v0.9, source of truth) · [tasks/plan.md](./tasks/plan.md) · [tasks/todo.md](./tasks/todo.md) · [tasks/PROGRESS.md](./tasks/PROGRESS.md)

## วิธีทำงานกับเจ้าของ
- ตอบเป็น **ภาษาไทย** เสมอ · ทำทีละจุดเล็กๆ แล้ว **verify ทุกครั้ง** ก่อนรายงาน
- [mockup.html](./mockup.html) = **source of truth ของดีไซน์** — preview ชื่อ `mockup` (port 4321) · แก้แล้ว reload → เช็ค eval/console/screenshot
- ตัดสินใจอะไรใหม่ → **sync SPEC.md ทันที** (อย่าค้างเยอะ) · รีวิวกับเจ้าของทุก checkpoint (CP1–CP4)
- commit = conventional commits, PR เล็ก · **repo เป็น public** — ห้าม commit ด้วยอีเมล `m@seedwebs.com` (ใช้ git author noreply เดิม) · ข้อมูลตัวอย่างต้อง anonymized

## กฎเหล็ก (ฉบับเต็ม: SPEC §9 + §11)
- **เงิน = integer สตางค์ · เวลา = integer นาที** — ห้าม float/REAL กับเงินเด็ดขาด
- ตรรกะการเงินทั้งหมด = **pure function ใน `packages/core` เขียนเทสต์ก่อน (TDD)** — ห้ามฝังใน route/UI
- **snapshot rate** ลง time entry ตอนสร้าง · แก้/ลบเวลา + การเงิน → `audit_logs` เสมอ · **soft-delete เท่านั้น**
- **Privacy gate ที่ server**: เงินพิเศษ + ยอดสุทธิ = เจ้าตัว + owner · **vendor ไม่เห็น P&L / payroll / rate ทีม** → permission test ทุก endpoint
- timezone **Asia/Bangkok** · งวดเงินเดือน **25→24 จ่าย 26** · เพดาน 8 ชม./วัน (company config — ไม่ hardcode)
- Validation = **Zod ที่ขอบ API ทุก endpoint** · DB ผ่าน Drizzle + migration เท่านั้น (forward-only)
- UI ทุกหน้ามี **empty + loading state** · คีย์ลัดเช็คจาก **`e.code`** (กันแป้นไทย)
- **ถามก่อนทำ**: deploy production · ส่งอีเมล/แจ้งเตือนออกนอกระบบ · ยิง FlowAccount API · migration ทำลายข้อมูล
- ห้าม commit secrets (ใช้ wrangler secrets/vars)

## Stack & โครงสร้าง (P1)
pnpm workspaces — `apps/web` (React+Vite+React Router+Tailwind SPA) · `apps/api` (Hono บน Cloudflare Workers) · `packages/db` (Drizzle+D1) · `packages/core` (โดเมนล้วน pure, test ง่าย) · ไฟล์แนบ = R2

## คำสั่ง
`pnpm dev` · `pnpm build` · `pnpm deploy` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e` · `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:seed`

**DoD ทุก task:** `typecheck + lint + test` เขียว + manual verify ผ่าน + ขึ้น CF preview ได้
