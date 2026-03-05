const SHEET_SCHEMAS = {
  [SHEET_NAMES.config]: ['key', 'value', 'note'],
  [SHEET_NAMES.users]: [
    'id',
    'username',
    'password_hash',
    'password_salt',
    'email',
    'name',
    'role',
    'unit',
    'sub_unit',
    'employee_no',
    'is_active',
    'must_change_password',
    'password_changed_at',
    'password_expires_at',
    'failed_count',
    'locked_until',
    'last_login_at',
    'created_at',
    'updated_at',
    'row_version'
  ],
  [SHEET_NAMES.units]: ['unit', 'sub_unit', 'is_active'],
  [SHEET_NAMES.sequences]: ['key', 'next_no'],

  [SHEET_NAMES.carItems]: [
    'id', 'status',
    'proposer_unit', 'proposer_name', 'proposer_email', 'proposer_date',
    'handler_unit', 'handler_name', 'handler_email', 'handler_date',
    'deficiency_type', 'source', 'categories_json', 'clause',
    'problem_desc', 'occurrence',
    'corrective_action', 'corrective_due_date',
    'root_cause', 'root_elimination', 'root_elim_due_date',
    'risk_desc', 'risk_acceptor', 'risk_accept_date', 'risk_assess_date',
    'closed_date', 'created_at', 'updated_at', 'row_version', 'is_deleted'
  ],
  [SHEET_NAMES.carTrackings]: ['id', 'car_id', 'round_no', 'tracker', 'track_date', 'execution', 'track_note', 'result', 'next_track_date', 'reviewer', 'review_date', 'created_at'],
  [SHEET_NAMES.carAttachments]: ['id', 'car_id', 'file_name', 'mime_type', 'file_id', 'file_url', 'uploaded_by', 'uploaded_at'],
  [SHEET_NAMES.carHistory]: ['id', 'car_id', 'action', 'actor', 'actor_email', 'created_at'],

  [SHEET_NAMES.checklistTemplates]: ['id', 'section_no', 'section_title', 'item_id', 'item_text', 'hint', 'is_active', 'updated_at'],
  [SHEET_NAMES.checklistForms]: ['id', 'unit', 'sub_unit', 'filler_name', 'filler_email', 'fill_date', 'audit_year', 'supervisor', 'status', 'total', 'conform', 'partial', 'non_conform', 'na', 'created_at', 'updated_at', 'row_version', 'is_deleted'],
  [SHEET_NAMES.checklistResults]: ['id', 'checklist_id', 'item_id', 'compliance', 'execution', 'evidence', 'created_at', 'updated_at'],

  [SHEET_NAMES.trainingRosters]: ['id', 'unit', 'name', 'source', 'created_by', 'created_at', 'is_deleted'],
  [SHEET_NAMES.trainingForms]: ['id', 'unit', 'filler_name', 'filler_email', 'fill_date', 'training_year', 'status', 'return_reason', 'total_people', 'filled_people', 'reached', 'total_hours', 'avg_hours', 'reach_rate', 'submitted_at', 'created_at', 'updated_at', 'row_version'],
  [SHEET_NAMES.trainingRecords]: ['id', 'training_id', 'name', 'source', 'hours', 'note', 'updated_at'],
  [SHEET_NAMES.trainingFiles]: ['id', 'training_id', 'file_name', 'mime_type', 'file_id', 'file_url', 'uploaded_by', 'uploaded_at'],
  [SHEET_NAMES.trainingHistory]: ['id', 'training_id', 'action', 'actor', 'actor_email', 'created_at'],

  [SHEET_NAMES.passwordHistory]: ['id', 'user_id', 'username', 'password_hash', 'password_salt', 'changed_at', 'changed_by', 'reason'],
  [SHEET_NAMES.passwordResets]: ['id', 'user_id', 'username', 'email', 'token_hash', 'requested_at', 'expires_at', 'used_at', 'request_ip', 'request_ua'],
  [SHEET_NAMES.loginSessions]: ['id', 'session_token_hash', 'user_id', 'username', 'issued_at', 'expires_at', 'revoked_at', 'ip', 'ua', 'last_seen_at'],
  [SHEET_NAMES.loginLogs]: ['id', 'time', 'username', 'email', 'name', 'role', 'success', 'ip', 'ua', 'message', 'integrity_hash'],
  [SHEET_NAMES.apiAudit]: ['id', 'request_id', 'action', 'actor_email', 'actor_username', 'status', 'message', 'integrity_hash', 'created_at']
};

const DEFAULT_SYS_CONFIG_ROWS = [
  { key: 'allowed_domain', value: '', note: 'Legacy field. Keep blank when using username/password auth.' },
  { key: 'timezone', value: 'Asia/Taipei', note: 'Display timezone' },
  { key: 'max_upload_mb', value: '5', note: 'Upload limit (MB)' },
  { key: 'auto_provision_user', value: 'FALSE', note: 'Deprecated under username/password auth.' },

  { key: 'session_ttl_hours', value: '12', note: 'Login session validity in hours' },
  { key: 'login_max_failures', value: '5', note: 'Max failed password attempts before lock' },
  { key: 'login_lock_minutes', value: '15', note: 'Account lock duration in minutes' },
  { key: 'login_rate_limit_window_minutes', value: '15', note: 'Window for API login rate limit' },
  { key: 'login_rate_limit_max_attempts', value: '10', note: 'Max login attempts per account+IP in window' },

  { key: 'password_min_length', value: '12', note: 'Minimum password length' },
  { key: 'password_require_upper', value: 'TRUE', note: 'Password needs uppercase letter' },
  { key: 'password_require_lower', value: 'TRUE', note: 'Password needs lowercase letter' },
  { key: 'password_require_digit', value: 'TRUE', note: 'Password needs digit' },
  { key: 'password_require_special', value: 'TRUE', note: 'Password needs special character' },
  { key: 'password_history_count', value: '3', note: 'Cannot reuse latest N passwords' },
  { key: 'password_max_age_days', value: '90', note: 'Password expiration days' },
  { key: 'reset_token_ttl_minutes', value: '15', note: 'Reset token valid minutes' },

  { key: 'log_retention_days', value: '180', note: 'Security logs retention days (minimum 180 for 普級)' },
  { key: 'mail_sender', value: 'easonwu@g.ntu.edu.tw', note: 'Preferred from-address alias for GmailApp' }
];

const DEFAULT_SEQUENCE_ROWS = [
  { key: 'USR', next_no: 1 },
  { key: 'CAR', next_no: 1 },
  { key: 'CHK', next_no: 1 },
  { key: 'TRN', next_no: 1 },
  { key: 'RST', next_no: 1 },
  { key: 'TRK', next_no: 1 },
  { key: 'ATC', next_no: 1 },
  { key: 'HIS', next_no: 1 },
  { key: 'CHR', next_no: 1 },
  { key: 'TRR', next_no: 1 },
  { key: 'TRF', next_no: 1 },
  { key: 'THS', next_no: 1 },

  { key: 'SES', next_no: 1 },
  { key: 'PWH', next_no: 1 },
  { key: 'RSTK', next_no: 1 },
  { key: 'LOG', next_no: 1 },
  { key: 'AUD', next_no: 1 }
];
