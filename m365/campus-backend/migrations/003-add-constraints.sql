-- ============================================================
-- Schema hardening — Foreign keys, CHECK constraints, unique indexes
-- Run AFTER 002-schema-adjustments.sql
-- ============================================================

BEGIN;

-- ── Foreign key constraints ────────────────────────────────────

-- unit_review_scopes → system_users
ALTER TABLE unit_review_scopes
  ADD CONSTRAINT fk_review_scopes_username
  FOREIGN KEY (username) REFERENCES system_users(username)
  ON DELETE CASCADE;

-- training_rosters → training_forms (via unit)
-- Note: rosters are per-unit, not per-form, so no direct FK to training_forms.

-- attachments — no direct FK since owner_id is polymorphic (checklist, corrective-action, etc.)

-- ── CHECK constraints for enum-like VARCHAR columns ────────────

-- unit_contact_applications.status
ALTER TABLE unit_contact_applications
  ADD CONSTRAINT chk_applications_status
  CHECK (status IN (
    'pending_review', 'returned', 'approved', 'rejected',
    'activation_pending', 'active'
  ));

-- checklists.status
ALTER TABLE checklists
  ADD CONSTRAINT chk_checklists_status
  CHECK (status IN ('草稿', '已送出'));

-- checklists.sign_status
ALTER TABLE checklists
  ADD CONSTRAINT chk_checklists_sign_status
  CHECK (sign_status IN ('待簽核', '已簽核'));

-- corrective_actions.status
ALTER TABLE corrective_actions
  ADD CONSTRAINT chk_corrective_actions_status
  CHECK (status IN ('開立', '待矯正', '已提案', '審核中', '追蹤中', '結案'));

-- corrective_actions.deficiency_type
ALTER TABLE corrective_actions
  ADD CONSTRAINT chk_corrective_actions_deficiency_type
  CHECK (deficiency_type IN ('主要缺失', '次要缺失', '觀察', '建議'));

-- training_forms.status
ALTER TABLE training_forms
  ADD CONSTRAINT chk_training_forms_status
  CHECK (status IN ('暫存', '待簽核', '已完成填報', '退回更正'));

-- system_users.role
ALTER TABLE system_users
  ADD CONSTRAINT chk_system_users_role
  CHECK (role IN ('最高管理員', '單位管理員'));

-- ── Composite unique indexes for duplicate prevention ──────────

-- Prevent duplicate applications from same email to same unit
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_email_unit_active
  ON unit_contact_applications (LOWER(applicant_email), unit_value)
  WHERE status IN ('pending_review', 'approved', 'activation_pending');

-- Enforce unique email on system_users (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_system_users_email_unique
  ON system_users (LOWER(email));

-- Prevent duplicate unit_admin entries for same email + unit
CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_admins_email_unit_active
  ON unit_admins (LOWER(email), unit_code)
  WHERE status IN ('pending_activation', 'active');

-- ── Partial indexes for common filtered queries ────────────────

-- Active applications (frequently queried subset)
CREATE INDEX IF NOT EXISTS idx_applications_active
  ON unit_contact_applications (submitted_at DESC)
  WHERE status IN ('pending_review', 'activation_pending');

-- Open corrective actions
CREATE INDEX IF NOT EXISTS idx_corrective_actions_open
  ON corrective_actions (corrective_due_date)
  WHERE status NOT IN ('結案');

-- Submitted checklists
CREATE INDEX IF NOT EXISTS idx_checklists_submitted
  ON checklists (audit_year, unit)
  WHERE status = '已送出';

-- ── Attachments file_size constraint ───────────────────────────

ALTER TABLE attachments
  ADD CONSTRAINT chk_attachments_file_size
  CHECK (file_size >= 0 AND file_size <= 10485760); -- 10 MB

COMMIT;
