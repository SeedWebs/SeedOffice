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

-- clients (ตรง mockup CRM)
INSERT OR REPLACE INTO clients (id, name, logo, contact_name, contact_email, contact_phone, note, status, created_at) VALUES
  ('c_sapcharoen','ทรัพย์เจริญ พร็อพเพอร์ตี้','🏢','คุณสมพร','somporn@sapcharoen.example','02-444-7788',NULL,'active',1767200000000),
  ('c_bloom','Bloom Studio','🛍️','คุณแนน','nan@bloom.example','089-111-2233',NULL,'active',1767200000000),
  ('c_dentcare','คลินิกทันตกรรม ยิ้มสวย','🦷','หมอแอน','ann@dentcare.example','02-712-3030',NULL,'active',1767200000000),
  ('c_skillup','SkillUp Academy','🎓','คุณเจษ','jed@skillup.example','086-700-4545',NULL,'active',1767200000000),
  ('c_bright','BrightMedia','📰','คุณบี','b@brightmedia.example','02-555-0199',NULL,'active',1767200000000),
  ('c_campus','CampusLink','🏫','คุณกอล์ฟ','golf@campuslink.example','02-300-1212',NULL,'active',1767200000000),
  ('c_baansuan','ร้านกาแฟ บ้านสวน','☕','คุณฝน','fon@baansuan.example','081-234-5678',NULL,'active',1767200000000),
  ('c_glow','คลินิกความงาม Glow','💄','คุณมุก','mook@glow.example','02-660-7700',NULL,'active',1767200000000),
  ('c_somwang','บจก. สมหวัง Logistics','🚚','คุณวิทย์','wit@somwang.example','02-390-6611',NULL,'active',1767200000000),
  ('c_daoden','โรงเรียนอนุบาลดาวเด่น','🏫','ครูแอน','ann@daoden.example','02-901-2345',NULL,'active',1767200000000);

-- projects: 6 งานโปรเจกต์ + 5 งานต่อเนื่อง + 2 archived (เงิน = สตางค์)
INSERT OR REPLACE INTO projects (id, code, name, logo, client_id, type, status, quoted_satang, billing_type, recurring_period, start_date, due_date, created_at) VALUES
  ('p_sap',  'SAP', 'เว็บไซต์ ทรัพย์เจริญ',        '🏢','c_sapcharoen','project','staging',18000000,'fixed',NULL,'2026-01-01','2026-06-30',1767200000000),
  ('p_bloom','BLM', 'ร้านค้าออนไลน์ Bloom',        '🛍️','c_bloom','project','dev',    25000000,'fixed',NULL,'2026-03-01','2026-08-31',1767200000000),
  ('p_dent', 'DNT', 'ระบบจองคิว คลินิกหมอฟัน',     '🦷','c_dentcare','project','staging',22000000,'fixed',NULL,'2026-02-01','2026-06-30',1767200000000),
  ('p_skill','SKL', 'คอร์สออนไลน์ SkillUp',        '📚','c_skillup','project','dev',   30000000,'fixed',NULL,'2026-05-01','2026-07-31',1767200000000),
  ('p_bright','BRM','แพลตฟอร์มข่าว BrightMedia',   '📰','c_bright','project','golive', 70000000,'fixed',NULL,'2026-01-01','2026-06-30',1767200000000),
  ('p_campus','CPL','พอร์ทัลนักศึกษา CampusLink',  '🎓','c_campus','project','ma',     24000000,'fixed',NULL,'2026-01-01','2026-04-30',1767200000000),
  ('p_baansuan',NULL,'ร้านกาแฟ บ้านสวน',           '☕','c_baansuan','recurring','ma', NULL,'recurring','monthly',NULL,NULL,1767200000000),
  ('p_glow',  NULL,'คลินิกความงาม Glow',           '💄','c_glow','recurring','ma',     NULL,'recurring','monthly',NULL,NULL,1767200000000),
  ('p_somwang',NULL,'บจก. สมหวัง Logistics',       '🚚','c_somwang','recurring','ma',  NULL,'recurring','yearly',NULL,NULL,1767200000000),
  ('p_daoden',NULL,'โรงเรียนอนุบาลดาวเด่น',        '🏫','c_daoden','recurring','ma',   NULL,'recurring','monthly',NULL,NULL,1767200000000),
  ('p_fitzone',NULL,'ฟิตเนส FitZone',              '🏋️',NULL,'recurring','ma',        NULL,'recurring','monthly',NULL,NULL,1767200000000),
  ('p_thairung',NULL,'เว็บเก่า บจก. ไทยรุ่งเรือง', '🗂️',NULL,'project','archived',    9000000,'fixed',NULL,'2024-01-01','2024-06-30',1767200000000),
  ('p_songkran',NULL,'Landing แคมเปญ Songkran 67','🎪',NULL,'project','archived',     3500000,'fixed',NULL,'2024-03-01','2024-04-15',1767200000000);

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
