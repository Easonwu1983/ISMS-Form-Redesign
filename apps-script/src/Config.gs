const APP_META = {
  serviceName: 'isms-cats-backend',
  version: 'v2.1'
};

const SHEET_NAMES = {
  config: 'SYS_CONFIG',
  users: 'USERS',
  units: 'UNITS',
  sequences: 'SEQUENCES',

  carItems: 'CAR_ITEMS',
  carTrackings: 'CAR_TRACKINGS',
  carAttachments: 'CAR_ATTACHMENTS',
  carHistory: 'CAR_HISTORY',

  checklistTemplates: 'CHECKLIST_TEMPLATES',
  checklistForms: 'CHECKLIST_FORMS',
  checklistResults: 'CHECKLIST_RESULTS',

  trainingRosters: 'TRAINING_ROSTERS',
  trainingForms: 'TRAINING_FORMS',
  trainingRecords: 'TRAINING_RECORDS',
  trainingFiles: 'TRAINING_FILES',
  trainingHistory: 'TRAINING_HISTORY',

  passwordHistory: 'PASSWORD_HISTORY',
  passwordResets: 'PASSWORD_RESETS',
  loginSessions: 'LOGIN_SESSIONS',
  loginLogs: 'LOGIN_LOGS',
  apiAudit: 'API_AUDIT'
};

const APP_LIMITS = {
  defaultPageSize: 30,
  maxPageSize: 200
};

function nowIso_() {
  return new Date().toISOString();
}

function createRequestId_() {
  return Utilities.getUuid();
}

function getSpreadsheet_() {
  const ssid = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (ssid) return SpreadsheetApp.openById(ssid);

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw createHttpError_('CONFIG_ERROR', 'Spreadsheet not found. Set SPREADSHEET_ID script property.');
  }
  return active;
}

function safeToBool_(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return false;
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'y';
}

function getConfigValue_(key, fallbackValue) {
  const configMap = getConfigMap_();
  const value = configMap[String(key || '')];
  if (value === undefined || value === null || value === '') return fallbackValue;
  return value;
}

function getNumberConfig_(key, fallbackValue) {
  const raw = Number(getConfigValue_(key, fallbackValue));
  if (!Number.isFinite(raw)) return Number(fallbackValue);
  return raw;
}

function getIntConfig_(key, fallbackValue, min, max) {
  let n = Math.floor(getNumberConfig_(key, fallbackValue));
  if (Number.isFinite(min)) n = Math.max(min, n);
  if (Number.isFinite(max)) n = Math.min(max, n);
  return n;
}

function getAllowedDomain_() {
  return String(getConfigValue_('allowed_domain', '') || '').trim().toLowerCase();
}

function getTimezone_() {
  return String(getConfigValue_('timezone', Session.getScriptTimeZone() || 'Asia/Taipei'));
}

function getMailSender_() {
  return String(getConfigValue_('mail_sender', '') || '').trim().toLowerCase();
}

function getLogRetentionDays_() {
  return getIntConfig_('log_retention_days', 180, 30, 3650);
}
