# @seedoffice/mcp — MCP server หุ้ม REST ของ SeedOffice

Worker แยก (SPEC §4.18 · Phase D) ที่เปิดงาน/เวลาของ SeedOffice ให้ Claude เรียกเป็น **MCP tools** ผ่าน **Personal Access Token (PAT)** ของแต่ละคน

- **stateless** — ใช้ `createMcpHandler` (`agents/mcp`) ไม่มี Durable Object
- **auth = PAT-forwarding** — client ส่ง `Authorization: Bearer sko_…` มาที่ `/mcp` · MCP forward PAT ไป Worker หลัก (`seedoffice`) ผ่าน **service binding** · **scope/role ทั้งหมดบังคับที่ REST เดิม** (MCP ไม่ตัดสินสิทธิ์เอง · การเงินยัง cookie-only → PAT แตะไม่ได้)

## Tools

| tool | REST | scope |
|---|---|---|
| `today` | `GET /api/me/today` | `tasks:read` |
| `list_my_projects` | `GET /api/me/projects` | `tasks:read` |
| `create_task` | `POST /api/groups/:id/tasks` | `tasks:write` |
| `update_task` | `PATCH /api/tasks/:id` | `tasks:write` |
| `star_task` | `POST /api/tasks/:id/star` | `tasks:write` |
| `log_time` | `POST /api/tasks/:id/time` | `tasks:write` |

## พัฒนา / ทดสอบ

```bash
pnpm --filter @seedoffice/mcp test        # unit (tools + bearer)
pnpm --filter @seedoffice/mcp typecheck
pnpm --filter @seedoffice/mcp cf-typegen  # regen worker-configuration.d.ts
pnpm --filter @seedoffice/mcp deploy      # → Worker "seedoffice-mcp" (ต้องเคาะกับเจ้าของก่อน)
```

> local dev ต้องรัน Worker หลักคู่กันด้วย (service binding) — `wrangler dev` แบบ multi-worker

## ต่อกับ Claude (remote MCP · Custom Header)

1. สร้าง PAT ที่หน้าโปรไฟล์ SeedOffice (scope `tasks:read` + `tasks:write`)
2. เพิ่ม MCP server ชี้ไปที่ `https://<โดเมน MCP>/mcp` พร้อม header `Authorization: Bearer sko_…`

endpoint: `POST /mcp` (Streamable HTTP) · `GET /health` = สถานะ
