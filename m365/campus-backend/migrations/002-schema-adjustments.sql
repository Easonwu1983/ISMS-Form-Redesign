-- ============================================================
-- Schema adjustments — reconcile 001 schema with Sprint-2 code
-- Run AFTER 001-initial-schema.sql
-- ============================================================

BEGIN;

-- ── system_users: add missing columns used by system-user-backend.cjs ──

ALTER TABLE system_users ADD COLUMN IF NOT EXISTS name VARCHAR(100);
-- backfill name from display_name
UPDATE system_users SET name = display_name WHERE name IS NULL OR name = '';

ALTER TABLE system_users ADD COLUMN IF NOT EXISTS scope_units_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS units_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS unit VARCHAR(100);

-- ── unit_contact_applications: add/rename columns for server.cjs ──

-- server.cjs references primary_unit / secondary_unit (not primary_unit_code / name)
ALTER TABLE unit_contact_applications ADD COLUMN IF NOT EXISTS primary_unit VARCHAR(200);
ALTER TABLE unit_contact_applications ADD COLUMN IF NOT EXISTS secondary_unit VARCHAR(200);
ALTER TABLE unit_contact_applications ADD COLUMN IF NOT EXISTS security_roles_json JSONB;
ALTER TABLE unit_contact_applications ADD COLUMN IF NOT EXISTS status_label VARCHAR(50);
ALTER TABLE unit_contact_applications ADD COLUMN IF NOT EXISTS status_detail TEXT;

-- backfill primary_unit from existing columns
UPDATE unit_contact_applications
  SET primary_unit = COALESCE(primary_unit_name, primary_unit_code)
  WHERE primary_unit IS NULL;
UPDATE unit_contact_applications
  SET secondary_unit = COALESCE(secondary_unit_name, secondary_unit_code)
  WHERE secondary_unit IS NULL;

-- ── attachments: adjust column names for attachment-backend.cjs ──

-- code uses storage_path, but schema has file_path
ALTER TABLE attachments RENAME COLUMN file_path TO storage_path;

-- add missing columns
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS backend_mode VARCHAR(30);
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS record_source VARCHAR(50);

-- ── unit_contact_applications: relax NOT NULL for migration flexibility ──

-- contact_type might come as text from SharePoint, not always enum-compatible
ALTER TABLE unit_contact_applications ALTER COLUMN contact_type TYPE VARCHAR(20);
ALTER TABLE unit_contact_applications ALTER COLUMN status TYPE VARCHAR(30);
-- drop NOT NULL on non-essential fields for migration
ALTER TABLE unit_contact_applications ALTER COLUMN extension_number DROP NOT NULL;
ALTER TABLE unit_contact_applications ALTER COLUMN unit_category DROP NOT NULL;
ALTER TABLE unit_contact_applications ALTER COLUMN primary_unit_code DROP NOT NULL;
ALTER TABLE unit_contact_applications ALTER COLUMN primary_unit_name DROP NOT NULL;
ALTER TABLE unit_contact_applications ALTER COLUMN unit_code DROP NOT NULL;
ALTER TABLE unit_contact_applications ALTER COLUMN unit_value DROP NOT NULL;

-- ── corrective_actions: relax status to VARCHAR for migration ──

ALTER TABLE corrective_actions ALTER COLUMN status TYPE VARCHAR(30);
ALTER TABLE corrective_actions ALTER COLUMN deficiency_type TYPE VARCHAR(30);

-- ── checklists: relax enums to VARCHAR for migration ──

ALTER TABLE checklists ALTER COLUMN sign_status TYPE VARCHAR(30);
ALTER TABLE checklists ALTER COLUMN status TYPE VARCHAR(30);

-- ── training_forms: relax status to VARCHAR ──

ALTER TABLE training_forms ALTER COLUMN status TYPE VARCHAR(30);

-- ── training_rosters: relax source to VARCHAR ──

ALTER TABLE training_rosters ALTER COLUMN source TYPE VARCHAR(20);

-- ── system_users: relax role to VARCHAR ──

ALTER TABLE system_users ALTER COLUMN role TYPE VARCHAR(30);

-- ── unit_admins: relax enums ──

ALTER TABLE unit_admins ALTER COLUMN contact_type TYPE VARCHAR(20);
ALTER TABLE unit_admins ALTER COLUMN status TYPE VARCHAR(30);

COMMIT;
