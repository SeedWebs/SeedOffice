# SeedOffice — P1 Implementation Plan

> เป้าหมาย: ส่ง **ลูปเงิน P1** (task → time → money) ให้ทีม SeedWebs ลงมือทีละ slice
> อ้างอิง: [SPEC.md](../SPEC.md) (v0.9) · prototype: [mockup.html](../mockup.html) (ครบทุกหน้าหลัก + เอกสาร + ลูกค้า)
> สถานะ: **Draft v4** — ตรง SPEC v0.9 · + กฎ timer/เพดาน (T12) + T18 backup + E2E ผูก checkpoint + นโยบาย launch (ไม่ import · รันคู่ 1 งวด)

---

## 1. Goal & P1 scope

ครบลูป **งาน → ชั่วโมงที่ลง → เงิน** (ค่าตอบแทน + ต้นทุน/กำไรโปรเจกต์) → เลิก Notion + Everhour + คิดเงินเดือนมือ

**อยู่ใน P1:**
- **Auth** (Google) + role guard (owner/member/vendor)
- **Users & rates** (effective-dated) + **company config** (วันตัดรอบ 25, เพดานชั่วโมง/วัน 8)
- **Projects 2 ประเภท** (งานโปรเจกต์ fixed / งานต่อเนื่อง recurring) + **timeline ภาพรวม** + cards (สถานะ/%จ่าย/จุดสีกำไร) + **ค้นหา/กรอง** (⌘K, active+archived)
- **Milestones + payments** (→ %ลูกค้าจ่าย + กำไร/ขาดทุนต่องวด)
- **Task groups + tasks** (เรียงได้ + โหมดจัดเรียง) + **project-detail task-group timeline** + **checkbox เสร็จ**
- **Task detail**: รายละเอียด / แนบไฟล์ (R2) / comment / **activity log** / ลงเวลา
- **ติดดาว "ทำวันนี้"** + **Quick Add (N)** + **ภาพรวมส่วนตัวแบบย่อ** (งานวันนี้ + งานเร็วๆ นี้)
- **Time tracking**: timer + manual (จาก task) + rateSnapshot + `H:MM:SS` + เพดานชั่วโมง + audit + **manual% integrity**
- **ค่าตอบแทน**: base(คำนวณ) + รายการ **รายได้/หัก** (เบี้ยเลี้ยง/ค่าสึกหรอ/เงินพิเศษ/อื่นๆ − ปกส./ภาษี/อื่นๆ) = สุทธิ · self 2 คอลัมน์ (เวลา|เงิน) · owner team table · CSV · ปิดงวด→payslip
- **Project cost/profit** (P&L + milestone% + payment%)

**ไม่อยู่ใน P1:**
- เงินสดย่อย (petty cash) = **P2** · standup auto + dashboard team-hub (presence/ปฏิทิน) = **P2**
- อีเมลกลาง + GCal/ICS = **P3** · quote → FlowAccount = **P4** · ticket = **future**

> หมายเหตุ: หน้า **ภาพรวม** เต็มรูป (team hub) เป็น P2 — P1 ทำแค่ส่วนตัวแบบย่อ (งานวันนี้ + งานเร็วๆ นี้ + Quick Add)

---

## 2. Ground rules (ทุก task ต้องทำตาม)

- **เงิน = integer สตางค์, เวลา = integer นาที** — ห้าม float กับเงินเด็ดขาด
- **ตรรกะการเงิน** (base, รายได้/หัก→net, project cost, ปัดเศษ, pay-cycle, เพดานชั่วโมง) อยู่ใน **`packages/core` เป็น pure function เขียนเทสต์ก่อน (TDD)**
- ทุก task เป็น **vertical slice**: migration → API (Hono + Zod) → UI (React) → tests — รัน/เทสต์ได้เอง
- **Definition of Done**: `pnpm typecheck && pnpm lint && pnpm test` เขียว + manual verify ผ่าน + ขึ้น CF preview ได้
- **Privacy gate ที่ server เสมอ**: **เงินพิเศษ + ยอดสุทธิ = self + owner**; **vendor = ไม่เห็น P&L / payroll / rate ทีม** → permission test ต่อ endpoint
- **rate snapshot** ลงบน time entry ตอนสร้าง (เปลี่ยน rate ไม่ rewrite ประวัติ)
- ทุกการ **แก้/ลบเวลา + manual + การเงิน** → `audit_logs` (actor, เวลา, ก่อน→หลัง)
- migration **forward-only**; ทุกการเปลี่ยน schema = migration ใหม่; ไม่ hard-delete เวลา/การเงิน (soft-delete)
- **UI ทุกหน้า มี empty state + loading state** (เริ่มใช้จริงแบบ fresh ไม่ import — วันแรกข้อมูลว่าง ทุกหน้าต้องบอกว่า "เริ่มยังไง")
- คีย์ลัดเช็คจาก **`e.code`** (กันแป้นพิมพ์ไทย)

---

## 3. Dependency graph

```
T01 scaffold ─┬─ T02 db+config+seed ─┬─ T04 auth ── T05 fe-auth ─────────► (UI ทุกตัว)
              │                      └─ T06 role-guard + audit ──────────► (API ที่ป้องกัน)
              └─ T03 core-math (TDD) ─────────────────────────────► T12, T15, T16, T17

T06 ─ T07 users+rates+config ─ T08 projects(2 ปท.)+timeline+search ─┬─ T14 milestones+payments (→ เฟส 5)
                                                                    └─ T09 groups+tasks(start/due)+timeline+reorder+checkbox ─┬─ T10 task-detail (attach/comment/activity)
                                                                                                          └─ T11 stars/quickadd/ภาพรวมย่อ
T09 ─ T12 time-entries (timer/manual/cap, rateSnapshot) ─ T13 audit + integrity (manual%)
T12 + T07 + T03 ──────────── T15 ค่าตอบแทน self ── T16 owner overview (CSV / ปิดงวด→payslip)
T12 + T08 + T14 + T03 ─────── T17 project P&L (cost/profit + milestone% + payment%)

T02 ─ T18 D1 backup (Cron → R2) ── ทำได้ทุกเมื่อหลัง T02 · ต้องเสร็จก่อนปิดงวดจริงครั้งแรก (CP4)
```

---

## 4. Phases & checkpoints

| Phase | Tasks | ✅ Checkpoint (demo ได้) |
|------|-------|--------------------------|
| **0 Foundation** | T01–T03 | `pnpm dev` รัน SPA + `/api/health`; core-math (เงิน/เวลา/cycle/net) เทสต์เขียว |
| **1 Auth & identity** → **CP1** | T04–T06 | login Google ได้, role กัน nav + API (owner/member/vendor) + **e2e login เขียว** |
| **2 Users / rates / config** | T07 | owner เพิ่ม user/ตั้ง rate (มีประวัติ) + ตั้ง config (ตัดรอบ/เพดานชั่วโมง) |
| **3 Projects → tasks** → **CP2** | T08–T11 | จัดการงานครบ + timeline + ค้นหา (**แทน Notion**) |
| **4 Time tracking** → **CP3** | T12–T13 | ลงเวลา timer+manual จาก task + audit/manual% (**แทน Everhour**) |
| **5 ค่าตอบแทน + P&L** → **CP4 = P1 done** | T14–T18 | milestones/payments + ค่าตอบแทน งวด 25→24 (รายได้−หัก=สุทธิ) + ต้นทุน/กำไร + **backup (T18)** + **e2e ลูปเงินเขียว** (**ลูปเงินครบ**) |

> รีวิวกับเจ้าของที่ทุก checkpoint ก่อนไปเฟสถัดไป
> **Cutover (หลัง CP4):** เริ่มใช้จริง**ต้นงวด (วันที่ 25)** แบบ fresh (ไม่ import Notion/Everhour) → **รันคู่กับวิธีเดิม 1 งวดเต็ม (25→24)** → ยอดเงินเดือนตรงกับคิดมือ → ค่อยประกาศเลิก Notion/Everhour

---

## 5. Risks / notes

- **Cycle math (25→24)** = จุดเสี่ยงความถูกต้อง → TDD ใน core ก่อน (T03) รวม edge: วันที่ 24/25/26, สิ้นเดือน
- **โครงค่าตอบแทน**: base = คำนวณจากชั่วโมง; **รายได้/หักที่เหลือ (เบี้ยเลี้ยง/ค่าสึกหรอ/เงินพิเศษ/ปกส./ภาษี/อื่นๆ) = owner กรอกเป็น line item ต่อคนต่องวด** (`pay_adjustments`) เหมือนที่ทำมือทุกวันนี้ → P1 ไม่ auto-คำนวณ ปกส./ภาษี (อาจ auto-suggest ภายหลัง)
- **การปัดเศษเงินเดือน** ต้องตรงกับที่ทำมือ — ยืนยันสูตรกับเจ้าของใน T03
- **เพดานชั่วโมง/วัน + วันตัดรอบ** = company config (ไม่ hardcode) — ตั้งใน T07
- **milestone + payment** schema ออกแบบใน T09 (feed ทั้ง %จ่าย บน card และ P&L ต่องวด)
- **Google OAuth**: `@hono/oauth-providers` หรือ Arctic; verify domain + vendor allowlist ที่ server; mock ใน CI
- **D1 limits**: พอสำหรับ ~12 users; ไฟล์แนบไป R2
- **Realtime** (presence/timer ข้ามคน) เลื่อนไป P2 — P1 timer เป็น single-user (start→`timer_sessions`, stop→`time_entries`); UI เดินเลขเองฝั่ง client
- **กฎ timer (เคาะแล้ว · ดู SPEC §4.5)**: ทีละตัวต่อคน (start ใหม่ = stop เก่า) · ชนเพดาน 8 ชม./วัน = **บล็อก** + เตือนเว็บ/**อีเมล** (ต้องเลือก email provider ตอน T12 — Cloudflare Email Sending / Resend) · ข้ามคืน session ครบ 8 ชม. auto-stop · edge การแบ่ง workDate ข้ามวัน → เคาะใน T03 (TDD)
- **Launch**: ไม่ import ข้อมูลเก่า — seed (T02) ใช้แค่ dev/preview; production เริ่มว่าง → empty state สำคัญ (อยู่ใน ground rules แล้ว)
- **P2/P3 เลื่อนชัดเจน**: petty cash, team hub/presence/ปฏิทิน (P2), อีเมลกลาง (P3) — ไม่เบียดเวลา P1
- **เพิ่ม `tasks.startDate`** (คู่ `dueDate`) — จำเป็นต่อไทม์ไลน์ต่อ task group (T09: บาร์ = `min(start)`→`max(due)`)
- **T08 cards**: %จ่าย ติดใน **T14** · จุดสีกำไร/health ติดใน **T17** → T08 ทำ card shell + ส่วนที่ไม่ใช่เงินก่อน (placeholder)
- **Polish ตัดเป็น v1.1 ได้ถ้าเวลาบีบ** (ไม่กระทบลูปเงิน): timeline ภาพรวม (T08), timeline ต่อกลุ่ม (T09), ภาพรวม/dashboard (T11) — ทำเป็นงานท้ายเฟส

---

## 6. Parallel tracks — Docs + Clients/CRM (P1.x)

> 2 ฟีเจอร์เพิ่มทีหลัง — **mockup เสร็จ + deploy แล้ว** (ดู mockup.html: เมนู เอกสาร + ลูกค้า) · ทำขนานหลัง P1 foundation, ไม่แตะ core การเงิน · รายละเอียด task ใน [todo.md](./todo.md)

### Docs (เอกสาร) — deps: T02 (db), T06 (role-guard), reuse R2 ของ T10 · เริ่มหลัง **CP1**
- **D1** `docs`(parentId tree, soft-delete) + `doc_images` + CRUD API (Zod · role-guard owner/member · audit)
- **D2** UI tree + Tiptap (`starter-kit`+`link`+`task-list`+`@tiptap/markdown`) + autosave · เก็บ markdown
- **D3** อัปรูป R2 (upload+serve endpoint · paste/drop/เลือกไฟล์ → `![](/api/docs/images/:key)`) · ไม่รับ SVG

### Clients/CRM (ลูกค้า) — deps: T08 (projects), T14 (payments) · หน้า CRM หลัง **CP4**
- **(ใน T08)** สร้าง `clients` entity + project ผูก `clientId` แต่แรก (เลี่ยง refactor ภายหลัง)
- **C1** `recurring_services` + **core aggregations (pure, TDD)**: totalQuoted/paid/outstanding · MRR/ARR · nextExpiry (รับ `today` เข้า ไม่มี Date.now)
- **C2** Clients API: `/api/clients` (list+aggregates, detail) · `/api/recurring-services` CRUD · `/api/client-notes` · role-guard owner/member (vendor 403) · audit
- **C3** Clients UI: nav + list (การ์ดสรุป + แท็บ + ตาราง + search ⌘K) + detail (โปรเจกต์/payments/บริการต่อเนื่อง/โน้ต)
- **(P3)** ผูก client ↔ inbox threads → คอลัมน์/แท็บ "อีเมลล่าสุด"

> **DoD** = เท่า task อื่น (`typecheck + lint + test` เขียว + verify + CF preview) · **privacy gate vendor = 403 ทุก endpoint** (ข้อมูลยอดขาย/เอกสารภายใน)
