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
- ✅ **ถอนโดเมนบริษัทออกจากโค้ด (10 มิ.ย. 69 — repo public):** member auto-provision อ่านจาก **`memberDomain` ใน company_config** แทน hardcode (migration 0013 — default `'@seedwebs.com'` ตอน migrate กัน production เดิมพัง · ว่าง = ปิด auto-provision) · แก้ได้ที่ ตั้งค่า → ค่าบริษัท (owner · Zod validate trim/lowercase) · Login เปลี่ยนเป็นข้อความ generic (หน้า pre-login ไม่ยิง config) · seed + test fixtures → `@example-co.test` (helper seed config ให้ทุกเทสต์ + เทสต์ใหม่พิสูจน์ auto-provision ตาม config/ปิดได้)
- ✅ **P2 เสร็จ (10 มิ.ย. 69):** เงินสดย่อย (อนุมัติ/คืนเงิน/CSV/รอเบิกใน payroll) · team hub (standup อัตโนมัติ+toggle เมื่อวาน · ปฏิทิน Day/Week/Month + event ตัดรอบ/จ่ายอัตโนมัติ + วันลา→presence) · **realtime presence = PresenceHub DO + WebSocket Hibernation** (start/stop เด้งสดข้ามเครื่อง) · PWA (manifest+icon) · UI dialog มี animation แทน confirm/prompt ทั้งระบบ (มี eslint guard)
  - เหลือใน P2 backlog: แจ้งเตือนภายใน — รอเคาะ email provider ตัวเดียวกับแจ้งเตือนชนเพดาน
- ✅ **P3 E5 เสร็จ (11 มิ.ย. 69): โน้ตภายใน/tags/canned/snooze/collision** — inbox ครบฟีเจอร์ตาม SPEC §4.12 แล้ว (เหลือ E6 GCal/ICS เป็นคนละฟีเจอร์) · collision = InboxThreadHub DO ราย thread (WS Hibernation + migration v2 — **deploy ครั้งหน้า DO ใหม่ขึ้นเอง ไม่ต้องทำอะไรเพิ่ม**) · snooze ปลุกใน cron นาที · ทดสอบส่งจริงผ่านแล้ว (compose → m@ ได้รับ + threading โครงสร้างครบ)
- ✅ **P3 E4 โค้ดเสร็จ (11 มิ.ย. 69): ตอบ/compose ผ่าน Gmail API** — mime.ts (RFC2047 ไทย + threading In-Reply-To/References ดึง header สดจาก Gmail ตอนตอบ) · reply = ส่งจาก address กล่อง (To=Reply-To ?? From · Cc ตัดตัวเอง) เข้า thread เดิม · compose = thread ใหม่ผูก gmailThreadId มอบหมายคนส่ง · UI ช่องตอบ + modal — เทสต์ mock 162 เขียว · ⚠️ **รอเจ้าของอนุมัติทดสอบส่งจริง 1 ฉบับ (กฎ §11 ask-first)** แล้วค่อยไป E5 (โน้ต/tags/collision/canned)
- ✅ **P3 E3 เสร็จ (11 มิ.ย. 69): หน้าอีเมลกลางตัวจริง** — API teamOnly (vendor 403 ทุกเส้น · permission split ชัดจาก settings) + UI ตาม mockup ครบ: folder bar/ตัวเลือกกล่อง+badge/ตาราง/detail (iframe sandbox กัน XSS · ไฟล์แนบ lazy โหลดจาก Gmail แล้ว cache R2 · การ์ดลูกค้าเทียบ CRM ด้วย contactEmail · อีเมลที่ผ่านมา) + เปลี่ยนสถานะ/มอบหมาย/mark read — verify กับ 42 threads จริง · เลขที่ thread = rowid · **ถัดไป: E4 ตอบ/compose (ส่งจริงต้อง ask ตาม §11)**
- ✅ **P3 E2 ทดสอบกับ Gmail จริงผ่าน (11 มิ.ย. 69):** เชื่อม SW Support สำเร็จจาก localhost (client Internal จริง) — backfill 50 ฉบับ → 42 threads (in 31/out 19) · body → R2 ครบ · แนบ 7 · หัวข้อไทย/อีโมจิถอดถูก 100% ไม่มี RFC2047 ค้าง · sync รอบสอง (history จริง) ผ่าน · **เคาะจากข้อมูลจริง: backfill ดึงทั้งกล่อง** (เดิม INBOX-only ได้ 0 เพราะทีมเคลียร์กล่องหมด — ของเก่าเข้าเป็น closed/อ่านแล้ว) · APP_URL prod = office.seedwebs.com · เหลือ: เชื่อม SW Account + SG Info (รอ client ฝั่ง SG) → ทำได้เองผ่าน ตั้งค่า
- ✅ **P3 E2 เสร็จ (11 มิ.ย. 69): sync ขาเข้าอีเมลกลาง** — cron ทุก 1 นาที (gate แยก ไม่ลาก sweep ไปด้วย) · initial backfill ~50 หลังเชื่อม (waitUntil ใน callback) · history.list incremental + 404 fallback ตามช่วงเวลา · เมลเข้า thread closed/snoozed = เปิดใหม่+unread · SPAM→spam, TRASH/DRAFT ข้าม · body → R2 เสมอ (contentType ใน R2 metadata) · attachment เก็บ metadata โหลด lazy ตอน E3 · token ถูกเพิกถอน → กล่อง disconnected + lastError แนะทางแก้ · ปุ่ม sync/เวลาล่าสุด/error ใน ตั้งค่า — idempotent ทั้งสาย (cron ทับซ้อนได้) · **ถัดไป: E3 UI inbox (list+detail+folder bar)**
- ✅ **P3 E1 เสร็จ (10 มิ.ย. 69): ติดตั้งอีเมลกลาง** — schema `inbox_google_clients`+`inbox_mailboxes` (0012) · crypto AES-GCM (`INBOX_ENC_KEY` — **ต้อง `wrangler secret put` ก่อน deploy**, มีใน .dev.vars.example) · API owner-only (settings/clients/mailboxes + connect/callback — email จากบัญชีที่ consent จริง, กันเชื่อมซ้ำ, กัน scope หาย, ย้าย client ของกล่องได้) · UI ตั้งค่า → อีเมลกลาง ครบ empty/loading/banner · เทสต์ 21 ตัวเขียว — **ถัดไป: E2 sync ขาเข้า (Cron + History API)** · เมื่อเจ้าของได้ client id/secret จาก GCP (2 บริษัท) → วางในหน้า ตั้งค่า ได้เลยไม่ต้องแตะโค้ด
  - ถัดไปตาม roadmap: ~~P3 อีเมลกลาง~~ → เหลือ E2–E6 + GCal sync/ICS — **เคาะ Gmail auth แล้ว (10 มิ.ย. 69, ดู SPEC §5):** OAuth ราย mailbox ผ่าน client Internal 2 ตัว (SW/SG **คนละ Workspace** · กล่องทั้ง 3 เป็น user จริงครบ ไม่ต้องซื้อ license เพิ่ม) · scope `gmail.modify` ตัวเดียว · quota default พอ (polling ใช้ไม่กี่ unit/นาที) · **รอเจ้าของ: สร้าง GCP project 2 ตัว (ใต้ org SW + SG) + enable Gmail API + client id/secret** — ขั้นตอนละเอียดอยู่ในแชต 10 มิ.ย. 69 · **เคาะเพิ่ม: ติดตั้งเมลทั้งหมด = หน้า ตั้งค่า** (client id/secret + กล่อง เก็บเข้ารหัสใน D1 ไม่ hardcode — repo public) → client ของ inbox **ไม่ต้องใส่ wrangler secret** เก็บไว้ก่อนแล้ววางในหน้า ตั้งค่า เมื่อ P3 task แรกเสร็จ
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
