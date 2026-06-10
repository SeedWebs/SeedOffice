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

-- task groups + tasks ของ ทรัพย์เจริญ (ตาม mockup project detail)
INSERT OR REPLACE INTO task_groups (id, project_id, name, sort_order) VALUES
  ('g_sap_design','p_sap','Design',0),
  ('g_sap_fe','p_sap','Frontend',1),
  ('g_sap_be','p_sap','Backend',2),
  ('g_sap_stg','p_sap','Staging',3),
  ('g_sap_uat','p_sap','UAT',4),
  ('g_sap_live','p_sap','Go Live',5),
  ('g_sap_ma','p_sap','MA',6),
  ('g_bloom_fe','p_bloom','Frontend',0),
  ('g_bloom_be','p_bloom','Backend',1),
  ('g_baansuan_ma','p_baansuan','งานประจำ',0),
  ('g_glow_ma','p_glow','งานประจำ',0),
  ('g_somwang_ma','p_somwang','งานประจำ',0),
  ('g_daoden_ma','p_daoden','งานประจำ',0);

INSERT OR REPLACE INTO tasks (id, project_id, group_id, sort_order, title, description, assignee_id, status, priority, estimate_minutes, start_date, due_date, created_by, created_at, completed_at) VALUES
  ('t_sap_hero','p_sap','g_sap_design',0,'Hero section',NULL,'u_nam','done','normal',1320,'2026-01-05','2026-02-10','u_owner',1767200000000,1767300000000),
  ('t_sap_about','p_sap','g_sap_design',1,'หน้า About + ทีม',NULL,'u_nam','doing','normal',480,'2026-02-01','2026-06-11','u_owner',1767200000000,NULL),
  ('t_sap_product','p_sap','g_sap_fe',0,'หน้า Product','ทำหน้า product listing + filter ตาม design ใน Figma รองรับ responsive','u_owner','doing','high',1860,'2026-02-10','2026-06-15','u_owner',1767200000000,NULL),
  ('t_sap_api','p_sap','g_sap_fe',1,'เชื่อม API สินค้า',NULL,'u_pond','todo','normal',NULL,'2026-03-01','2026-06-10','u_owner',1767200000000,NULL),
  ('t_sap_resp','p_sap','g_sap_fe',2,'ปรับ responsive มือถือ',NULL,'u_beam','todo','normal',720,'2026-03-15','2026-06-12','u_owner',1767200000000,NULL),
  ('t_sap_setup','p_sap','g_sap_be',0,'เซ็ตอัพ API + DB schema',NULL,'u_korn','done','normal',1680,'2026-02-10','2026-03-15','u_owner',1767200000000,1767300000000),
  ('t_sap_auth','p_sap','g_sap_be',1,'ระบบสมาชิก / auth',NULL,'u_korn','done','normal',1440,'2026-03-01','2026-04-01','u_owner',1767200000000,1767300000000),
  ('t_sap_pay','p_sap','g_sap_be',2,'เชื่อม payment gateway',NULL,'u_pond','doing','high',1200,'2026-04-01','2026-06-13','u_owner',1767200000000,NULL),
  ('t_sap_stg1','p_sap','g_sap_stg',0,'ขึ้น staging server',NULL,'u_korn','done','normal',360,'2026-04-16','2026-05-01','u_owner',1767200000000,1767300000000),
  ('t_sap_stg2','p_sap','g_sap_stg',1,'ทดสอบ regression',NULL,'u_beam','doing','normal',720,'2026-05-01','2026-06-20','u_owner',1767200000000,NULL),
  ('t_sap_uat1','p_sap','g_sap_uat',0,'ลูกค้าทดสอบ + เก็บ feedback',NULL,'u_owner','todo','normal',NULL,'2026-05-07','2026-06-21','u_owner',1767200000000,NULL),
  ('t_sap_live1','p_sap','g_sap_live',0,'ย้ายขึ้น production',NULL,'u_korn','todo','high',NULL,'2026-06-21','2026-06-30','u_owner',1767200000000,NULL),
  ('t_bloom_checkout','p_bloom','g_bloom_fe',0,'ทำหน้า checkout',NULL,'u_pond','doing','high',2400,'2026-04-01','2026-06-30','u_owner',1767200000000,NULL),
  ('t_bloom_api','p_bloom','g_bloom_be',0,'API สินค้า',NULL,'u_korn','doing','normal',1800,'2026-04-01','2026-07-15','u_owner',1767200000000,NULL),
  ('t_baansuan_menu','p_baansuan','g_baansuan_ma',0,'อัปเดตเมนูหน้าร้าน',NULL,'u_nam','todo','normal',120,NULL,'2026-06-11','u_owner',1767200000000,NULL),
  ('t_glow_banner','p_glow','g_glow_ma',0,'แก้แบนเนอร์โปรโมชัน',NULL,'u_fah','todo','normal',90,NULL,'2026-06-09','u_owner',1767200000000,NULL),
  ('t_somwang_ssl','p_somwang','g_somwang_ma',0,'ต่ออายุ SSL + domain',NULL,'u_korn','todo','normal',60,NULL,'2026-06-12','u_owner',1767200000000,NULL),
  ('t_daoden_news','p_daoden','g_daoden_ma',0,'เพิ่มข่าวรับสมัคร',NULL,'u_praew','todo','normal',60,NULL,'2026-06-15','u_owner',1767200000000,NULL);

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
