-- ============================================================
-- ISMS PostgreSQL Schema — M365 SharePoint Migration
-- Version: 001-initial-schema (idempotent)
-- ============================================================

BEGIN;

-- ── ENUM types (use DO block for idempotency) ──────────────

DO $$ BEGIN
  CREATE TYPE application_status AS ENUM (
    'pending_review', 'returned', 'approved', 'rejected',
    'activation_pending', 'active'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE contact_type AS ENUM ('primary', 'backup');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE unit_admin_status AS ENUM (
  'pending_activation', 'active', 'disabled', 'revoked'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE checklist_sign_status AS ENUM ('待簽核', '已簽核');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE checklist_status AS ENUM ('草稿', '已送出');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE corrective_deficiency_type AS ENUM ('主要缺失', '次要缺失', '觀察', '建議');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE corrective_status AS ENUM ('開立', '待矯正', '已提案', '審核中', '追蹤中', '結案');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE training_status AS ENUM ('暫存', '待簽核', '已完成填報', '退回更正');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE roster_source AS ENUM ('import', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE user_role AS ENUM ('最高管理員', '單位管理員');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE record_source AS ENUM ('frontend', 'manual', 'migration');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 1. unit_contact_applications ────────────────────────────

CREATE TABLE IF NOT EXISTS unit_contact_applications (
  id              SERIAL PRIMARY KEY,
  title           VARCHAR(255),
  application_id  VARCHAR(20) NOT NULL UNIQUE,
  applicant_name  VARCHAR(100) NOT NULL,
  applicant_email VARCHAR(255) NOT NULL,
  extension_number VARCHAR(20) NOT NULL,
  unit_category   VARCHAR(20) NOT NULL,
  primary_unit_code VARCHAR(50) NOT NULL,
  primary_unit_name VARCHAR(100) NOT NULL,
  secondary_unit_code VARCHAR(50),
  secondary_unit_name VARCHAR(100),
  unit_code       VARCHAR(50) NOT NULL,
  unit_value      VARCHAR(200) NOT NULL,
  contact_type    contact_type NOT NULL,
  status          application_status NOT NULL DEFAULT 'pending_review',
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     VARCHAR(255),
  review_comment  TEXT,
  activation_sent_at TIMESTAMPTZ,
  activated_at    TIMESTAMPTZ,
  provisioned_at  TIMESTAMPTZ,
  provisioned_by  VARCHAR(255),
  provisioning_note TEXT,
  app_username    VARCHAR(100),
  external_user_id VARCHAR(255),
  authorization_doc_attachment_id VARCHAR(100),
  authorization_doc_file_name VARCHAR(255),
  authorization_doc_content_type VARCHAR(100),
  authorization_doc_size INTEGER,
  authorization_doc_uploaded_at TIMESTAMPTZ,
  authorization_doc_drive_item_id VARCHAR(255),
  authorized_units_json JSONB,
  source          VARCHAR(20) NOT NULL DEFAULT 'frontend',
  backend_mode    VARCHAR(30),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. unit_admins ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS unit_admins (
  id              SERIAL PRIMARY KEY,
  title           VARCHAR(255),
  external_user_id VARCHAR(255),
  display_name    VARCHAR(100) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  app_username    VARCHAR(100),
  extension_number VARCHAR(20),
  unit_code       VARCHAR(50) NOT NULL,
  unit_name       VARCHAR(100) NOT NULL,
  contact_type    contact_type NOT NULL,
  status          unit_admin_status NOT NULL DEFAULT 'pending_activation',
  activated_at    TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  last_application_id VARCHAR(20),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. checklists ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS checklists (
  id              SERIAL PRIMARY KEY,
  checklist_id    VARCHAR(30) NOT NULL UNIQUE,
  document_no     VARCHAR(30),
  checklist_seq   INTEGER,
  unit            VARCHAR(100) NOT NULL,
  unit_code       VARCHAR(50),
  filler_name     VARCHAR(100) NOT NULL,
  filler_username VARCHAR(100),
  fill_date       TIMESTAMPTZ NOT NULL,
  audit_year      VARCHAR(10) NOT NULL,
  supervisor_name VARCHAR(100),
  supervisor_title VARCHAR(100),
  sign_status     checklist_sign_status NOT NULL DEFAULT '待簽核',
  sign_date       TIMESTAMPTZ,
  supervisor_note TEXT,
  results_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary_total   INTEGER NOT NULL DEFAULT 0,
  summary_conform INTEGER NOT NULL DEFAULT 0,
  summary_partial INTEGER NOT NULL DEFAULT 0,
  summary_non_conform INTEGER NOT NULL DEFAULT 0,
  summary_na      INTEGER NOT NULL DEFAULT 0,
  status          checklist_status NOT NULL DEFAULT '草稿',
  backend_mode    VARCHAR(30),
  record_source   VARCHAR(50),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. corrective_actions ───────────────────────────────────

CREATE TABLE IF NOT EXISTS corrective_actions (
  id              SERIAL PRIMARY KEY,
  case_id         VARCHAR(30) NOT NULL UNIQUE,
  document_no     VARCHAR(30),
  case_seq        INTEGER,
  proposer_unit   VARCHAR(100) NOT NULL,
  proposer_unit_code VARCHAR(50),
  proposer_name   VARCHAR(100) NOT NULL,
  proposer_username VARCHAR(100),
  proposer_date   TIMESTAMPTZ NOT NULL,
  handler_unit    VARCHAR(100) NOT NULL,
  handler_unit_code VARCHAR(50),
  handler_name    VARCHAR(100) NOT NULL,
  handler_username VARCHAR(100),
  handler_email   VARCHAR(255),
  handler_date    TIMESTAMPTZ,
  deficiency_type corrective_deficiency_type NOT NULL,
  source          VARCHAR(20) NOT NULL,
  category_json   JSONB NOT NULL DEFAULT '[]'::jsonb,
  clause          VARCHAR(50),
  problem_description TEXT NOT NULL,
  occurrence      TEXT NOT NULL,
  corrective_action TEXT,
  corrective_due_date TIMESTAMPTZ NOT NULL,
  root_cause      TEXT,
  risk_description TEXT,
  risk_acceptor   VARCHAR(100),
  risk_accept_date TIMESTAMPTZ,
  risk_assess_date TIMESTAMPTZ,
  root_elimination TEXT,
  root_elimination_due_date TIMESTAMPTZ,
  review_result   VARCHAR(50),
  review_next_date TIMESTAMPTZ,
  reviewer        VARCHAR(100),
  review_date     TIMESTAMPTZ,
  pending_tracking_json JSONB,
  trackings_json  JSONB NOT NULL DEFAULT '[]'::jsonb,
  status          corrective_status NOT NULL DEFAULT '開立',
  evidence_json   JSONB NOT NULL DEFAULT '[]'::jsonb,
  history_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
  closed_date     TIMESTAMPTZ,
  backend_mode    VARCHAR(30),
  record_source   VARCHAR(50),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. training_forms ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS training_forms (
  id              SERIAL PRIMARY KEY,
  form_id         VARCHAR(30) NOT NULL UNIQUE,
  document_no     VARCHAR(30),
  form_seq        INTEGER,
  unit            VARCHAR(100) NOT NULL,
  unit_code       VARCHAR(50),
  stats_unit      VARCHAR(100),
  filler_name     VARCHAR(100) NOT NULL,
  filler_username VARCHAR(100),
  submitter_phone VARCHAR(30),
  submitter_email VARCHAR(255),
  fill_date       TIMESTAMPTZ NOT NULL,
  training_year   VARCHAR(10) NOT NULL,
  status          training_status NOT NULL DEFAULT '暫存',
  records_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  active_count    INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  incomplete_count INTEGER NOT NULL DEFAULT 0,
  completion_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  signed_files_json JSONB,
  return_reason   TEXT,
  step_one_submitted_at TIMESTAMPTZ,
  printed_at      TIMESTAMPTZ,
  signoff_uploaded_at TIMESTAMPTZ,
  submitted_at    TIMESTAMPTZ,
  history_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
  backend_mode    VARCHAR(30),
  record_source   VARCHAR(50),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. training_rosters ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS training_rosters (
  id              SERIAL PRIMARY KEY,
  roster_id       VARCHAR(50) NOT NULL UNIQUE,
  unit            VARCHAR(100) NOT NULL,
  stats_unit      VARCHAR(100),
  l1_unit         VARCHAR(100),
  name            VARCHAR(100) NOT NULL,
  unit_name       VARCHAR(100),
  identity        VARCHAR(50),
  job_title       VARCHAR(100),
  source          roster_source NOT NULL DEFAULT 'manual',
  created_by      VARCHAR(100),
  created_by_username VARCHAR(100),
  backend_mode    VARCHAR(30),
  record_source   VARCHAR(50),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 7. system_users ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_users (
  id              SERIAL PRIMARY KEY,
  username        VARCHAR(100) NOT NULL UNIQUE,
  password        VARCHAR(255),
  password_secret TEXT,
  display_name    VARCHAR(100) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  role            user_role NOT NULL DEFAULT '單位管理員',
  security_roles_json JSONB,
  primary_unit    VARCHAR(100),
  authorized_units_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  active_unit     VARCHAR(100),
  password_changed_at TIMESTAMPTZ,
  reset_token_expires_at TIMESTAMPTZ,
  reset_requested_at TIMESTAMPTZ,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  session_version INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  backend_mode    VARCHAR(30),
  record_source   VARCHAR(50),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 8. unit_review_scopes ───────────────────────────────────

CREATE TABLE IF NOT EXISTS unit_review_scopes (
  id              SERIAL PRIMARY KEY,
  review_scope_key VARCHAR(200) NOT NULL UNIQUE,
  username        VARCHAR(100) NOT NULL,
  unit_value      VARCHAR(100) NOT NULL,
  backend_mode    VARCHAR(30),
  record_source   VARCHAR(50),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 9. ops_audit ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ops_audit (
  id              SERIAL PRIMARY KEY,
  title           VARCHAR(255),
  event_type      VARCHAR(100) NOT NULL,
  actor_email     VARCHAR(255),
  target_email    VARCHAR(255),
  unit_code       VARCHAR(50),
  record_id       VARCHAR(50),
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_json    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 10. attachments ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS attachments (
  id              SERIAL PRIMARY KEY,
  attachment_id   VARCHAR(100) NOT NULL UNIQUE,
  scope           VARCHAR(30),
  owner_id        VARCHAR(50),
  record_type     VARCHAR(30),
  content_type    VARCHAR(100),
  file_name       VARCHAR(255) NOT NULL,
  file_size       INTEGER,
  file_path       TEXT NOT NULL,
  uploaded_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes (all idempotent) ────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_applications_status ON unit_contact_applications (status);
CREATE INDEX IF NOT EXISTS idx_applications_applicant_email ON unit_contact_applications (applicant_email);
CREATE INDEX IF NOT EXISTS idx_applications_unit_code ON unit_contact_applications (unit_code);
CREATE INDEX IF NOT EXISTS idx_applications_submitted_at ON unit_contact_applications (submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_updated_at ON unit_contact_applications (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_unit_admins_email ON unit_admins (email);
CREATE INDEX IF NOT EXISTS idx_unit_admins_unit_code ON unit_admins (unit_code);
CREATE INDEX IF NOT EXISTS idx_unit_admins_status ON unit_admins (status);

CREATE INDEX IF NOT EXISTS idx_checklists_unit_year ON checklists (unit, audit_year);
CREATE INDEX IF NOT EXISTS idx_checklists_unit_code ON checklists (unit_code);
CREATE INDEX IF NOT EXISTS idx_checklists_status ON checklists (status);
CREATE INDEX IF NOT EXISTS idx_checklists_filler_username ON checklists (filler_username);

CREATE INDEX IF NOT EXISTS idx_corrective_actions_status ON corrective_actions (status);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_proposer_unit ON corrective_actions (proposer_unit);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_proposer_username ON corrective_actions (proposer_username);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_handler_unit ON corrective_actions (handler_unit);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_handler_username ON corrective_actions (handler_username);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_updated_at ON corrective_actions (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_training_forms_unit ON training_forms (unit);
CREATE INDEX IF NOT EXISTS idx_training_forms_unit_code ON training_forms (unit_code);
CREATE INDEX IF NOT EXISTS idx_training_forms_status ON training_forms (status);
CREATE INDEX IF NOT EXISTS idx_training_forms_training_year ON training_forms (training_year);
CREATE INDEX IF NOT EXISTS idx_training_forms_filler_username ON training_forms (filler_username);

CREATE INDEX IF NOT EXISTS idx_training_rosters_unit ON training_rosters (unit);
CREATE INDEX IF NOT EXISTS idx_training_rosters_name ON training_rosters (name);
CREATE INDEX IF NOT EXISTS idx_training_rosters_identity ON training_rosters (identity);

CREATE INDEX IF NOT EXISTS idx_system_users_email ON system_users (email);
CREATE INDEX IF NOT EXISTS idx_system_users_role ON system_users (role);

CREATE INDEX IF NOT EXISTS idx_review_scopes_username ON unit_review_scopes (username);
CREATE INDEX IF NOT EXISTS idx_review_scopes_unit_value ON unit_review_scopes (unit_value);

CREATE INDEX IF NOT EXISTS idx_ops_audit_event_type ON ops_audit (event_type);
CREATE INDEX IF NOT EXISTS idx_ops_audit_occurred_at ON ops_audit (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_audit_record_id ON ops_audit (record_id);
CREATE INDEX IF NOT EXISTS idx_ops_audit_actor_email ON ops_audit (actor_email);

CREATE INDEX IF NOT EXISTS idx_attachments_scope_owner ON attachments (scope, owner_id);
CREATE INDEX IF NOT EXISTS idx_attachments_record_type ON attachments (record_type);

-- JSONB GIN indexes
CREATE INDEX IF NOT EXISTS idx_applications_authorized_units ON unit_contact_applications USING GIN (authorized_units_json);
CREATE INDEX IF NOT EXISTS idx_system_users_authorized_units ON system_users USING GIN (authorized_units_json);
CREATE INDEX IF NOT EXISTS idx_system_users_security_roles ON system_users USING GIN (security_roles_json);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_category ON corrective_actions USING GIN (category_json);

-- ── Sequences (idempotent) ──────────────────────────────────

DO $$ BEGIN CREATE SEQUENCE seq_application_id START WITH 1; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE SEQUENCE seq_checklist_id START WITH 1; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE SEQUENCE seq_case_id START WITH 1; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE SEQUENCE seq_training_form_id START WITH 1; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE SEQUENCE seq_roster_id START WITH 1; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Helper function: updated_at trigger ─────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers (drop + create for idempotency)
DROP TRIGGER IF EXISTS trg_applications_updated_at ON unit_contact_applications;
CREATE TRIGGER trg_applications_updated_at BEFORE UPDATE ON unit_contact_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_unit_admins_updated_at ON unit_admins;
CREATE TRIGGER trg_unit_admins_updated_at BEFORE UPDATE ON unit_admins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_checklists_updated_at ON checklists;
CREATE TRIGGER trg_checklists_updated_at BEFORE UPDATE ON checklists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_corrective_actions_updated_at ON corrective_actions;
CREATE TRIGGER trg_corrective_actions_updated_at BEFORE UPDATE ON corrective_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_training_forms_updated_at ON training_forms;
CREATE TRIGGER trg_training_forms_updated_at BEFORE UPDATE ON training_forms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_training_rosters_updated_at ON training_rosters;
CREATE TRIGGER trg_training_rosters_updated_at BEFORE UPDATE ON training_rosters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_system_users_updated_at ON system_users;
CREATE TRIGGER trg_system_users_updated_at BEFORE UPDATE ON system_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_review_scopes_updated_at ON unit_review_scopes;
CREATE TRIGGER trg_review_scopes_updated_at BEFORE UPDATE ON unit_review_scopes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
