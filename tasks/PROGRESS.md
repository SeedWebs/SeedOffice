# SeedOffice — Progress / Resume Note
> สำหรับ resume session ใหม่ (เขียนระหว่างทำ mockup)

## สถานะ
- **SPEC.md = Draft v0.9** — source of truth, sync กับ mockup แล้ว (coherent · + เอกสาร §4.16 + ลูกค้า/CRM §4.17 · + กฎ timer/เพดานชั่วโมง §4.5 + นโยบาย launch §13 — มิ.ย. 69)
- **CLAUDE.md มีแล้ว** — กติกา build (เงิน=สตางค์ ฯลฯ) สำหรับทุก session ใหม่
- **mockup.html = artifact ออกแบบหลัก** (clickable prototype)
  - รัน preview: `preview_start` ชื่อ **"mockup"** (มี `.claude/launch.json`, port 4321) → เปิด `/mockup.html`
  - มี **role switcher** (Owner/Member/Vendor) บน top bar ดำ ไว้เช็ค permission
  - verify การเปลี่ยนด้วย `preview_eval` (เช็ค DOM/computed style) + `preview_console_logs` (errors) + `preview_screenshot`
  - ✅ **รองรับมือถือแล้ว** (มิ.ย. 2569): drawer เมนูเลื่อนจาก**ขวา** + hamburger ในแถบขาว (real chrome ไม่ใช่แถบ MOCKUP) · dashboard "งานวันนี้" ซ้อน 2 บรรทัด · อีเมลกลาง single-pane · ตารางกว้าง scroll · padding มือถือ 12px — desktop เหมือนเดิม (ใช้ `sm:contents`/`sm:order`, จุดยุบ `lg`)
  - 🌐 **deploy แล้ว:** GitHub Pages → **https://seedwebs.github.io/SeedOffice/** (auto-deploy ทุก push เข้า `main` · มี `index.html` redirect → mockup)
- **tasks/plan.md + tasks/todo.md = แผน P1** — P1 = **T01–T18** (5 เฟส · 4 CP · T18 = D1 backup) + **Phase 6 (parallel): Docs D1–D3 + Clients/CRM C1–C3 (P1.x)** — **พร้อมเริ่ม build**
- **repo = public แล้ว** (github.com/SeedWebs/SeedOffice) + **MIT license** + README ใหม่ · ⚠️ ข้อมูล mockup **anonymize แล้ว**: ใช้ `owner@seedwebs.com` (ไม่ใช่ m@) + persona `@example.com` · git author = `...@users.noreply.github.com` (**อย่า commit ด้วย m@seedwebs.com**) · history squash เป็น commit เดียวตอนเปิด public

## หน้าใน mockup
- ✅ **ขัดเกลาแล้ว**: ภาพรวม (dashboard), โปรเจกต์ (timeline + cards + งานต่อเนื่อง + search ⌘K + project detail: ไทม์ไลน์ต่อ group + reorder toggle), **อีเมลกลาง** (Help Scout style: กล่อง multi-company + folder bar + list/detail + พาเนลอีเมลที่ผ่านมา + reply-from), **ค่าตอบแทน** (self 2 คอลัมน์ เวลา|เงิน + owner table รายได้/หัก/สุทธิ + CSV/ปิดงวด), **task detail** (checkbox เสร็จ + timer + ไฟล์ + comment + activity log)
- ✅ **ครบทุกหน้าหลัก** — **เงินสดย่อย** + **ตั้งค่า/admin** โครง OK (เจ้าของผ่านแล้ว) · *team hub/ปฏิทิน = P2, อีเมลกลาง = P3 (ทำตอนเฟสนั้น)*
- ✅ **เพิ่มใหม่ (P1.x · deploy แล้ว):** **เอกสาร** (tree sub-page + WYSIWYG เก็บ markdown + อัปรูป R2) · **ลูกค้า/CRM** (ยอดขายปีนี้/MRR/ค้างชำระ/ใกล้หมดอายุ + บริการต่อเนื่อง + โน้ตข้อควรจำ) · **search ⌘K** เพิ่มใน ลูกค้า/เอกสาร/อีเมลกลาง
- ✅ **review รอบ มิ.ย. 69:** vendor เห็นเมนู **ค่าตอบแทน (ของตัวเอง)** แล้ว (ค่าจ้าง − WHT 3% — ตรง SPEC §2) · pin CDN (`tailwindcss 3.4.17` + `lucide 1.17.0`) กัน mockup พังเอง

## ขั้นต่อไป
- ✅ **P2 เสร็จ (10 มิ.ย. 69):** เงินสดย่อย (อนุมัติ/คืนเงิน/CSV/รอเบิกใน payroll) · team hub (standup อัตโนมัติ+toggle เมื่อวาน · ปฏิทิน Day/Week/Month + event ตัดรอบ/จ่ายอัตโนมัติ + วันลา→presence) · **realtime presence = PresenceHub DO + WebSocket Hibernation** (start/stop เด้งสดข้ามเครื่อง) · PWA (manifest+icon) · UI dialog มี animation แทน confirm/prompt ทั้งระบบ (มี eslint guard)
  - เหลือใน P2 backlog: แจ้งเตือนภายใน — รอเคาะ email provider ตัวเดียวกับแจ้งเตือนชนเพดาน
  - ถัดไปตาม roadmap: **P3 อีเมลกลาง (Gmail)** = งานใหญ่ ต้องเคาะ OAuth scopes/quota ก่อนเริ่ม + GCal sync/ICS
- ✅ **P1.x เสร็จด้วย (10 มิ.ย. 69): เอกสาร D1–D3 + ลูกค้า/CRM C1–C3** — Docs = tree + Tiptap 3 (`@tiptap/markdown` official, autosave 800ms, รูป R2 ไม่รับ SVG) · CRM = list (การ์ดสรุป 4 ใบ/แท็บ/⌘K) + detail (เงิน derived สด/บริการต่อเนื่อง/โน้ต) — ยอดขายปีนี้นิยามจาก startDate ปีปัจจุบัน
- ✅ **P1 BUILD เสร็จทั้งหมด (10 มิ.ย. 69): T01–T18 · CP1–CP4** — ลูปเงินครบ: auth+role → users/rates/config → projects/clients/tasks (timeline/⌘K/drawer/R2/activity) → stars/QuickAdd/dashboard → timer+manual+เพดาน+integrity → milestones/payments → ค่าตอบแทน self+owner+CSV+ปิดงวด(ล็อกย้อนหลัง) → P&L+health → backup D1→R2 (cron 03:00) 
  - stack จริง: Vite 8 · React 19 · React Router 7 · **Tailwind 4.3** (ตารางแปลง class v3→v4 ใน CLAUDE.md) · Hono 4 · Drizzle 0.45 · wrangler 4.99 (jsonc) · vitest-pool-workers 0.16 (vitest 4 API ใหม่ — **ไม่มี isolated storage ต่อเทสต์แล้ว** เทสต์ต้องล้างตารางเอง)
  - เทสต์: core 36 unit + api 56 integration (workerd+D1 จริง) + e2e Playwright 5 (login 3 + ลูปเงิน 2) — เขียวครบ · CI เขียว
  - D1 จริงสร้างแล้ว (id ใน wrangler.jsonc) · local dev ใช้ sqlite ในเครื่อง · seed = dev เท่านั้น (launch จริง = fresh)
  - wrangler dev ตายถ้า reload เจอโค้ดครึ่งทาง (แก้ index.ts ให้ atomic) → restart preview "dev"
- ▶ **รอเจ้าของรีวิว CP4** แล้วค่อย: สร้าง Google OAuth client (GCP) → R2 bucket + `pnpm db:migrate:remote` → `pnpm deploy` (ask-first) → รันคู่ 1 งวดเทียบคิดมือ → เลิก Notion/Everhour
- ❓ **คำถามค้างถึงเจ้าของ** (จากการ build — มีสรุปท้าย session ด้วย):
  1. สูตรปัดเศษ: ปัดครึ่งขึ้นที่สตางค์ "ต่อ entry" (ยอดโปรเจกต์=ยอดจ่ายคน) — ตรงกับที่คิดมือไหม
  2. Google OAuth client id/secret — ต้องสร้างใน GCP console (redirect = {APP_URL}/api/auth/callback) แล้วใส่ secret
  3. Email provider แจ้งเตือนชนเพดาน (CF Email Sending ต้อง verify domain / Resend) — ตอนนี้ log อย่างเดียว จุดต่อ: apps/api/src/lib/notify.ts
  4. ค่า P1 ที่ผมตัดสินใจไว้ (ทักได้ถ้าไม่ตรงใจ): vendor คอมเมนต์ใน task ได้ (แนบไฟล์ไม่ได้) · timer ข้ามคืน split เที่ยงคืน · health = งบงวด active − งบงวด done · ปิดงวดบล็อก แก้/ลง/ลบเวลา+adjustment ของงวดนั้นทั้งหมด

## วิธีทำงานกับ user (สำคัญ)
- ตอบเป็น **ภาษาไทย** · ทำทีละจุดเล็กๆ ตามที่ขอ แล้ว verify ทุกครั้ง
- ปรับ mockup → reload preview → verify (eval/console/screenshot) → ค่อยรายงาน
- sync SPEC.md เป็นระยะเมื่อหน้านิ่ง (อย่าทำค้างเยอะ)

## decisions สำคัญ (เต็มที่ SPEC §13)
- เงิน = **integer สตางค์**, เวลา = **integer นาที**; การเงินเป็น **pure fn ใน packages/core** (test ก่อน)
- ความลับเดียว = **bonus + ยอดสุทธิ** (self+owner); **vendor** ไม่เห็นการเงิน/P&L/งบ
- งวดเงินเดือน **25→24** จ่าย 26; **เพดาน 8 ชม./วัน** (config); SeedOffice ไม่จ่ายเงินเอง (export CSV)
- โปรเจกต์ 2 ประเภท: **งานโปรเจกต์** (fixed-price) + **งานต่อเนื่อง** (recurring)
- manual% เห็นทั้งทีม (>10% สีส้ม); rate ประกาศ/เปิด, snapshot ลง time entry
- อีเมลกลาง + ticket = สร้างเอง (P3/future); คง **FlowAccount** (บัญชี/ภาษี)
- **กฎ timer (มิ.ย. 69):** ทีละตัวต่อคน · ชนเพดาน 8 ชม./วัน = **บล็อก** + เตือนเว็บ/อีเมล (อยากให้ทีมพัก) เกินจริงลง manual ย้อนหลัง · ข้ามคืน session ครบ 8 ชม. auto-stop
- **Launch (มิ.ย. 69):** ไม่ import Notion/Everhour — เริ่ม fresh ต้นงวด (วันที่ 25) · รันคู่ 1 งวดก่อนเลิกของเก่า · T18 backup ก่อนปิดงวดแรก
- IA: ภาพรวม · โปรเจกต์ · อีเมลกลาง · ค่าตอบแทน · เงินสดย่อย · ตั้งค่า (top bar + sidebar fixed, header+เนื้อหาเลื่อน)
