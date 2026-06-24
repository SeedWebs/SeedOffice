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
pnpm workspaces — `apps/web` (React+Vite+React Router+**Tailwind v4**) · `apps/api` (Hono บน Cloudflare Workers) · `packages/db` (Drizzle+D1) · `packages/core` (โดเมนล้วน pure, test ง่าย) · ไฟล์แนบ = R2

### Tailwind v4 ↔ mockup (v3) — ตารางแปลงตอน copy class
mockup.html เขียนด้วย v3 — เวลา copy class มาใช้ใน apps/web (v4) ต้องแปลง:
| mockup (v3) | apps/web (v4) |
|---|---|
| `shadow-sm` | `shadow-xs` |
| `shadow` | `shadow-sm` |
| `rounded-sm` | `rounded-xs` |
| `outline-none` | `outline-hidden` |
| `bg-gradient-to-*` | `bg-linear-to-*` |
| `ring` (เปล่า = 3px) | `ring-3` |
ธีม (brand palette + font) อยู่ที่ `apps/web/src/index.css` ใน `@theme` — ไม่มี tailwind.config.js
**Semantic design tokens** — neutral ramp ทั้งชุดอยู่ที่ `index.css` (`:root` + `@theme inline`), map 1:1 กับ slate (สีเท่าเดิม) ปรับรวมที่ `:root` ที่เดียว · **ทั้งแอปใช้โทเคนแล้ว ห้าม `slate-*` ในของใหม่** — ตอน copy จาก mockup ให้แปลง `slate-N` → โทเคนตามนี้:
| slate | token (util) | | slate | token (util) |
|---|---|---|---|---|
| 900 | `ink` | | 300 | `border` |
| 800 | `strong` | | 200 | `border-subtle` |
| 700 | `body` | | 100 | `divider` |
| 600 | `soft` | | 50 | `hover` |
| 500 | `dim` | | page bg | `var(--page)` |
| 400 | `muted` | | | |
ใช้ได้ทั้ง util (`text-ink`/`border-border`/`bg-hover`/`divide-divider`/`bg-ink/40`) และ `var(--ink)` ฯลฯ

**Functional/state colors** (ใน `@theme`, map 1:1, ใช้ผ่าน util `text-danger-600`/`bg-warning-100` ฯลฯ) — ตอน copy จาก mockup แปลง family ตามนี้: `rose-*`→`danger-*` · `amber-*`→`warning-*` · `emerald-*`→`success-*` · `sky-*`→`info-*`
**คงเป็นสีดิบ (ไม่ใช่ token):** จานสีสถานะโปรเจกต์ใน `lib/project-ui.ts` (`STATUS_COLOR_CLASSES` keyed ด้วย color · ตัวสถานะปรับเองได้ที่ตั้งค่า ดู §4.3 + core/project-status) + `HEALTH_DOT` · avatar palette ใน `pages/ProjectDetail.tsx` (`AVATAR_COLORS` — ตกแต่ง อิสระจาก token) · `white`/brand

## คำสั่ง
`pnpm dev` · `pnpm build` · `pnpm deploy` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e` · `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:seed`

**DoD ทุก task:** `typecheck + lint + test` เขียว + manual verify ผ่าน + ขึ้น CF preview ได้

## Team Progress Wiki — sync ทุกครั้งที่ทำงานสำคัญ

หลังทำงาน **สำคัญ** ใน SeedOffice (ฟีเจอร์ ship · ตัดสินใจ spec/scope · fix ที่ไม่ตรงไปตรงมา) → **อัปเดต hub ใน team wiki** ให้ทีมเห็นความคืบหน้าโดยไม่ต้องอ่าน diff · งานเล็ก/ยังไม่เสร็จ ข้ามได้

- **Wiki repo**: `git@github.com:SeedWebs/wiki.git` — Obsidian vault **แยกจาก repo นี้** (git history คนละอัน · กฏ "ถามก่อน deploy" ไม่ใช้กับ wiki)
- **Path ต่อคน** — แต่ละคน clone wiki คนละที่ จึง **ไม่ hardcode**: อ่านจาก env **`SEEDWEBS_WIKI_PATH`** (`echo "$SEEDWEBS_WIKI_PATH"` แล้วเอา absolute path ไปใช้กับ Read/Edit/Write — tool ไม่ expand `$VAR`)
  - **ถ้า `SEEDWEBS_WIKI_PATH` ว่าง/ไม่ตั้ง → ข้าม step wiki เงียบๆ ห้ามเดา path**
  - ตั้งครั้งเดียวใน `.claude/settings.local.json` (**gitignored**):
    ```json
    { "env": { "SEEDWEBS_WIKI_PATH": "/absolute/path/to/your/wiki" } }
    ```
    (env โหลดตอนเปิด session — ตั้งแล้ว reload)
- **Hub ของ repo นี้**: `<SEEDWEBS_WIKI_PATH>/projects/seedoffice/SeedOffice.md` (อ่าน `CONVENTIONS.md` ของ wiki ก่อนเขียน — โครง hub + §1.5 ดูแลไม่ให้รก + §1.6 marker)
- **เริ่มงาน/หยิบ task: รันเลข `T?` ใน hub ก่อนลงมือ** — เจอบรรทัด `T?` (ไอเดียที่ owner จดไว้ยังไม่ใส่เลข) ให้แทนด้วยเลขจริงตามกฎ **`next = max(backlog + 📓 Log) + 1`** (id ถาวร ห้าม reuse/renumber — ดู `CONVENTIONS.md` §1.5 ของ wiki) ไล่บนลงล่าง *ก่อน* เริ่มทำงาน → owner จดไอเดียได้ลื่นไม่ต้องคิดเลข, agent เป็นคนรันให้ (skip เงียบถ้า `SEEDWEBS_WIKI_PATH` ไม่ตั้ง)
- **วิธีเขียน**: สังเคราะห์ — *อะไรเปลี่ยน + ทำไม* ไม่ก็อป diff/spec · ลิงก์กลับ repo ด้วย **GitHub URL** (commit/PR/ไฟล์) ไม่ใช่ path เครื่อง
- **Commit ใน wiki repo**: `docs(seedoffice): <สรุป>` ลง `main` ตรงๆ (เอกสาร แรงเสียดทานต่ำ)
