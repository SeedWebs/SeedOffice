---
description: ส่งงานที่ค้างขึ้น production ครบลูป — commit → PR → merge → migrate (ถ้ามี) → deploy → verify → sync wiki
argument-hint: [สรุป commit สั้นๆ (optional)]
---

ปล่อยการเปลี่ยนแปลงที่ค้างอยู่ขึ้น prod ตามกติกาใน CLAUDE.md.
การพิมพ์ `/ship` = **อนุญาต deploy รอบนี้แล้ว** (ข้ามกฎ ask-before-deploy §11 เฉพาะ deploy) —
แต่ **migration ที่ทำลายข้อมูลยังต้องหยุดถามก่อนเสมอ**.

ทำตามลำดับ · ขั้นไหน "ล้มเหลว/แดง" ให้ **หยุดทันที** แล้วรายงาน อย่าทำขั้นถัดไป:

0. **สถานะ** — `git status` · `git branch --show-current` · `git diff --stat`. ถ้า worktree ใหม่ยังไม่ install → `pnpm install`. ถ้าไม่มีอะไรใหม่จะ ship → ถามผู้ใช้ว่าจะ ship อะไร
1. **DoD gate** — `pnpm typecheck && pnpm lint && pnpm test`. แดง = หยุด รายงาน error (อย่า commit)
2. **Branch** — ถ้าอยู่บน `main` สร้าง branch ก่อน (`git checkout -b <type>/<slug>`). อยู่ branch อยู่แล้วใช้ต่อ
3. **Commit** — stage เฉพาะไฟล์ที่เกี่ยว · conventional commit (`<type>(<scope>): …` ไทยได้) · ใช้ `$ARGUMENTS` เป็น hint ของสรุปถ้ามี · **repo public: git author ต้องไม่ใช่ `m@seedwebs.com`** (เช็ค `git config user.email`; ถ้าใช่ override เป็น noreply) · ปิดท้าย `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
4. **Push + PR** — `git push -u origin <branch>` แล้ว `gh pr create --base main` (body สั้น: สรุป + ผล verify + ปิดท้าย "🤖 Generated with Claude Code")
5. **Merge** — `gh pr merge <n> --squash` (history main = commit เดียวต่อฟีเจอร์)
6. **Migrate (เฉพาะเมื่อจำเป็น)** — ถ้า commit นี้เพิ่มไฟล์ใหม่ใน `packages/db/migrations/` → เปิดอ่าน SQL ก่อน:
   - มี `DROP` / `DELETE` / ลบคอลัมน์ / แก้ที่ทำลายข้อมูล → **หยุด ถามผู้ใช้ก่อน** (§11)
   - additive ล้วน → `pnpm db:migrate:remote` (ทำ **ก่อน** deploy)
   - ไม่มีไฟล์ migration ใหม่ → ข้าม
7. **Deploy** — `pnpm run deploy` (`account_id` อยู่ใน `wrangler.jsonc` แล้ว ไม่ต้องใส่ env) · **ห้าม `pnpm deploy`** (ชน built-in subcommand)
8. **Verify prod** — `curl -s -o /dev/null -w "%{http_code}" https://office.seedwebs.com/api/health` = 200 · หน้าแรกเสิร์ฟ asset hash ใหม่ (ตรงกับ build) · endpoint ที่ต้อง auth (เช่น `/api/team-activity`) = 401
9. **Sync wiki** — ถ้า env `SEEDWEBS_WIKI_PATH` ตั้งไว้ (`echo "$SEEDWEBS_WIKI_PATH"`): ใน `<path>/projects/seedoffice/SeedOffice.md` เพิ่ม entry บนสุดของ 📓 Log (วันที่ + สรุปสังเคราะห์ + ลิงก์ PR + deploy version) · ย้าย `T#` ที่ ship ออกจาก 🚀 backlog (ดู CONVENTIONS §1.5) · commit `docs(seedoffice): …` ลง main. ไม่ตั้ง = ข้ามเงียบ
10. **รายงาน** — ตารางสรุป: commit sha · PR · merge sha · deploy version · ผล verify
