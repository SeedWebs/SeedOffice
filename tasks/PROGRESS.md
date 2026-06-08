# SeedOffice — Progress / Resume Note
> สำหรับ resume session ใหม่ (เขียนระหว่างทำ mockup)

## สถานะ
- **SPEC.md = Draft v0.7** — source of truth, sync กับ mockup แล้ว (coherent)
- **mockup.html = artifact ออกแบบหลัก** (clickable prototype)
  - รัน preview: `preview_start` ชื่อ **"mockup"** (มี `.claude/launch.json`, port 4321) → เปิด `/mockup.html`
  - มี **role switcher** (Owner/Member/Vendor) บน top bar ดำ ไว้เช็ค permission
  - verify การเปลี่ยนด้วย `preview_eval` (เช็ค DOM/computed style) + `preview_console_logs` (errors) + `preview_screenshot`
  - ✅ **รองรับมือถือแล้ว** (มิ.ย. 2569): drawer เมนูเลื่อนจาก**ขวา** + hamburger ในแถบขาว (real chrome ไม่ใช่แถบ MOCKUP) · dashboard "งานวันนี้" ซ้อน 2 บรรทัด · อีเมลกลาง single-pane · ตารางกว้าง scroll · padding มือถือ 12px — desktop เหมือนเดิม (ใช้ `sm:contents`/`sm:order`, จุดยุบ `lg`)
  - 🌐 **deploy แล้ว:** GitHub Pages → **https://seedwebs.github.io/SeedOffice/** (auto-deploy ทุก push เข้า `main` · มี `index.html` redirect → mockup)
- **tasks/plan.md + tasks/todo.md = แผน P1** — ✅ **refresh ตรง SPEC v0.7 แล้ว** · P1 = **T01–T17** (5 เฟส · 4 checkpoint) — **พร้อมเริ่ม build**
- **repo = public แล้ว** (github.com/SeedWebs/SeedOffice) + **MIT license** + README ใหม่ · ⚠️ ข้อมูล mockup **anonymize แล้ว**: ใช้ `owner@seedwebs.com` (ไม่ใช่ m@) + persona `@example.com` · git author = `...@users.noreply.github.com` (**อย่า commit ด้วย m@seedwebs.com**) · history squash เป็น commit เดียวตอนเปิด public

## หน้าใน mockup
- ✅ **ขัดเกลาแล้ว**: ภาพรวม (dashboard), โปรเจกต์ (timeline + cards + งานต่อเนื่อง + search ⌘K + project detail: ไทม์ไลน์ต่อ group + reorder toggle), **อีเมลกลาง** (Help Scout style: กล่อง multi-company + folder bar + list/detail + พาเนลอีเมลที่ผ่านมา + reply-from), **ค่าตอบแทน** (self 2 คอลัมน์ เวลา|เงิน + owner table รายได้/หัก/สุทธิ + CSV/ปิดงวด), **task detail** (checkbox เสร็จ + timer + ไฟล์ + comment + activity log)
- ✅ **ครบทุกหน้าหลัก** — **เงินสดย่อย** + **ตั้งค่า/admin** โครง OK (เจ้าของผ่านแล้ว) · *team hub/ปฏิทิน = P2, อีเมลกลาง = P3 (ทำตอนเฟสนั้น)*

## ขั้นต่อไป
- ✅ mockup ครบ + **รองรับมือถือ + deploy GitHub Pages** · ✅ SPEC v0.7 (coherent) · ✅ แผน P1 refresh (T01–T17)
- ▶ **เริ่ม build P1 ที่ T01** (monorepo scaffold) — stack: Cloudflare Workers + Hono + D1 + Drizzle + R2 · React + Vite + React Router + Tailwind (pnpm workspaces: apps/web, apps/api, packages/db, packages/core)
- ตรรกะการเงินทำใน `packages/core` (TDD) ก่อนเสมอ · review กับเจ้าของทุก checkpoint (CP1–CP4)

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
- IA: ภาพรวม · โปรเจกต์ · อีเมลกลาง · ค่าตอบแทน · เงินสดย่อย · ตั้งค่า (top bar + sidebar fixed, header+เนื้อหาเลื่อน)
