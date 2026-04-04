-- 007-add-indexes.sql
-- Performance indexes for frequently queried columns

-- Dashboard summary: checklists by year + unit
CREATE INDEX IF NOT EXISTS idx_checklists_audit_year_unit
  ON checklists (audit_year, unit);

-- Dashboard summary: training forms by year + unit
CREATE INDEX IF NOT EXISTS idx_training_forms_training_year_unit
  ON training_forms (training_year, unit);

-- My-tasks page: corrective actions by status + handler
CREATE INDEX IF NOT EXISTS idx_corrective_actions_status_handler
  ON corrective_actions (status, handler_username);

-- Review page: unit contact applications by status + applicant
CREATE INDEX IF NOT EXISTS idx_unit_contact_applications_status_email
  ON unit_contact_applications (status, applicant_email);

-- Audit trail: ops_audit by occurrence time
CREATE INDEX IF NOT EXISTS idx_ops_audit_occurred_at
  ON ops_audit (occurred_at);

-- Attachment lookup: by owner + scope
CREATE INDEX IF NOT EXISTS idx_attachments_owner_scope
  ON attachments (owner_id, scope);
