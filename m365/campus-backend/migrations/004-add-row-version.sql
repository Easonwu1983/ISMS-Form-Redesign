-- ============================================================
-- Optimistic locking — Add row_version column to high-contention tables
-- Run AFTER 003-add-constraints.sql (idempotent)
-- ============================================================

BEGIN;

-- ── Add row_version to tables that support concurrent edits ──

ALTER TABLE corrective_actions ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE training_forms ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE checklists ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE unit_contact_applications ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1;

-- ── Auto-increment row_version on update ─────────────────────

CREATE OR REPLACE FUNCTION increment_row_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.row_version = COALESCE(OLD.row_version, 0) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_corrective_actions_row_version ON corrective_actions;
CREATE TRIGGER trg_corrective_actions_row_version BEFORE UPDATE ON corrective_actions
  FOR EACH ROW EXECUTE FUNCTION increment_row_version();

DROP TRIGGER IF EXISTS trg_training_forms_row_version ON training_forms;
CREATE TRIGGER trg_training_forms_row_version BEFORE UPDATE ON training_forms
  FOR EACH ROW EXECUTE FUNCTION increment_row_version();

DROP TRIGGER IF EXISTS trg_checklists_row_version ON checklists;
CREATE TRIGGER trg_checklists_row_version BEFORE UPDATE ON checklists
  FOR EACH ROW EXECUTE FUNCTION increment_row_version();

DROP TRIGGER IF EXISTS trg_system_users_row_version ON system_users;
CREATE TRIGGER trg_system_users_row_version BEFORE UPDATE ON system_users
  FOR EACH ROW EXECUTE FUNCTION increment_row_version();

DROP TRIGGER IF EXISTS trg_applications_row_version ON unit_contact_applications;
CREATE TRIGGER trg_applications_row_version BEFORE UPDATE ON unit_contact_applications
  FOR EACH ROW EXECUTE FUNCTION increment_row_version();

COMMIT;
