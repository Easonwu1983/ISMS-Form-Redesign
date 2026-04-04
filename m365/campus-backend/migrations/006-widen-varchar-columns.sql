-- 006-widen-varchar-columns.sql
-- 修復 VARCHAR 欄位長度不足導致 INSERT 失敗的問題
-- 主要問題：attachments.owner_id(50), attachments.scope(30) 對長 email / scope 字串會溢出

-- attachments 表
ALTER TABLE attachments ALTER COLUMN owner_id TYPE VARCHAR(255);
ALTER TABLE attachments ALTER COLUMN scope TYPE VARCHAR(100);
ALTER TABLE attachments ALTER COLUMN record_type TYPE VARCHAR(100);

-- unit_contact_applications 表 — 統一放寬短欄位
ALTER TABLE unit_contact_applications ALTER COLUMN primary_unit_code TYPE VARCHAR(100);
ALTER TABLE unit_contact_applications ALTER COLUMN secondary_unit_code TYPE VARCHAR(100);
ALTER TABLE unit_contact_applications ALTER COLUMN unit_code TYPE VARCHAR(100);
ALTER TABLE unit_contact_applications ALTER COLUMN status_label TYPE VARCHAR(100);
ALTER TABLE unit_contact_applications ALTER COLUMN backend_mode TYPE VARCHAR(100);

-- corrective_actions 表
ALTER TABLE corrective_actions ALTER COLUMN clause TYPE VARCHAR(100);
ALTER TABLE corrective_actions ALTER COLUMN review_result TYPE VARCHAR(100);
ALTER TABLE corrective_actions ALTER COLUMN record_source TYPE VARCHAR(100);
ALTER TABLE corrective_actions ALTER COLUMN proposer_unit_code TYPE VARCHAR(100);
ALTER TABLE corrective_actions ALTER COLUMN handler_unit_code TYPE VARCHAR(100);

-- checklists 表
ALTER TABLE checklists ALTER COLUMN unit_code TYPE VARCHAR(100);
ALTER TABLE checklists ALTER COLUMN record_source TYPE VARCHAR(100);

-- training_forms 表
ALTER TABLE training_forms ALTER COLUMN unit_code TYPE VARCHAR(100);
ALTER TABLE training_forms ALTER COLUMN record_source TYPE VARCHAR(100);

-- training_rosters 表
ALTER TABLE training_rosters ALTER COLUMN roster_id TYPE VARCHAR(100);
ALTER TABLE training_rosters ALTER COLUMN identity TYPE VARCHAR(100);
ALTER TABLE training_rosters ALTER COLUMN record_source TYPE VARCHAR(100);

-- ops_audit 表
ALTER TABLE ops_audit ALTER COLUMN record_id TYPE VARCHAR(100);
ALTER TABLE ops_audit ALTER COLUMN record_source TYPE VARCHAR(100);

-- review_scopes 表
ALTER TABLE review_scopes ALTER COLUMN unit_code TYPE VARCHAR(100);
ALTER TABLE review_scopes ALTER COLUMN record_source TYPE VARCHAR(100);
