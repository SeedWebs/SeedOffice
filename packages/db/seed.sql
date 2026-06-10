-- Seed ข้อมูลตัวอย่าง (ตรงกับ persona ใน mockup — anonymized แล้ว)
-- ใช้เฉพาะ dev/preview · production เริ่มว่าง (นโยบาย launch: fresh start)
-- รัน: pnpm db:seed

INSERT OR REPLACE INTO company_config (id, cutoff_day, work_hour_cap_minutes) VALUES (1, 25, 480);

-- users — id คงที่ ไว้อ้างในเทสต์/e2e
INSERT OR REPLACE INTO users (id, email, name, google_sub, role, status, avatar_url, created_at) VALUES
  ('u_owner', 'owner@seedwebs.com',            'เมธ',    NULL, 'owner',  'active', NULL, 1767200000000),
  ('u_pond',  'pond@seedwebs.com',             'ปอนด์',  NULL, 'member', 'active', NULL, 1767200000000),
  ('u_nam',   'nam@seedwebs.com',              'น้ำ',    NULL, 'member', 'active', NULL, 1767200000000),
  ('u_beam',  'beam@seedwebs.com',             'บีม',    NULL, 'member', 'active', NULL, 1767200000000),
  ('u_korn',  'korn@seedwebs.com',             'กร',     NULL, 'member', 'active', NULL, 1767200000000),
  ('u_jay',   'jay@seedwebs.com',              'เจ',     NULL, 'member', 'active', NULL, 1767200000000),
  ('u_fah',   'fah@seedwebs.com',              'ฟ้า',    NULL, 'member', 'active', NULL, 1767200000000),
  ('u_praew', 'praew@seedwebs.com',            'แพรว',   NULL, 'member', 'active', NULL, 1767200000000),
  ('u_toon',  'toon@seedwebs.com',             'ตูน',    NULL, 'member', 'active', NULL, 1767200000000),
  ('u_mint',  'mint@seedwebs.com',             'มิ้นท์', NULL, 'member', 'active', NULL, 1767200000000),
  ('u_somchai','somchai.freelance@example.com','สมชาย',  NULL, 'vendor', 'active', NULL, 1767200000000);

-- rates (สตางค์/ชั่วโมง) — ตรง mockup: เมธ ฿450 · ปอนด์ ฿400 · น้ำ ฿350 · ตูน ฿200 · สมชาย ฿350
INSERT OR REPLACE INTO rates (id, user_id, rate_satang_per_hour, effective_from, note, created_at) VALUES
  ('r_owner_1',  'u_owner',  45000, '2026-01-01', 'rate ตั้งต้น', 1767200000000),
  ('r_pond_1',   'u_pond',   40000, '2026-01-01', 'rate ตั้งต้น', 1767200000000),
  ('r_nam_1',    'u_nam',    35000, '2026-01-01', 'rate ตั้งต้น', 1767200000000),
  ('r_beam_1',   'u_beam',   38000, '2026-01-01', 'rate ตั้งต้น', 1767200000000),
  ('r_korn_1',   'u_korn',   42000, '2026-01-01', 'rate ตั้งต้น', 1767200000000),
  ('r_jay_1',    'u_jay',    36000, '2026-01-01', 'rate ตั้งต้น', 1767200000000),
  ('r_fah_1',    'u_fah',    32000, '2026-01-01', 'rate ตั้งต้น', 1767200000000),
  ('r_praew_1',  'u_praew',  30000, '2026-01-01', 'rate ตั้งต้น', 1767200000000),
  ('r_toon_1',   'u_toon',   20000, '2026-01-01', 'rate ตั้งต้น', 1767200000000),
  ('r_mint_1',   'u_mint',   34000, '2026-01-01', 'rate ตั้งต้น', 1767200000000),
  ('r_somchai_1','u_somchai',35000, '2026-01-01', 'vendor rate',  1767200000000);
