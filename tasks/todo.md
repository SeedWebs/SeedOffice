# SeedOffice — P1 Task List

> vertical slices เรียงตาม dependency · ทำจากบนลงล่าง · ภาพรวมที่ [plan.md](./plan.md) · สเปค [SPEC.md](../SPEC.md) v0.9
> ทุก task DoD = `typecheck + lint + test` เขียว + verify ผ่าน + ขึ้น preview ได้

---

## Phase 0 — Foundation

### ☐ T01 — Monorepo scaffold + tooling
**deps:** —
- pnpm workspaces: `apps/web` (Vite+React+React Router+Tailwind), `apps/api` (Hono Worker), `packages/db` (Drizzle), `packages/core` (pure)
- `wrangler.toml` + bindings: D1, R2, vars; worker เสิร์ฟ `/api/*` + static assets ของ SPA
- runners: ESLint, `tsc --noEmit`, Vitest; scripts `dev/build/deploy/lint/typecheck/test`
- **AC:** `pnpm dev` เปิด SPA + `GET /api/health` → 200 `{ok:true}`; `pnpm test` รันได้
- **Verify:** เปิด localhost เห็น SPA, curl /api/health ได้ ok; CI (lint/typecheck/test) เขียว

### ☐ T02 — DB foundation (Drizzle + D1) + config + seed
**deps:** T01
- schema เริ่มต้น: `users`, `sessions`, `rates`, **`company_config`** (cutoffDay=25, workHourCapMinutes=480) + migration แรก
- seed คล้าย mockup: owner (owner@seedwebs.com) + members (ปอนด์/น้ำ/ตูน/บีม/กร…) + vendor (สมชาย) + rates
- **AC:** migrate กับ local D1 ได้; seed insert ได้; query ผ่าน Drizzle; config อ่านได้
- **Verify:** `pnpm db:migrate` + `db:seed` สำเร็จ; drizzle studio เห็นตาราง/ข้อมูล

### ☐ T03 — Core money/time/cycle math (pure, TDD)
**deps:** T01
- `packages/core`: types สตางค์/นาที; `baseSatang(minutes, rateSatangPerHour)` + กฎปัดเศษ; `cycleOf(date, cutoffDay)` → `{start,end,payDate}` (≥25 → งวดถัดไป, ≤24 → งวดนี้); **`netOf(base, adjustments[])`** = base + Σincome − Σdeduction; `costSatang(entries)` + profit/margin; `capMinutes(perDay, cap)`
- **เขียนเทสต์ก่อน** ครอบ edge: วันที่ 24/25/26, สิ้นเดือน, ปัดครึ่งสตางค์, adjustment +/−, เกินเพดานชั่วโมง
- **AC:** ทุกฟังก์ชัน pure (รับ date เข้า ไม่มี Date.now ภายใน); coverage สูง; **สูตรปัดเศษ + net ยืนยันกับเจ้าของ**
- **Verify:** `pnpm test packages/core` เขียว; ตารางเทียบ 1 งวดจริง

---

## Phase 1 — Auth & identity  →  **CP1**

### ☐ T04 — Google OAuth + session (API)
**deps:** T02
- OAuth login/callback (Hono) → session ใน D1 + httpOnly secure cookie; logout (เพิกถอน)
- allow: domain `seedwebs.com` (member) + vendor allowlist; **email ที่ไม่ถูก provision = ปฏิเสธ**
- **AC:** อีเมล allowed → session; ไม่ allowed → 403; logout เพิกถอน session
- **Verify:** e2e login จริง 1 รอบ (manual) + integration mock OAuth ใน CI

### ☐ T05 — Frontend auth + protected routes + role nav
**deps:** T04
- auth context (`/api/me`), guard routes, **nav ตาม role** ตาม §2 (owner/member/vendor) — เมนู: ภาพรวม·โปรเจกต์·ค่าตอบแทน·(เงินสดย่อย P2)·ตั้งค่า; **role switcher บน top bar** (mock); logout
- **AC:** ไม่ login → เด้ง login; **vendor เห็นแค่ ภาพรวม + โปรเจกต์** (+ ค่าตอบแทนของตัวเอง), ไม่เห็นเมนูการเงินทีม
- **Verify:** login 3 role เห็น nav ต่างกันตาม mockup

### ☐ T06 — Role-guard middleware + audit log
**deps:** T04
- middleware ตรวจ role ต่อ endpoint; `audit_logs` + helper เขียน log
- **AC:** member ยิง endpoint owner-only → 403; **vendor ยิง P&L/payroll → 403**; action การเงินถูก log
- **Verify:** integration test สิทธิ์ครบ 3 role; ดู `audit_logs` มี record

> **CP1:** login ได้, role กัน nav + API ถูกต้อง + **e2e login (Playwright) เขียว** — รีวิวกับเจ้าของ

---

## Phase 2 — Users, rates & config

### ☐ T07 — Users CRUD + rates (effective-dated) + company config
**deps:** T06
- owner provision user (email, role, status); ตั้ง/แก้ **rate effective-dated** (เก็บประวัติ); self เห็น rate ตัวเอง
- หน้า **ตั้งค่า**: company config (วันตัดรอบ, เพดานชั่วโมง/วัน)
- **AC:** owner เพิ่ม user/ตั้ง rate (เปลี่ยน rate เก็บประวัติ ไม่ลบของเก่า); แก้ config ได้; non-owner ทำไม่ได้
- **Verify:** ตั้ง rate 2 ครั้ง → 2 records; member เปิดตั้งค่าไม่ได้

---

## Phase 3 — Projects → tasks  →  **CP2**

### ☐ T08 — Projects (2 ประเภท) + list (timeline / cards / table / search)
**deps:** T07
- `projects` (type project|recurring, status incl `archived`, quotedSatang, client, วันที่); CRUD
- **งานโปรเจกต์**: **timeline ภาพรวม** (12 ด. scroll-x, คอลัมน์ชื่อ/งบ฿K sticky, บาร์+เส้นวันนี้) + **cards** (สถานะ · avatar · ⚠️ **%จ่าย → wired ใน T14 · จุดสีกำไร/health → wired ใน T17** = placeholder ก่อน) ; **งานต่อเนื่อง**: ตารางทุกราย
- **ค้นหา/กรอง** lightbox (⌘K): active + archived + filter chips
- **AC:** สร้าง/แก้/ลิสต์ 2 ประเภท; **vendor เห็นชื่อ/สถานะ ไม่เห็นเงิน** (งบ/%จ่าย/กำไร); ค้นหาเจอทั้ง active+archived
- **Verify:** สร้างโปรเจกต์เห็นใน timeline+cards; สลับ vendor ไม่เห็นคอลัมน์เงิน; ⌘K ค้นเจอ

### ☐ T09 — Task groups + tasks (start/due, sortable) + project-detail timeline + checkbox
**deps:** T08
- `task_groups` + `tasks` (groupId, sortOrder, assignee, status, **estimate**, **startDate / dueDate**, ติดดาว); project detail: groups + tasks
- **โหมดจัดเรียง** (ปุ่มมุมขวาบน เปิด/ปิด grip — ปกติซ่อน) reorder group+task; **checkbox เสร็จ** (line-through); **task-group timeline** (บาร์ = `min(startDate)`–`max(dueDate)` ของ task ในกลุ่ม)
- **AC:** สร้าง/แก้/ลบ group+task; reorder persist; เช็คเสร็จ; timeline คำนวณช่วงจาก task start/due; assign member/vendor
- **Verify:** ลากเรียงแล้ว reload คงลำดับ; เช็ค task → done; vendor เห็น task แต่ไม่เห็น P&L

### ☐ T10 — Task detail: comments + attachments (R2) + activity log
**deps:** T09
- drawer: รายละเอียด + **comment** (`task_comments`) + **แนบรูป/ไฟล์ (R2)** (`task_attachments`) + **activity log** (กางได้, อ่านจาก `audit_logs`: สร้าง/แก้/มอบหมาย/สถานะ/comment · ลงเวลา/แก้เวลา จะโผล่เมื่อ T12/T13 มา)
- **AC:** comment โพสต์/แสดง; ไฟล์อัปขึ้น R2 + thumbnail + โหลดได้; activity แสดงเรียงเวลา
- **Verify:** อัปรูป+ไฟล์ → เห็น/โหลด; comment เรียงเวลา; ทำ action → ขึ้นใน activity

### ☐ T11 — Task stars (ทำวันนี้) + Quick Add + ภาพรวมส่วนตัว (ย่อ)
**deps:** T09
- `task_stars` (forDate); **Quick Add modal** (ปุ่ม + คีย์ **N**): project→group→title→ติดดาว
- **ภาพรวม (ย่อ, P1)**: **งานวันนี้** (task ติดดาว + ปุ่ม play/เวลา — *การเดินเวลาเชื่อมเมื่อ T12 พร้อม*) + **งานเร็วๆ นี้** (≤5) — *team hub (presence/standup/ปฏิทิน) = P2*
- **AC:** ติดดาว → ขึ้น "งานวันนี้"; Quick Add (N) สร้าง task ใน project/group ที่เลือก
- **Verify:** ติดดาว task → เห็นบนภาพรวม; กด N เพิ่ม task สำเร็จ

> **CP2:** จัดการงานครบ + timeline + ค้นหา (แทน Notion) — รีวิวกับเจ้าของ

---

## Phase 4 — Time tracking  →  **CP3**

### ☐ T12 — Time entries: timer + manual (จาก task)
**deps:** T09, T07 (rate), T03
- `time_entries` (+ `timer_sessions` สำหรับ timer เดินอยู่); ลงเวลาจาก task detail: timer start/stop + manual; **snapshot rate** ตอนสร้าง; edit + soft-delete
- แสดง **`H:MM:SS`** (ชั่วโมงหลักเดียว) + อ้าง **เพดานชั่วโมง/วัน** (config)
- **กฎ timer (SPEC §4.5)**: วิ่งทีละตัวต่อคน (start ใหม่ = auto-stop ตัวเดิม) · **ชนเพดานวัน = บล็อก** (timer auto-stop + เริ่มต่อไม่ได้) + **banner เว็บ + อีเมลแจ้ง** (เลือก provider: CF Email Sending/Resend — mock ใน CI) · ข้ามคืนรันต่อได้ จน **session ครบ 8 ชม. → auto-stop** · manual ย้อนหลังลงได้แม้วันนั้นชนเพดาน (เข้า manual%)
- **AC:** timer stop → entry มี rateSnapshot; manual ได้; แก้/ลบ (soft) ได้; **ทุก role รวม vendor ลงของตัวเองได้**; start timer ตัวที่ 2 → ตัวแรก stop + ได้ entry; ชั่วโมงวันแตะเพดาน → timer หยุด + จับต่อไม่ได้ + มี banner (+ อีเมล mock ถูกยิง)
- **Verify:** จับเวลา 1 รอบ + manual → เห็น entry + rateSnapshot ถูก; vendor ลงของตัวเองได้; จำลองชนเพดาน → ถูกบล็อก + เตือนโผล่

### ☐ T13 — Time audit + integrity metric (manual%)
**deps:** T12
- log manual/แก้/ลบ (ก่อน→หลัง) ลง `audit_logs`; คำนวณ **manual% ต่อคนต่องวด**; team-hours view + **flag สีส้ม >10%** (เห็นทั้งทีม) + จำนวนครั้งที่แก้
- **AC:** แก้เวลา → มี audit (before/after); manual% ตรงนิยามทั้งงวด; >10% ขึ้นสีส้ม
- **Verify:** สร้าง manual เกิน 10% ของงวด → แถวส้ม; แก้ entry → เห็น audit

> **CP3:** ลงเวลาได้ครบ (แทน Everhour) — รีวิวกับเจ้าของ

---

## Phase 5 — Milestones · ค่าตอบแทน · P&L  →  **CP4 = P1 done**

### ☐ T14 — Milestones + payments (per project)
**deps:** T08
- `milestones` (งบ/กำหนด/สถานะต่องวด) + `payments` (installment, จ่ายแล้ว/ยอด)
- **AC:** เพิ่ม/แก้งวดงาน + งวดจ่าย; คำนวณ **%ลูกค้าจ่ายแล้ว** (→ card T08) + งบต่องวด (→ P&L T17); owner+member เท่านั้น
- **Verify:** ใส่ payment → %จ่ายบน card อัปเดต; vendor ไม่เห็น

### ☐ T15 — ค่าตอบแทน (self view): สรุปเวลา + base + รายได้/หัก = สุทธิ
**deps:** T12, T07, T03
- `pay_adjustments` (kind: allowance|depreciation|bonus|other_income|sso|wht|other_deduction) + `pay_notes`; **base = core calc**; net = base + Σรายได้ − Σหัก
- หน้า self **2 คอลัมน์**: ซ้าย = **สรุปเวลาของฉัน** (ชั่วโมงงวด/วันนี้/เป้า/manual%/ตามโปรเจกต์) · ขวา = **โน้ตจากหัวหน้า** (ถ้ามี) + **ค่าตอบแทน** (รายได้−หัก=สุทธิ) + **เงินสดย่อยรอเบิกของตัวเอง** (P1 = ฿0/ซ่อน จนกว่า petty cash P2)
- **AC:** base/net ตรง core; **เจ้าตัวเห็นของตัวเองครบ**; **member ดู เงินพิเศษ/net/โน้ต คนอื่นไม่ได้ (server 403)**; vendor เห็นของตัวเอง (หัก ณ ที่จ่าย 3%)
- **Verify:** เทียบ base/net กับ core test; member B เปิดข้อมูล member A → ถูกปฏิเสธ

### ☐ T16 — ค่าตอบแทน (owner overview) + CSV + ปิดงวด + โน้ต
**deps:** T15
- หน้า owner: ตารางทั้งทีม (ชม. · manual% · **รายได้** เงินเดือน/เบี้ยเลี้ยง/ค่าสึกหรอ/เงินพิเศษ/อื่นๆ · **หัก** ปกส./ภาษี/อื่นๆ · **สุทธิ** · **โน้ต**); owner ใส่ `pay_adjustments` + **`pay_notes`** รายคน/รายงวด (**เงินพิเศษ + โน้ต = ลับ เห็นเฉพาะเจ้าตัว**)
- **export CSV** (ทำรายการธนาคารวันที่ 25) + **ปิดงวด → snapshot `payslips`** (breakdown + โน้ต, ไม่เปลี่ยนย้อนหลัง)
- **AC:** ตารางรวม + total ถูก; CSV ดาวน์โหลดได้; ปิดงวดสร้าง payslip; **non-owner เข้าไม่ได้**
- **Verify:** export เทียบยอด; ปิดงวด → payslips ถูกสร้าง; member เปิดหน้านี้ไม่ได้

### ☐ T17 — Project cost / profit (P&L)
**deps:** T12, T08, T14, T03
- cost = Σ(ชั่วโมง×rateSnapshot)/โปรเจกต์; profit = ราคาขาย − cost; margin; **กำไร/ขาดทุนต่องวด (milestone %)** + **%ลูกค้าจ่าย (payment)**; แถบ P&L ย่อ + **จุดสี health บน card** (เติมจาก placeholder T08)
- **AC:** cost/profit/margin ตรง core; owner+member เห็น; **vendor ไม่เห็น P&L เลย (server + UI)**; breakdown รายคนโชว์ **ชั่วโมง** (ไม่โชว์เงินรายคน)
- **Verify:** เทียบ cost กับ core; สลับ vendor → ไม่เห็นเงินทั้ง list + detail

### ☐ T18 — D1 backup (Cron → R2)
**deps:** T02 *(ทำได้ทุกเมื่อหลัง T02 — ต้องเสร็จก่อนปิดงวดจริงครั้งแรก)*
- Cron Trigger รายวัน: export D1 (ทุกตารางเวลา/การเงิน) → R2 พร้อม timestamp + retention (เช่นเก็บ 30 ชุดล่าสุด); log ผล/แจ้ง fail
- **AC:** backup ขึ้น R2 ตาม schedule; **ทดสอบ restore ลง local D1 สำเร็จ 1 ครั้ง** (ไม่ใช่แค่มีไฟล์)
- **Verify:** trigger cron ใน dev → object โผล่ใน R2; restore แล้ว query ข้อมูลครบ

> **CP4:** ลูปเงินครบ + backup ทำงาน + **e2e ลูปเงิน (login → ลงเวลา → เห็นเงิน → ปิดงวด) เขียว** → **P1 เสร็จ** — รีวิว + ตัดสินใจเข้า P2 (petty cash + team hub)
> **Cutover:** เริ่มใช้จริง**วันที่ 25 (ต้นงวด)** แบบ fresh — ไม่ import จาก Notion/Everhour · **รันคู่กับวิธีเดิม 1 งวดเต็ม** ยอดตรงกับคิดมือ → ค่อยเลิกของเก่า

---

## Phase 6 (parallel) — เอกสาร (Docs) + ลูกค้า (CRM)  [P1.x]

> **mockup เสร็จ + deploy แล้ว** (source of truth ดีไซน์ = mockup.html) · ทำขนานกับ P1, ไม่แตะ core การเงิน · vendor = 403 ทุก endpoint

### ☐ D1 — Docs: data model + tree CRUD API
**deps:** T02, T06
- `docs` (parentId→docs, sortOrder, title, contentMarkdown, createdBy/updatedBy, soft-delete `deletedAt`) + `doc_images`; routes: list-tree / get / create / update(autosave) / move(reparent+reorder) / delete(soft subtree); Zod + role-guard owner/member + audit
- **AC:** CRUD + nesting ผ่าน parentId + reorder/move persist; vendor → 403; soft-delete subtree; audit มี record
- **Verify:** สร้างหน้าซ้อน 2–3 ชั้น + reorder → reload คงอยู่; vendor ยิง API → 403

### ☐ D2 — Docs UI: tree + Tiptap (markdown) + autosave
**deps:** D1, T05
- nav "เอกสาร" (owner/member) + route 2 ฝั่ง (tree บนพื้นหน้า / editor การ์ดขาว); Tiptap = `starter-kit` + `link` + `task-list/item` + `placeholder` + **`@tiptap/markdown`**; โหลด md→parse, เซฟ `getMarkdown()` → **autosave debounce** + สถานะ
- scope: หัวข้อ **h2–h4** (title=h1), bold/italic/strike, bullet/ordered, checklist, blockquote, code, link (ตาราง = v1.1)
- **AC:** เมนูเห็นเฉพาะ owner/member; สร้าง/เปิด/แก้หน้า+หน้าย่อย; **markdown round-trip** (พิมพ์ rich → reload เหมือนเดิม); autosave + ตัวบอกสถานะ
- **Verify (preview):** สร้างหน้า+หน้าย่อย → พิมพ์ format → รอ autosave → reload เนื้อหาอยู่; row ใน D1 เป็น markdown; vendor ไม่มีเมนู

### ☐ D3 — Docs: image upload → R2
**deps:** D2 (สร้าง/ใช้ร่วม `apps/api/src/lib/r2.ts` กับ T10)
- `POST /api/docs/images` (multipart → validate mime/ขนาด → R2 → `{url}`) + `GET /api/docs/images/:key` (stream, auth-gate); Tiptap image + handler paste/drop/เลือกไฟล์ → insert `![](/api/docs/images/:key)`
- **AC:** วาง/ลาก/เลือกรูป → ขึ้น R2 → โผล่ใน editor → markdown มี URL → reload เห็นรูป; **ไม่รับ SVG** + เกินขนาด = reject; vendor → 403
- **Verify:** ลากรูปเข้า → เห็น; reload → ยังอยู่; ดู markdown มี image URL; object ใน R2

---

### ☐ (ใน T08) Clients entity
**deps:** —
- เพิ่ม `clients` table + เปลี่ยน `projects.clientName` → `clientId→clients` ตั้งแต่ตอนทำ T08 (เลี่ยง refactor) · seed ลูกค้าจาก mockup

### ☐ C1 — recurring_services + core aggregations (TDD)
**deps:** T08 (clients), T14 (payments), T03
- `recurring_services` (clientId, projectId?, category, period, amountSatang, nextDueDate, status); **pure fn ใน `packages/core`**: `totalQuoted/totalPaid/outstanding`, `mrr/arr`, `nextExpiry` (รับ `today` เข้า)
- **AC:** ทุก fn pure (ไม่มี Date.now); coverage edge (overdue, ใกล้หมดอายุ ≤30, ปี); ยอด integer สตางค์
- **Verify:** `pnpm test packages/core` เขียว; เทียบยอด 1 ลูกค้ากับ mockup

### ☐ C2 — Clients API (list/detail) + recurring/notes CRUD
**deps:** C1, T06
- `GET /api/clients` (list + aggregates), `GET /api/clients/:id` (detail: โปรเจกต์/payments/recurring/notes); `recurring-services` + `client_notes` CRUD; Zod + role-guard owner/member + audit
- **AC:** list/detail รวมยอดถูก (quoted/paid/outstanding/MRR/nextExpiry); **vendor → 403** ทุก endpoint; เพิ่ม/แก้ recurring + note ได้
- **Verify:** เทียบ aggregate กับ core; vendor ยิง → 403; เพิ่ม note → เห็นใน detail

### ☐ C3 — Clients UI (CRM)
**deps:** C2, T05
- nav "ลูกค้า" (owner/member) + **list**: การ์ดสรุป (ยอดขายปีนี้ · MRR/ARR · ต้องตามเงิน · ใกล้หมดอายุ) + แท็บ (ทั้งหมด/ต้องตามเงิน/ใกล้หมดอายุ) + ตาราง + **search (⌘K)**; **detail**: ติดต่อ + สรุปเงิน + โปรเจกต์ + บริการต่อเนื่อง (วันต่ออายุสี) + payments (overdue แดง) + **โน้ต/ข้อควรจำ** + อีเมล (placeholder → P3)
- **AC:** เมนู owner/member (vendor ไม่เห็น); list/detail ตรง core; overdue แดง · ใกล้หมดอายุส้ม; search เจอ + คลิกไปถูก
- **Verify (preview):** เปิดลูกค้า → ตาราง+การ์ด; คลิก → detail; เพิ่มโน้ต; vendor → ไม่มีเมนู

> **(P3)** email wire: ผูก `clients.contactEmail` ↔ `inbox_threads` → คอลัมน์/แท็บ "อีเมลล่าสุด" + อีเมลที่ผ่านมาใน detail
