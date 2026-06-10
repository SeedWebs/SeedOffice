# SeedOffice — Specification

> Internal tool ของทีม **SeedWebs** (web agency, ~10 คน + vendor)
> เชื่อมงาน → เวลา → เงิน ไว้ในระบบเดียว
> สถานะ: **v0.9 — P1 + P1.x + P2 build เสร็จ (T01–T18 · Docs · CRM · petty cash · team hub · realtime DO+WS · PWA)** — รอรีวิว + deploy/cutover · เหลือเคาะ: OAuth credentials · email provider · ดูคำถามใน tasks/PROGRESS.md

---

## 1. Objective

ระบบกลางตัวเดียวที่ทำให้ลูป **task → ชั่วโมงที่ลง → เงิน** ไหลต่อกันได้:

- **task → time**: assign งาน ติดตาม แล้วลงเวลาในงานนั้นโดยตรง
- **time → payroll**: เงินเดือน = ชั่วโมง × rate (man-hour) + เงินพิเศษ (discretionary) คำนวณให้อัตโนมัติ เห็นใกล้ realtime
- **time → project P&L**: ชั่วโมง × rate = ต้นทุนแรงของโปรเจกต์ → เทียบราคาขาย = กำไร/ขาดทุน + ความคืบหน้า

**สิ่งที่มาแทน:** Notion (PM) + Everhour (จับเวลา) + การคิดเงินเดือน manual
**สิ่งที่ไม่ทำ (เชื่อม/คงไว้):** บัญชี + เอกสารภาษี (คง **FlowAccount** เป็น system of record)
**สิ่งที่จะสร้างเพิ่ม (เฟสหลัง):** "อีเมลกลาง" (shared inbox บน Gmail, ทำ UX/UI เอง) → ต่อยอดเป็น ticket system บนเว็บ เพื่อความ seamless

### Success criteria (v1)
- ทีมเลิกใช้ Notion + Everhour ได้จริง
- ปิดเงินเดือนรายเดือนในระบบได้ภายในไม่กี่นาที (จากเดิมทำมือ)
- ทุกโปรเจกต์ที่ active เห็นต้นทุนสะสม vs ราคาขาย ได้ตลอดเวลา
- Vendor ลงเวลาเองได้ โดยไม่เห็นข้อมูลการเงินภายใน

---

## 2. Users, Roles & Permissions

### Roles
| Role | ใคร | สรุปสิทธิ์ |
|------|-----|-----------|
| **owner** | เจ้าของ (owner@seedwebs.com) | เห็น/ทำได้ทุกอย่าง + ตั้ง rate, เงินพิเศษ, payroll, จัดการ user |
| **member** | พนักงาน SeedWebs (~10) | เห็นข้อมูลทีมทั้งหมด (รวม P&L) ยกเว้นเงินพิเศษ+ยอดสุทธิของคนอื่น |
| **vendor** | external contractor (login ด้วย Gmail) | เห็น task ทั้งหมด + ลงเวลาของตัวเอง ไม่เห็นการเงินภายในเลย |

### Permission matrix
| ข้อมูล | owner | member | vendor |
|--------|:-----:|:------:|:------:|
| Tasks (ดู/แก้, ทุกโปรเจกต์) | R/W | R/W | **R** (ลงเวลาได้ทุก task) |
| Projects (ชื่อ/สถานะ/รายละเอียดงาน) | R/W | R | R (ข้อมูลพื้นฐาน) |
| Time entries — ของตัวเอง (timer + manual) | R/W | R/W | R/W |
| ชั่วโมงที่ลง (รายวัน/ราย task) — ของคนอื่น | R | R *(ไว้ cross-check)* | ❌ |
| Rate — ของตัวเอง | R/W | R | R |
| Rate — ของคนอื่น (ภายในทีม) | R/W | R *(ประกาศอยู่แล้ว)* | ❌ |
| **เงินโปรเจกต์** (งบ/ราคาขาย · % ลูกค้าจ่าย · ต้นทุน/กำไร/margin) | R | R | ❌ |
| เงินเดือน base (ตัวเงิน) — ตัวเอง | R | R | R |
| เงินเดือน base (ตัวเงิน) — ของคนอื่น | R | ❌ *(เห็นแค่ชั่วโมง)* | ❌ |
| **เงินพิเศษ (bonus) + ยอดสุทธิ — ตัวเอง** | R/W | **R (เฉพาะตัวเอง)** | n/a |
| เงินพิเศษ + ยอดสุทธิ — ของคนอื่น | R | ❌ | ❌ |
| Time integrity (manual %, แก้เวลา) | R/W | R *(ทั้งทีม — UI เพิ่มภายหลัง)* | ของตัวเอง |
| Payroll overview (ทั้งทีม) | R/W | ❌ | ❌ |
| Petty cash — ลงของตัวเอง | R/W | R/W | ❌ |
| Petty cash — ดูทั้งหมด/อนุมัติ | R/W | R (เฉพาะของตัวเอง) | ❌ |
| สรุปงานประจำวัน/standup (ในกล่องทีมงาน) | R/W | R/W | ❌ |
| Admin (user, role, rate, bonus, อนุมัติ) | R/W | ❌ | ❌ |
| **เอกสาร (Docs)** — ดู/เขียน | R/W | R/W | ❌ |
| **ลูกค้า / CRM** (ข้อมูลลูกค้า · บริการต่อเนื่อง · โน้ต) | R/W | R/W | ❌ |
| **อีเมลกลาง** (shared inbox) [P3] | R/W | R/W | ❌ |

**กฎความลับ/การแสดงผลของระบบ:**
- **ความลับจริง** (เจ้าตัว + owner เท่านั้น): *เงินพิเศษ (bonus)* + *ยอดสุทธิ (base + bonus)*
- **กฎการแสดงผล**: ไม่โชว์ *ตัวเงิน base* ของคนอื่น — โชว์แค่ **ชั่วโมง** (rate ประกาศอยู่แล้วก็จริง แต่ UI ตั้งใจไม่เอาเงินรายคนมาโชว์)
- **เปิดให้ทีมเห็น**: rate, **ชั่วโมงที่ทุกคนลง (รายวัน/ราย task)** — ตั้งใจให้โปร่งใสไว้ cross-check กัน, และ Project P&L (ยอดรวม)

---

## 3. Scope

### สร้างเอง (in scope)
PM (โปรเจกต์ 2 ประเภท: งานโปรเจกต์ + งานต่อเนื่อง · task groups/tasks) · time tracking · ค่าตอบแทน (man-hour + รายได้/หัก) · project cost/profit · standup (บน ภาพรวม) · petty cash · **"อีเมลกลาง" บน Gmail (P3)** · quote builder → FlowAccount (P4) · **ticket system (future)**

### ไม่สร้าง (integrate / keep)
- **บัญชี + เอกสารภาษี** (ใบกำกับ/ใบเสร็จ/e-Tax/WHT/VAT) → คง **FlowAccount** เป็น system of record

> หมายเหตุ: shared inbox เดิมเสนอให้ใช้ Gmail-native tool (Hiver/Gmelius) แต่ทีมเคยใช้แล้วไม่ประทับใจ + อยากคุม UX/UI เอง + วางแผนต่อยอด ticket system → **ตัดสินใจสร้างเอง** (รับทราบว่าเป็น module ใหญ่ ดู §13 risks)

### Non-goals (v1)
- ไม่มี client login / client portal *(อาจมีตอนทำ ticket system เฟสอนาคต)*
- ไม่มี native mobile app (เน้น responsive web)
- ไม่ออกเอกสารภาษีเอง
- ไม่มีระบบ stock/สินค้า

---

## 4. Core Features & Acceptance Criteria

> แท็ก phase: **[P1]** = MVP, **[P2]** = ตามมา, **[P3]** = อนาคต
> **IA:** เมนูหลัก = **ภาพรวม · โปรเจกต์ · ลูกค้า · เอกสาร · อีเมลกลาง · ค่าตอบแทน · เงินสดย่อย · ตั้งค่า** — งาน/เวลา อยู่ใน "โปรเจกต์" ทั้งหมด (ไม่มีหน้า Tasks/ลงเวลา/Standup แยก; standup อยู่บน ภาพรวม) · **ลูกค้า/เอกสาร = owner+member (vendor ❌)**
> **Header:** top bar (role switcher) + sidebar = **fixed** · header แต่ละหน้า (h1 + ปุ่ม action) + เนื้อหา = เลื่อนไปด้วยกัน · หน้า **ภาพรวม ไม่มี header** · scrollbar ซ่อน (สไตล์ macOS) · border ใช้ slate-200

### 4.1 Auth & Users [P1]
- [ ] Login ด้วย Google (OAuth/OIDC); session แบบ httpOnly cookie + token ใน D1 (เพิกถอนได้)
- [ ] User ถูก provision โดย owner (email + role); email ที่ไม่อยู่ในระบบ login ไม่ได้
- [ ] Member auto-allow จาก domain `seedwebs.com`; vendor = allowlist อีเมลภายนอกที่ owner เพิ่ม
- [ ] เปลี่ยน role / ปิดการใช้งาน user ได้ (owner)

### 4.2 People & Rates [P1]
- [ ] แต่ละ user มี rate (บาท/ชั่วโมง) แบบ **effective-dated** (เก็บประวัติ)
- [ ] เปลี่ยน rate ได้ แต่ **ไม่ย้อนหลัง**: time entry ที่ลงไปแล้ว ใช้ rate ที่ snapshot ไว้ตอนลง
- [ ] owner แก้ rate ได้; member/vendor เห็น rate ตัวเอง

### 4.3 Projects (2 ประเภท) [P1]
**A. งานโปรเจกต์** (มีกำหนดส่ง · ~6-10 active) — **fixed-price**
- [ ] ฟิลด์: ชื่อ, โลโก้, รหัส, ลูกค้า, สถานะ (Dev/Design/Staging/Go Live/MA — อัปเดตเองได้), **ราคาขาย (งบ)**, วันเริ่ม/กำหนดส่ง
- [ ] **Timeline** บนสุด (ไม่มี tab): คอลัมน์ซ้าย (โลโก้/ชื่อ-ลิงก์/งบ **฿K**) **sticky**, เลื่อน scroll-x ดูทั้งปี (12 เดือน · ข้ามปีโหลดต่อ); บาร์สถานะตามช่วงวัน + **tooltip วันเริ่ม–สิ้นสุด** + เส้น "วันนี้"
- [ ] **Card** (3 คอลัมน์): โลโก้ + ชื่อ + แถวใต้ชื่อ = (สถานะ · **% ลูกค้าจ่ายแล้ว** · **จุดสีกำไร/ขาดทุน**) + avatar ทีม
- [ ] **คลิกเข้า = จัดการงาน** เป็นหลัก (P&L เป็นแถบย่อ hover ดูตัวเลข); **vendor ไม่เห็นตัวเลขเงิน** (งบ/payment/กำไร)
- [ ] **ค้นหา/กรองโปรเจกต์**: ไอคอน 🔍 (หรือ **⌘K**) → lightbox ค้น **ทั้ง active + archived** + filter chips (ทั้งหมด/กำลังทำ/งานต่อเนื่อง/archived)

**B. งานต่อเนื่อง** (เดิม "MA" · ดูแลรายเดือน/ปี · ~30-50 ราย) — **recurring**
- [ ] แสดงเป็น **ตาราง** (แสดงทุกราย คลิกเข้าได้ ไม่ scroll ซ้อน): ชื่อโปรเจกต์ + **todo ที่เปิดอยู่** + กำหนดส่ง + ค้างที่ใคร
- [ ] **เรียงตาม todo ที่ต้องส่งก่อน**; รายที่ไม่มี todo ค้างไหลลงล่าง
- [ ] billing = recurring (รายเดือน/ปี) — ไม่ใช่ fixed-price

### 4.4 Tasks & Task Groups [P1]
> งานอยู่ใน "โปรเจกต์" ทั้งหมด — **ไม่มีหน้า Tasks แยก**
- [ ] task อยู่ใต้ **task group** (สร้าง/แก้ชื่อเองได้); เรียงลำดับ **group และ task** ได้ — มี **ปุ่ม "จัดเรียง" (มุมขวาบน ถัดจาก progress)** เปิด/ปิดโหมด, **ปกติซ่อน grip handle** (กันลากโดน)
- [ ] **ไทม์ไลน์ต่อ task group** (Gantt บน project detail): แต่ละแถว = task group, บาร์ = **`min(task.startDate)` → `max(task.dueDate)`** ในกลุ่ม + เส้น "วันนี้" + tooltip ช่วงวัน (ตัวอย่าง: Design · Frontend · Backend · Staging · UAT · Go Live · MA)
- [ ] task: title, รายละเอียด, ผู้รับผิดชอบ, สถานะ, priority, estimate (นาที), กำหนดส่ง, **ติดดาว "ทำวันนี้"**
- [ ] assign ให้ member/vendor; vendor เห็นทุก task และลงเวลาได้
- [ ] **คลิก task → task detail**: รายละเอียด, **แนบรูป/ไฟล์ (R2)**, **comment**, time entries + ปุ่มลงเวลา (timer/manual) · **checkbox ใหญ่หน้าชื่อ** (กดเสร็จ → line-through + สถานะ "เสร็จแล้ว") · **activity log** (ซ่อน คลิกกาง แบบ ClickUp — สร้าง/แก้/มอบหมาย/เปลี่ยนสถานะ/ลงเวลา/แก้เวลา · เชื่อม `audit_logs`)
- [ ] **Quick Add task (modal)** จากทุกหน้า (ปุ่ม + คีย์ลัด **N**): พิมพ์ชื่อ → เลือก project → group → ติดดาว "ทำวันนี้"; (inline add ใช้ตอนเพิ่มใต้ group ในหน้า project ที่รู้ context แล้ว)

### 4.5 Time Tracking [P1]
- [ ] ลงเวลา **จากในหน้า task** (timer start/stop หรือ manual) — **ไม่มีหน้า "ลงเวลา" แยก**; ทุก role รวม vendor ลงได้
- [ ] time entry ผูกกับ task (→ project), เก็บ: user, วันที่, นาที, โน้ต, **rateSnapshot**, source(timer/manual)
- [ ] แก้/ลบ entry ของตัวเองได้ (ลบ = soft-delete); owner แก้ของใครก็ได้
- [ ] **ทุกการลง manual และทุกการแก้/ลบเวลา ถูก log** (ใคร, เมื่อไหร่, ค่าก่อน→หลัง) ลง `audit_logs`
- [ ] **Time integrity metric** (เห็นทั้งทีม): % เวลาที่ลงแบบ manual เทียบเวลารวม **ทั้งงวด** ต่อคน → ถ้า **> 10% ขึ้น flag สีส้ม** (แค่เปลี่ยนสี ไม่ระบุข้อความว่ามีปัญหา); แสดงจำนวนครั้งที่แก้เวลาด้วย
- [ ] ระหว่าง timer ทำงาน UI เดิน **ตัวเลขเวลา** เอง (realtime เน้นเวลา ไม่โชว์เงิน); metric **manual% เห็นทั้งทีม** (ตอนนี้มีในตาราง payroll; UI ฝั่งทีมเพิ่มภายหลัง)
- [ ] แสดง **เวลาที่ใช้ต่อ task ต่อวัน** เป็น `H:MM:SS` (ชั่วโมงหลักเดียว); **เพดานชั่วโมง/วัน** ตั้งค่าได้ระดับบริษัท (default **8 ชม./วัน**)
- [ ] **Timer วิ่งได้ทีละตัวต่อคน** — start งานใหม่ = auto-stop ตัวเดิม (บันทึกเป็น entry ปกติ)
- [ ] **ชนเพดานชั่วโมง/วัน → บล็อก**: timer auto-stop และเริ่มจับเวลาต่อในวันนั้นไม่ได้ + **เตือนบนเว็บ + ส่งอีเมล** (เจตนา: อยากให้ทีมพัก) · ชั่วโมงที่ทำเกินจริง → ลง **manual ย้อนหลัง** ได้ (นับเข้า manual% + audit ตามปกติ)
- [ ] **Timer ข้ามคืนไม่ตัดที่เที่ยงคืน** — รันต่อได้ (เผื่อวันนั้นเริ่มงานเย็น) แต่ **auto-stop เมื่อ session ครบ 8 ชม.**; การแบ่งนาทีลง workDate ตอนข้ามวัน (split เที่ยงคืน หรือเข้าวันที่เริ่ม) เคาะตอน T03 (TDD)

### 4.6 "สรุปงานประจำวัน" (standup) — รวมในกล่อง "ทีมงาน" บน ภาพรวม [P2]
> **ไม่มี title/หน้าแยก** — อยู่ในกล่องเดียวกับ team activity (§4.15) · ไม่ต้องพิมพ์
- [ ] แสดงทั้งทีม: แต่ละคน = **โปรเจกต์ (คั่น) → งาน (ลิงก์ไป task)** = งานที่ติดดาว/ทำวันนี้
- [ ] toggle **"แสดงเมื่อวาน"** (ที่ header กล่องทีมงาน) → กางรายการที่ลงเวลาเมื่อวาน + **ยอดรวม (เมื่อวาน · X ชม.)** ไว้**เหนือ**วันนี้

### 4.7 ค่าตอบแทน (Compensation) [P1]
> เมนูชื่อ **"ค่าตอบแทน"** (เลี่ยง "เงินเดือน" ให้ดูไม่ละเอียดอ่อน · ครอบ **เงินเดือน + เงินสดย่อยรอเบิก + ค่าจ้าง vendor**) = ร่มรวม: **สรุปเวลาของฉัน** + **เงินเดือน/ค่าจ้าง** (รายได้ − หัก = สุทธิ) + เงินสดย่อยรอเบิก · **view ตัวเอง = 2 คอลัมน์** (ซ้าย: เวลา · ขวา: เงิน)
**งวดจ่าย (pay cycle):** 25 ของเดือนก่อน → 24 ของเดือนนี้ (Asia/Bangkok) · ตัดรอบสิ้นวันที่ 24 · owner ทำรายการกับธนาคารวันที่ 25 · จ่ายเช้าวันที่ 26 · *SeedOffice ไม่จ่ายเงินเอง — แค่สรุปยอด + export ให้ owner*
- [ ] **การ์ด "สรุปเวลาของฉัน"** (self): ชั่วโมงงวดนี้ + วันนี้/เป้า 8 ชม. + manual% + breakdown ตามโปรเจกต์ — ไว้ cross-check ก่อนตัดรอบ
- [ ] **รายได้**: **เงินเดือน** (= Σ นาที÷60 × rateSnapshot, คำนวณสด เห็นใกล้ realtime) + **เบี้ยเลี้ยง** + **ค่าสึกหรอ** (~฿2,000/ด.) + **เงินพิเศษ** + **เงินได้อื่นๆ**
- [ ] **หัก**: **ประกันสังคม** + **ภาษีหัก ณ ที่จ่าย** + **รายการหักอื่นๆ** · *(vendor = หัก ณ ที่จ่าย 3% เท่านั้น ไม่มี ปกส./สวัสดิการ)*
- [ ] **เงินพิเศษ**: owner ใส่รายคน/รายงวด + โน้ตเหตุผล — **ความลับ** (เจ้าตัว + owner)
- [ ] **net (สุทธิ)** = รวมรายได้ − รวมหัก; เจ้าตัวเห็นรายการตัวเองครบ; **คนอื่นเห็นไม่ได้** (member เห็นแค่ชั่วโมงของทีม)
- [ ] **โน้ตจากหัวหน้า (ต่อคน/งวด)**: owner เขียนข้อความสั้น (เตือน/ชม) ตอนจ่ายเงินเดือน → เจ้าตัวเห็นบนหน้าค่าตอบแทน · **เห็นเฉพาะเจ้าตัว + owner**
- [ ] **เงินเรื่องตัวเองอยู่หน้านี้ที่เดียว** (dashboard ไม่โชว์เงิน) + แสดง **เงินสดย่อยรอเบิกของตัวเอง**
- [ ] หน้า payroll รวมทั้งทีม (owner เท่านั้น): กรองตามงวด + **export (CSV)** ไว้ทำรายการกับธนาคารวันที่ 25
- [ ] ปิดงวดหลังวันที่ 24 → snapshot payslip ไว้เป็นหลักฐาน (ไม่เปลี่ยนย้อนหลัง)

### 4.8 Project Cost & Profit [P1]
- [ ] **cost** = Σ(นาที ÷ 60 × rateSnapshot) ของทุกคนในโปรเจกต์ (ใช้ rate จริง)
- [ ] **profit** = ราคาขาย − cost; **margin** = profit ÷ ราคาขาย
- [ ] เห็นได้โดย owner + member; **vendor มองไม่เห็นทั้งหมด**
- [ ] แสดงความคืบหน้า: ชั่วโมงจริง vs estimate, ต้นทุนจริง vs ราคาขาย (เตือนเมื่อใกล้/เกินงบ)
- [ ] cost แสดงเป็น **ยอดรวม**; breakdown รายคนโชว์ **ชั่วโมง** (ไม่โชว์ตัวเงินรายคน)
- [ ] **กำไร/ขาดทุนต่องวดงาน (milestone)**: แบ่งงบ/ต้นทุนต่องวด → บอก "งวดนี้ใช้งบไปกี่ %" (จุดสี เขียว/ส้ม/แดง บน card)
- [ ] **เงินที่ลูกค้าจ่าย (installment)**: จ่ายแล้ว/ทั้งหมด → % บน card (ไว้ตามเงิน) — owner+member เท่านั้น

### 4.9 Petty Cash / Expenses [P2]
- [ ] member ลงค่าใช้จ่าย: วันที่, จำนวน, หมวด, รายละเอียด, แนบรูปใบเสร็จ (R2), จ่ายโดย (บริษัท/ออกเอง), โปรเจกต์ (ถ้ามี)
- [ ] สถานะ: pending → approved/rejected → reimbursed (owner อนุมัติ)
- [ ] สรุปเงินสดย่อยรายเดือน + ยอดค้างคืน (reimburse)
- [ ] export เพื่อนำเข้า FlowAccount (CSV ก่อน, API ทีหลัง)

### 4.10 ภาพรวม (team hub) [P2]
> **เน้นเวลา ไม่โชว์เงิน** (เงินของตัวเองอยู่หน้าค่าตอบแทน) · เป็นหน้ารวมของทีม · **ไม่มี header**
- [ ] **งานวันนี้** (กว้าง 3/5): ตารางไร้ border — ★ · โปรเจกต์ · task group · ชื่องาน · ปุ่ม **play + เวลาที่ใช้วันนี้** (`H:MM:SS`); งานที่จับเวลาวันนี้มาที่นี่ทั้งหมด; **ไม่มี timer card ใหญ่** (เอาออกเพราะกดดัน) + ปุ่ม Quick Add (คีย์ N)
- [ ] **งานเร็วๆ นี้** (กว้าง 2/5): list งานถัดไป ≤5 + ลิงก์ "งานทั้งหมดของฉัน" (แทนการ์ด "เวลาของฉัน" → ย้ายไปหน้าค่าตอบแทน)
- [ ] **ทีมงาน** (presence + สรุปงานประจำวัน **รวมกล่องเดียว**): avatar (ใครจับเวลา/hover เห็น task + วันนี้/เดือนนี้ ชม.) + grid งานทีม (§4.6) + toggle "แสดงเมื่อวาน"
- [ ] **ปฏิทินทีมงาน** (§4.14)
> ทีมงาน / calendar = owner+member · **vendor เห็นแค่ งานวันนี้/งานเร็วๆ นี้ ของตัวเอง**

### 4.11 Quote Builder → FlowAccount [P4]
- [ ] ร่างใบเสนอราคาผูกกับโปรเจกต์ (รายการ + ราคา)
- [ ] อนุมัติแล้ว push เข้า FlowAccount ผ่าน Open API เพื่อออกเอกสารจริง
- [ ] *ขึ้นกับ:* แพ็กเกจ/สิทธิ์ FlowAccount Open API (ต้องตรวจสอบก่อน)

### 4.12 อีเมลกลาง — Shared Inbox (Gmail) [P3]
> ทำ UX/UI เอง บน Gmail เป็น backend (ทีมยังใช้ Gmail หลัก) · layout แนว **Help Scout** · module ใหญ่ ดู risks §13
- [ ] เชื่อม **2–3 mailbox ข้าม 2 บริษัท** (SeedWebs: SW Support, SW Account · SeedGrit: SG Info) จัดการรวมที่เดียว (ทีมเดียวกัน); Gmail API + OAuth scope เท่าที่จำเป็น (read/modify/send)
- [ ] **ตัวเลือกกล่อง** (dropdown มุมขวาบน): **ทั้งหมด** (default รวมทุกกล่อง) + แต่ละกล่อง พร้อม **unread badge** จัดกลุ่มตามบริษัท; เลือกแล้ว **h1 เปลี่ยนเป็นชื่อกล่อง** (ทั้งหมด = "อีเมลกลาง")
- [ ] **folder bar** (segmented ใต้ h1): ยังไม่มอบหมาย · ของฉัน · ฉบับร่าง · มอบหมายแล้ว · ปิดแล้ว · สแปม · ทั้งหมด (นับอัตโนมัติต่อกล่อง) — **ไม่มี sidebar ซ้อน**
- [ ] **list** (ตาราง): ลูกค้า · เรื่อง (หัวข้อ+preview) · เลขที่ · รอแล้ว (+ ไอคอนไฟล์แนบ · จุดสีบอกกล่องเมื่ออยู่โหมด "ทั้งหมด")
- [ ] **detail** (คลิกแถว): อีเมลเต็ม (ผู้ส่ง/ถึง/Cc/เนื้อหา/ไฟล์แนบจาก R2) + **ช่องตอบกว้าง** (โฟกัส เขียนยาวได้ — ไม่ใช่มุมมอง chat) + พาเนลขวา = การ์ดลูกค้า + **"อีเมลที่ผ่านมา"** (thread เดิมของ contact)
- [ ] sync ขาเข้า: v1 = Cron polling (History API), later = Pub/Sub push → webhook (near-realtime)
- [ ] **assign** ให้ทีม · **สถานะ/โฟลเดอร์** (unassigned/mine/assigned/closed/spam + snoozed) · **tags**
- [ ] **ตอบจากในระบบ** → ส่งผ่าน Gmail API **จาก address ของกล่องที่เมลเข้ามา** (reply-from อัตโนมัติ), threading ถูกต้อง (References/In-Reply-To)
- [ ] **โน้ตภายใน** (ไม่ถึงลูกค้า) + **collision detection** (ใครกำลังดู/ตอบ thread นี้)
- [ ] **เขียนอีเมลใหม่** (compose) + canned replies (ข้อความสำเร็จรูป)

### 4.13 Ticket System (web-native) [Future]
> ต่อยอดจาก inbox เพื่อความ seamless
- [ ] เปลี่ยน email thread เป็น ticket ได้ (status, priority, ผู้รับผิดชอบ, SLA)
- [ ] ผูก ticket กับ project/task (งานที่เกิดจาก ticket)
- [ ] (อาจ) portal ให้ลูกค้าเปิด/ติดตาม ticket เอง

### 4.14 Team Calendar [P2 → P3]
- [ ] ปฏิทินทีมในระบบ: วันหยุด, **วันลา**, ประชุม, deadline + อัตโนมัติ (ตัดรอบ 24 / จ่าย 26) **[P2]**
- [ ] view **Day/Week/Month** + ปุ่ม **‹ prev / next › / วันนี้** (เลื่อนตาม view) **[P2]**
- [ ] เพิ่ม/แก้ event ในระบบได้; ผูกวันลากับ team activity (ใครไม่อยู่) **[P2]**
- [ ] **Sync จาก Google Calendar** (อ่าน events เข้ามาแสดง) **[P3]**
- [ ] **แชร์ปฏิทินเป็น ICS feed** (ลิงก์ subscribe) ให้ทีมเพิ่มในมือถือ **[P3]**

### 4.15 Team Activity / Presence [P2]
- [ ] แถว avatar ทั้งทีมบน dashboard (รวมกล่องเดียวกับ §4.6): ใครจับเวลาอยู่ (badge) + hover เห็น task + **ชั่วโมงวันนี้/เดือนนี้**
- [ ] **realtime** (timer ของคนอื่นเดินให้เห็น) — ผ่าน Durable Object + WebSocket
- [ ] vendor ไม่เห็น team activity (เห็นแค่ของตัวเอง)

### 4.16 เอกสาร (Docs) [P1.x]
> wiki/คู่มือ/บันทึก — แทน Notion ส่วนเอกสาร (อีกครึ่งของ PM) · **mockup เสร็จ + deploy แล้ว**
- [ ] หน้าเอกสาร = **โครงสร้างต้นไม้** (sub-page ลึกได้) — เพิ่ม/แก้/ลบ/ย้าย/เรียง · tree อยู่บนพื้นหน้า, ตัวเอกสารเป็นการ์ดขาว
- [ ] **WYSIWYG (Tiptap)** ไม่ใหญ่เท่า Notion: หัวข้อ **h2–h4** (title=h1), ตัวหนา/เอียง/ขีดฆ่า, bullet/ordered, **checklist**, blockquote, code, link, **รูป**
- [ ] **เก็บเป็น Markdown** (source of truth) ผ่าน `@tiptap/markdown` (bidirectional) · **autosave** (debounce) + สถานะบันทึก · concurrent = last-write-wins
- [ ] **อัปรูปขึ้น R2** แทรกในเนื้อหา (markdown เก็บ URL `/api/docs/images/:key`, serve ผ่าน endpoint ที่ login; **ไม่รับ SVG** กัน XSS)
- [ ] สิทธิ์: **owner + member R/W · vendor ❌** (ไม่เห็นเมนู + API 403)

### 4.17 ลูกค้า / CRM [P1.x]
> มุมมองรวมต่อลูกค้า + ยอดขาย · เริ่มได้หลัง projects (T08) + payments (T14) · **mockup เสร็จ + deploy แล้ว**
- [ ] **list**: การ์ดสรุป (**ยอดขายปีนี้** · **รายได้ต่อเนื่อง MRR/ARR** · **ต้องตามเงิน** · **ใกล้หมดอายุ**) + แท็บ (ทั้งหมด/ต้องตามเงิน/ใกล้หมดอายุ) + ตาราง (เสนอราคา · จ่าย% · ค้าง · ต่อเนื่อง · วันต่ออายุ) + **search (⌘K)**
- [ ] **detail**: ติดต่อ + สรุปเงิน + โปรเจกต์ + **บริการต่อเนื่อง** (hosting/domain/MA/server · รอบ · ยอด · วันต่ออายุ) + การชำระเงิน (overdue) + **โน้ต/ข้อควรจำ** (วันวางบิล/ที่อยู่ส่งเอกสาร ฯลฯ) + อีเมลที่ผ่านมา (**เชื่อม inbox P3**)
- [ ] มุมมอง **ใกล้หมดอายุ** (เรียงตามวันต่ออายุ) + **ต้องตามเงิน** (payment overdue) — ช่วยตามเอง **ไม่มี auto-email**
- [ ] `clients` เป็น entity จริง (project ผูก `clientId`) · `recurring_services` แยกจาก projects · ยอดขาย/ค้าง/MRR = **derived** จาก projects/payments/recurring
- [ ] สิทธิ์: **owner + member · vendor ❌** — ตัวเลขการเงินตามกฎ "เงินโปรเจกต์" (§4.8/§2)

---

## 5. Data Model (high level)

> D1 = SQLite. **เงินเก็บเป็น integer สตางค์, เวลาเก็บเป็น integer นาที, ห้าม REAL/float กับเงิน**

| Entity | ฟิลด์หลัก | หมายเหตุ |
|--------|----------|----------|
| `users` | id, email, name, googleSub, role(owner\|member\|vendor), status, avatarUrl | provision โดย owner |
| `rates` | id, userId, rateSatangPerHour (int), effectiveFrom, note | ประวัติ rate (effective-dated) |
| `projects` | id, code, name, logo, **clientId→clients**, type(project\|ma), status, quotedSatang (int), billingType(fixed\|recurring), recurringPeriod(monthly\|yearly)?, startDate, dueDate | 2 ประเภท · (เดิม clientName เป็น string) |
| `milestones` | id, projectId, name, sortOrder, budgetSatang (int), dueDate, status | งวดงาน → P&L ต่องวด |
| `payments` | id, projectId, installmentNo, amountSatang (int), dueDate, paidAt, status | เงินลูกค้าจ่ายเป็นงวด → % |
| `clients` | id, name, logo, contactName, contactEmail, contactPhone, note, status(active\|archived), createdAt | **CRM** (เดิมเป็น string `clientName` บน project) |
| `recurring_services` | id, clientId, projectId?, label, category(hosting\|domain\|ma\|server\|ssl\|other), period(monthly\|yearly), amountSatang (int), nextDueDate, status, note | บริการต่อเนื่อง → MRR/ARR + ใกล้หมดอายุ |
| `client_notes` | id, clientId, body, createdBy, createdAt | โน้ต/ข้อควรจำต่อลูกค้า (วันวางบิล/ที่อยู่ส่งเอกสาร ฯลฯ) |
| `task_groups` | id, projectId, name, sortOrder | สร้างเอง, เรียงได้ |
| `tasks` | id, projectId, groupId, sortOrder, title, desc, assigneeId, status, priority, estimateMinutes (int), startDate, dueDate, createdBy | อยู่ใต้ group · start/due → ไทม์ไลน์กลุ่ม |
| `task_stars` | id, userId, taskId, forDate | "ทำวันนี้" → standup |
| `task_attachments` | id, taskId, r2Key, filename, mime, sizeBytes, uploadedBy | รูป/ไฟล์ |
| `task_comments` | id, taskId, userId, body, createdAt | |
| `docs` | id, parentId→docs?, sortOrder, title, contentMarkdown, createdBy, updatedBy, createdAt, updatedAt, deletedAt | wiki tree (เก็บ **markdown**) · soft-delete |
| `doc_images` | id, docId?, r2Key, filename, mime, sizeBytes, uploadedBy, createdAt | รูปในเอกสาร (R2) |
| `time_entries` | id, userId, taskId, projectId, workDate, minutes (int), note, rateSnapshotSatang (int), source(timer\|manual), editCount (int), lastEditedBy, editedAt, deletedAt | snapshot rate ตอนสร้าง; ทุกการแก้/ลบ → `audit_logs` (ก่อน→หลัง) |
| `standup_entries` | id, userId, day, yesterday, today, blockers | [P2] |
| `pay_cycles` | id, label, periodStart (25), periodEnd (24), payDate (26), status(open\|closed) | งวด 25→24, จ่าย 26 |
| `pay_adjustments` | id, userId, cycleId, kind(allowance\|depreciation\|bonus\|other_income\|sso\|wht\|other_deduction), amountSatang (int), note, createdBy | รายการรายได้/หักต่องวด · **bonus(เงินพิเศษ) = ความลับ** |
| `pay_notes` | id, userId, cycleId, body, updatedBy, updatedAt | โน้ต owner → พนักงาน ต่องวด (เตือน/ชม) — **เจ้าตัว + owner** |
| `payslips` | id, userId, cycleId, baseSatang, incomeSatang, deductionSatang, netSatang, linesJson, ownerNote, closedAt | snapshot ตอนปิดงวด (เก็บ breakdown + โน้ต) |
| `expenses` | id, userId, expenseDate, amountSatang (int), category, desc, receiptKey (R2), paidBy, projectId?, status, approvedBy | [P2] |
| `inbox_mailboxes` | id, company(SW\|SG), name (เช่น SW Support), emailAddress, gmailAccountId | [P3] กล่องเมลที่เชื่อม (หลายบริษัท) |
| `inbox_threads` | id, mailboxId→inbox_mailboxes, gmailThreadId, subject, contactEmail, status(open\|snoozed\|closed\|spam), assigneeId, tags, lastMessageAt, snoozeUntil | [P3] · folder = derived จาก assignee+status |
| `inbox_messages` | id, threadId, gmailMessageId, direction(in\|out), fromAddr, toAddr, snippet, bodyKey (R2 ถ้าใหญ่), sentAt | [P3] |
| `inbox_notes` | id, threadId, userId, body, createdAt | โน้ตภายใน (ไม่ส่งหาลูกค้า) |
| `inbox_attachments` | id, messageId, r2Key, filename, mime, sizeBytes | [P3] |
| `gmail_sync_state` | id, mailbox, lastHistoryId, lastSyncAt | สถานะ sync Gmail |
| `calendar_events` | id, title, startAt, endAt, allDay, type(holiday\|leave\|meeting\|deadline\|other), userId?, projectId?, source(local\|gcal), gcalId | [P2] ปฏิทินทีม |
| `gcal_sync_state` | id, userId, lastSyncAt, channelId | [P3] sync Google Calendar |
| `timer_sessions` | id, userId, taskId, startedAt | timer ที่กำลังเดิน (presence/realtime) |
| `sessions` | id, userId, expiresAt | auth session (เพิกถอนได้) |
| `audit_logs` | id, actorId, action, entity, entityId, meta, at | log การเปลี่ยนข้อมูลการเงิน |

**Derived (ไม่เก็บ ถ้ายังไม่ปิดงวด):** payroll base, project cost/profit/margin — คำนวณสดจาก `time_entries` + `rates`

**Config (ระดับบริษัท):** วันตัดรอบ = **25** (งวด 25→24, จ่าย 26) · **เพดานชั่วโมงทำงาน/วัน = 8** · ทั้งหมดเก็บเป็นค่า config ปรับได้ ไม่ hardcode

> `projects.status` รวมค่า **archived** (ค้นหาเจอผ่าน lightbox §4.3)

---

## 6. Architecture & Tech Stack

```
[ Browser SPA ]  React + TS + Vite + React Router + Tailwind
        │  (fetch /api/*, cookie session)
        ▼
[ Cloudflare Worker ]  Hono.js  ── REST/JSON + OAuth + SSE/WS(later)
        │                 │
        ▼                 ▼
   [ D1 (SQLite) ]   [ R2 ]  ไฟล์ใบเสร็จ/แนบ
   via Drizzle ORM
```

- **Frontend:** React + TypeScript **SPA** (Vite + React Router) + **Tailwind** → deploy Cloudflare Pages *หรือ* Worker Static Assets
  - *ทางเลือก:* Next.js (SSG/export) ก็ได้ แต่ SPA เบากว่าและพอสำหรับ internal tool — เลือก **Vite + React Router** เป็นค่าตั้งต้น
- **API:** **Hono.js** บน Cloudflare Workers (`/api/*`), validation ด้วย **Zod**
- **DB:** **Cloudflare D1** (SQLite) + **Drizzle ORM** + Drizzle Kit (migrations)
- **Files:** **R2** (อัปโหลดผ่าน Worker หรือ presigned URL)
- **Auth:** Google OAuth (เช่น `@hono/oauth-providers` หรือ Arctic) → session token ใน D1 + httpOnly secure cookie
- **Realtime:** v1 = recompute-on-load + client-side timer extrapolation; **[later]** Durable Objects + WebSocket สำหรับ live ข้ามผู้ใช้
- **Shared Inbox (P3):** Gmail API + R2 (attachment); sync ขาเข้าเริ่มจาก **Cron Trigger** polling (History API) → later **Pub/Sub push → Worker webhook**; เก็บ metadata ใน D1, body ใหญ่ไว้ R2; collision ใช้ Durable Object
- **Team activity / presence (P2):** realtime ผ่าน **Durable Object + WebSocket** (timer ของทีมเดินให้เห็น)
- **Team Calendar (P2/P3):** events ใน D1; **[P3]** sync Google Calendar (scope `calendar.readonly`) + **ICS feed** (endpoint สาธารณะมี token) ให้ subscribe ในมือถือ
- **Hosting/ops:** Cloudflare ทั้งหมด (จุดขาย: ไม่ต้องดูแล server)

---

## 7. Commands

> package manager: **pnpm** (กำหนดเป็นมาตรฐาน), tooling: **wrangler**

| คำสั่ง | ทำอะไร |
|--------|--------|
| `pnpm dev` | รัน frontend (Vite) + worker (`wrangler dev`) พร้อมกัน |
| `pnpm build` | build SPA + worker |
| `pnpm deploy` | `wrangler deploy` (+ publish assets) |
| `pnpm lint` / `pnpm typecheck` | ESLint / `tsc --noEmit` |
| `pnpm test` | unit tests (Vitest) |
| `pnpm test:e2e` | Playwright |
| `pnpm db:generate` | Drizzle Kit สร้าง migration จาก schema |
| `pnpm db:migrate` | `wrangler d1 migrations apply` (local/remote) |
| `pnpm db:seed` | seed ข้อมูลตัวอย่าง |

---

## 8. Project Structure

```
seedoffice/
├─ apps/
│  ├─ web/                 # React SPA (Vite + React Router + Tailwind)
│  │  ├─ src/routes/       # overview, projects(+detail), clients(CRM), docs, inbox, payroll, expenses, admin
│  │  ├─ src/components/
│  │  ├─ src/lib/          # api client, auth context, formatters (เงิน/เวลา/timezone)
│  │  └─ src/hooks/
│  └─ api/                 # Hono worker
│     ├─ src/routes/       # /auth /projects /tasks /time /clients /docs(+images) /payroll /expenses /calendar /inbox /admin
│     ├─ src/middleware/   # auth, role-guard, audit
│     └─ src/index.ts
├─ packages/
│  ├─ db/                  # Drizzle schema + migrations + seed
│  └─ core/                # โดเมนล้วน: payroll/cost calc, money & time utils (pure, test ง่าย)
├─ wrangler.jsonc         # bindings: D1 (DB), R2 (FILES) · assets = SPA dist · ฟีเจอร์ใหม่เป็น JSON-only
├─ SPEC.md
└─ package.json           # pnpm workspaces
```

**หลักการ:** ตรรกะการเงิน (payroll, cost, การปัดเศษ) อยู่ใน `packages/core` เป็น **pure function** ทดสอบแยกได้ ไม่ผูกกับ HTTP/DB

---

## 9. Code Style & Conventions

- **TypeScript strict** ทุก package; ไม่มี `any` ลอย; แชร์ type ระหว่าง web/api ผ่าน `packages/core`
- **เงิน = integer สตางค์เสมอ** (1 บาท = 100 สตางค์); rate = สตางค์/ชั่วโมง; **ห้าม float กับเงินเด็ดขาด**
- **เวลา = integer นาที**; การคำนวณ `base = round(minutes * rateSatangPerHour / 60)` กำหนดกฎปัดเศษชัดเจน (ปัดครึ่งขึ้นที่หน่วยสตางค์) ไว้ที่เดียวใน `core`
- **วันที่/เวลา = Asia/Bangkok**; เก็บ timestamp เป็น UTC/epoch, แปลงตอนแสดง; ขอบงวดเงินเดือน = 25 เวลา 00:00 → 24 เวลา 23:59 (Asia/Bangkok)
- **Validation:** Zod ที่ขอบ API ทุก endpoint; แชร์ schema กับ frontend
- **DB:** ผ่าน Drizzle เท่านั้น; migration ทุกครั้งที่แก้ schema; ตั้งชื่อ snake_case (DB) / camelCase (TS)
- **UI:** Tailwind; component เล็ก reuse ได้; format เงิน/เวลาด้วย helper ส่วนกลาง
- **UI ทุกหน้า ต้องมี empty state + loading state** (วันแรกที่เปิดใช้ข้อมูลยังน้อย — empty state ต้องบอกว่า "เริ่มยังไง")
- **คีย์ลัด**: เช็คจาก `e.code` (`KeyN`, `KeyK`) ไม่ใช่ `e.key` — กันพังตอนผู้ใช้สลับแป้นพิมพ์ภาษาไทย
- **Commits:** conventional commits; PR เล็ก ๆ

---

## 10. Testing Strategy

- **Unit (Vitest)** — โฟกัสที่ **การเงิน** เป็นอันดับแรก: payroll base, bonus, net, project cost/profit/margin, การปัดเศษ, rate snapshot, เปลี่ยน rate กลางเดือน → ทดสอบเป็น pure function ใน `packages/core`
- **Integration (Vitest + `@cloudflare/vitest-pool-workers`)** — Hono routes บน D1 จริง (Miniflare/workerd): auth, role-guard
- **Permission tests (สำคัญ)** — ยืนยันว่า:
  - member มองไม่เห็น bonus/net ของคนอื่น
  - **vendor มองไม่เห็น P&L / rate ทีม / payroll / petty cash** เลย
- **E2E (Playwright)** — flow หลัก: login → ลงเวลา → เห็นเงินตัวเองอัปเดต; owner ปิด payroll; member ลง petty cash · **ผูกเป็นเกณฑ์ผ่าน checkpoint: CP1 = login + role nav · CP4 = ลงเวลา → เห็นเงิน → ปิดงวด**
- เกณฑ์: ตรรกะการเงินใน `core` ต้องครอบคลุมสูง (เป็นหัวใจความถูกต้อง)

---

## 11. Boundaries

### Always (ทำเสมอ)
- จำกัด login เฉพาะ domain `seedwebs.com` + allowlist vendor; ปฏิเสธอีเมลอื่น
- ปฏิบัติต่อ **bonus + net** เป็นความลับ (เจ้าตัว + owner เท่านั้น)
- เงิน = integer สตางค์, เวลา = integer นาที
- snapshot rate ลงใน time entry ตอนสร้าง
- บันทึก audit log ทุกการเปลี่ยนข้อมูลการเงิน (rate, bonus, ปิดงวด, อนุมัติ expense)
- timezone Asia/Bangkok ในการสรุปรายวัน/รายงวด
- log ทุกการลง manual และการแก้/ลบเวลา (actor, เวลา, ค่าก่อน→หลัง)
- เก็บ token Gmail/Google เป็น secret, ขอ scope เท่าที่จำเป็น

### Ask first (ถามก่อนทำ)
- อะไรก็ตามที่ยิง **FlowAccount API** (มี side effect การเงินจริง)
- การส่งอีเมล/แจ้งเตือนออกนอกระบบ
- migration ที่ลบ/แก้คอลัมน์ข้อมูลเดิม (destructive)
- การ deploy ขึ้น production
- การแก้ไข rate/time/payroll ย้อนหลังหลังปิดงวด

### Never (ห้าม)
- เปิด bonus / net / P&L ให้ role ที่ไม่มีสิทธิ์ (โดยเฉพาะ vendor)
- commit secret/keys ลง repo (ใช้ Wrangler secrets/vars)
- ใช้ float/REAL กับจำนวนเงิน
- auto-ส่งใบเสนอราคา/เอกสารถึงลูกค้าโดยไม่ยืนยัน
- hard-delete ข้อมูลเวลา/การเงิน (ใช้ soft-delete + audit)
- เคลื่อนย้ายเงิน/ตัดจ่ายเงินเดือนเอง — SeedOffice แค่สรุปยอด + export ให้ owner ไปทำรายการกับธนาคาร (จ่ายจริงผ่านธนาคารเช้า 26)
- auto-ส่งอีเมลถึงลูกค้าโดยไม่มีคนกดส่ง (ใน shared inbox)

---

## 12. Roadmap (phasing)

- **P1 (MVP — ROI สูงสุด):** Auth + Users/Rates + Projects (2 ประเภท: งานโปรเจกต์/งานต่อเนื่อง · task groups/tasks · timeline) + Time tracking + ค่าตอบแทน + Project cost/profit (+ payment%, งวดงาน) → เลิก Notion + Everhour + คิดเงินเดือนมือ
- **P1.x (track ขนาน หลัง P1 foundation):** **เอกสาร/Docs** (wiki tree · markdown+Tiptap · รูป R2) + **ลูกค้า/CRM** (clients + recurring_services · ยอดขาย/ค้าง/ต่ออายุ/โน้ต) — เติมส่วนเอกสารของ Notion + มุมมองลูกค้า · `clients` ฝังตั้งแต่ T08, หน้า CRM หลัง T14 · *(mockup เสร็จ)*
- **P2:** Standup (auto) + Petty cash + **Dashboard team hub** (team activity/presence + ปฏิทินทีม + Quick Add) — presence ต้องมี realtime (DO+WS) · + **PWA** (manifest/add-to-homescreen ให้กดจับเวลาจากมือถือสะดวก) · + **แจ้งเตือนภายใน** (ใกล้ตัดรอบ · payment overdue · บริการใกล้หมดอายุ — backlog P2/P3)
- **P3:** **Shared Inbox (Gmail)** + **Google Calendar sync / ICS feed** — งานใหญ่, ทำ UX เอง
- **P4:** Quote builder → FlowAccount API
- **Future:** Ticket system (web-native) ต่อยอดจาก inbox

> ลำดับเฟสปรับได้ — แต่ P1 (ลูปเงิน) มาก่อนเสมอ (ROI สูงสุด + แทน 2 เครื่องมือ + งาน manual)

---

## 13. Open Assumptions & Risks

> ต้องเคาะก่อน/ระหว่าง planning

**ตัดสินแล้ว (locked):**
- Vendor scope ✅ ตามตาราง §2 (ลงเวลาได้ทั้ง timer+manual, เห็นค่าตอบแทนตัวเอง, ไม่ standup/petty cash/bonus)
- แสดงเฉพาะ **ชั่วโมง** ของคนอื่น ไม่โชว์ตัวเงิน base
- รอบเงินเดือน = **25 → 24**, ตัดรอบ 24, owner ทำรายการธนาคาร 25, จ่าย 26 (THB)
- ทุกการ manual/แก้เวลา ถูก log; metric **manual % ทั้งงวด เห็นทั้งทีม, > 10% = flag สีส้ม** (ตอนนี้มีในตาราง payroll; UI ฝั่งทีมเพิ่มภายหลัง)
- **vendor ไม่เห็นงบ/ราคาขาย** — การเงินโปรเจกต์ทั้งหมด (งบ/% จ่าย/กำไร) owner+member เท่านั้น
- โปรเจกต์ **2 ประเภท**: งานโปรเจกต์ (fixed-price, มีกำหนดส่ง) + งานต่อเนื่อง (recurring รายเดือน/ปี) — ไม่มี time & material
- owner provision user เอง
- export payroll = **CSV** ก่อน
- **อีเมลกลาง: สร้างเอง** (P3), ต่อยอด ticket system (future)
- **สูตรปัดเศษเงินเดือน + นิยามงวด** (≥25 = งวดถัดไป, ≤24 = งวดนี้) ✅ ยืนยันแล้ว
- IA/header ใหม่: ภาพรวม·โปรเจกต์·**ลูกค้า**·**เอกสาร**·อีเมลกลาง·ค่าตอบแทน·เงินสดย่อย·ตั้งค่า; standup บน ภาพรวม; header = h1+action, role switcher แยก top bar
- เมนู **"ค่าตอบแทน"** (เดิม เงินเดือน→เวลาทำงาน→ค่าตอบแทน) — ครอบ เงินเดือน + เงินสดย่อยรอเบิก + ค่าจ้าง vendor; owner เห็นตาราง **รายได้** (เงินเดือน/เบี้ยเลี้ยง/ค่าสึกหรอ/เงินพิเศษ/อื่นๆ) **− หัก** (ปกส./ภาษี/อื่นๆ) **= สุทธิ**; vendor หัก ณ ที่จ่าย 3%
- **project detail**: ไทม์ไลน์ต่อ task group (บาร์ = task เริ่มเร็วสุด→จบช้าสุด) + ปุ่ม "จัดเรียง" โชว์ grip (ปกติซ่อน กันลากโดน)
- **เอกสาร (Docs)** = wiki tree (sub-page) · WYSIWYG Tiptap เก็บ **markdown** (`@tiptap/markdown`) · รูปขึ้น R2 (ไม่รับ SVG) · autosave · owner+member (vendor ❌) — *mockup เสร็จ+deploy*
- **ลูกค้า/CRM** = `clients` entity (project ผูก clientId) + `recurring_services` แยก (วันต่ออายุ → ใกล้หมดอายุ) + `client_notes` · ยอดขายปีนี้/MRR/ARR/ค้างชำระ (derived) · **ไม่มี auto-email** (มุมมองช่วยตามเอง) · owner+member (vendor ❌) — *mockup เสร็จ+deploy*
- **กฎ timer (เคาะ มิ.ย. 69):** วิ่งได้ทีละตัวต่อคน (start ใหม่ = auto-stop ตัวเดิม) · **ชนเพดาน 8 ชม./วัน = บล็อก** + เตือนเว็บ/อีเมล (อยากให้ทีมพัก) ทำเกินจริงลง manual ย้อนหลัง · ข้ามคืนไม่ตัดที่เที่ยงคืน แต่ session ครบ 8 ชม. auto-stop
- **นโยบาย launch (เคาะ มิ.ย. 69):** **ไม่ import** ข้อมูลเก่าจาก Notion/Everhour — เริ่ม fresh · เริ่มใช้จริง**ต้นงวด (วันที่ 25)** · ก่อนเลิก Everhour **รันคู่ 1 งวดเต็ม** ยอดต้องตรงกับที่คิดมือ · **D1 backup (T18) ต้องมาก่อนปิดงวดจริงครั้งแรก**

**เคาะแล้ว (UX รอบ dashboard/projects):**
- vendor ไม่เห็นงบ · manual% เห็นทั้งทีม (UI ฝั่งทีมทำภายหลัง) · งวดงาน/payment ออกแบบ schema ตอน build
- **เพดานชั่วโมงทำงาน/วัน = 8** (ปรับได้ระดับบริษัท)
- **งานวันนี้** = ตาราง + ปุ่ม play/เวลา · ตัด timer card ใหญ่ (กดดัน) ออก · การ์ด "เวลาของฉัน" → ย้ายไป**หน้าค่าตอบแทน**
- **ค้นหาโปรเจกต์** = lightbox (⌘K) ค้น active + archived + filter
- **ปฏิทิน** = nav prev/next/today (Day/Week/Month)
- **ทีมงาน + สรุปงานประจำวัน** = รวมกล่องเดียว (ตัด title)

**เคาะแล้ว (อีเมลกลาง — Help Scout style):**
- เชื่อม 2–3 กล่องข้าม 2 บริษัท (SeedWebs SW / SeedGrit SG) จัดการรวมที่เดียว · ตัวเลือกกล่อง + unread badge · **h1 เปลี่ยนตามกล่อง** (ทั้งหมด = "อีเมลกลาง")
- folder = **segmented bar** (unassigned/mine/drafts/assigned/closed/spam/ทั้งหมด) ใต้ h1 · ไม่มี sidebar ซ้อน
- **list (ตาราง) + detail** (อีเมลเต็ม + ช่องตอบกว้าง + พาเนล "อีเมลที่ผ่านมา") · เลิกมุมมอง chat
- **reply-from อัตโนมัติ** = ตอบจาก address ของกล่องที่เมลเข้ามา

**Risks / ต้องตรวจสอบ:**
- **Shared inbox = งานใหญ่**: Gmail API quota/scopes + OAuth verification (sensitive scopes), sync/threading/dedup, deliverability (SPF/DKIM/DMARC ผ่าน Workspace อยู่แล้ว), collision — ต้องกันเวลาเฉพาะ ไม่ควรเบียด P1
- **FlowAccount Open API** — ต้องเช็กสิทธิ์/แพ็กเกจก่อนทำ P4
- **D1 limits** — เพียงพอสำหรับ ~12 users; inbox/attachment ใหญ่ใช้ R2; ระวัง D1 size ถ้าเก็บ body อีเมลเยอะ
- **Realtime ข้ามผู้ใช้** — payroll/cost ใช้ recompute/poll ได้; แต่ **team activity (presence) ต้องมี Durable Objects + WebSocket ตั้งแต่ P2**
- **Google Calendar API + ICS feed** — OAuth scope ปฏิทิน, sync/dedup, endpoint ICS + token security
- **Backup** ข้อมูลการเงิน (D1 export ตามรอบ) → เป็น task แล้ว: **T18** (Cron → R2, ต้องเสร็จก่อนปิดงวดแรก)
- **อีเมลแจ้งเตือนชนเพดานชั่วโมง** (ภายในทีม) — ต้องมี email provider ตั้งแต่ P1 (เลือกตอน T12: Cloudflare Email Sending / Resend); การส่งอีเมลครั้งแรกยังต้อง ask ตาม §11
- การปัดเศษเงินเดือน/ต้นทุน — ต้องตกลงกฎให้ตรงกับที่ทำมือทุกวันนี้

---

*ขั้นต่อไป:* เริ่ม build P1 ตาม **tasks/plan.md** + **tasks/todo.md** (เริ่มที่ T01 scaffold)
