function setupSpreadsheetTemplate() {
  const ss = getSpreadsheet_();
  const created = [];
  const ensured = [];

  Object.keys(SHEET_SCHEMAS).forEach((sheetName) => {
    const existed = !!ss.getSheetByName(sheetName);
    ensureSheet_(sheetName, SHEET_SCHEMAS[sheetName]);
    if (existed) ensured.push(sheetName); else created.push(sheetName);
  });

  seedSysConfig_();
  seedSequences_();
  seedInitialAdminUser_();

  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    createdSheets: created,
    ensuredSheets: ensured,
    ts: nowIso_()
  };
}

function resetAndRebuildTemplateDangerous() {
  const ss = getSpreadsheet_();
  Object.keys(SHEET_SCHEMAS).forEach((sheetName) => {
    const sheet = ss.getSheetByName(sheetName);
    if (sheet) ss.deleteSheet(sheet);
  });
  return setupSpreadsheetTemplate();
}

function seedSysConfig_() {
  const rows = readSheetRows_(SHEET_NAMES.config);
  const keySet = new Set(rows.map((r) => String(r.key)));
  DEFAULT_SYS_CONFIG_ROWS.forEach((row) => {
    if (!keySet.has(String(row.key))) appendSheetRow_(SHEET_NAMES.config, row);
  });
}

function seedSequences_() {
  const rows = readSheetRows_(SHEET_NAMES.sequences);
  const keySet = new Set(rows.map((r) => String(r.key)));
  DEFAULT_SEQUENCE_ROWS.forEach((row) => {
    if (!keySet.has(String(row.key))) appendSheetRow_(SHEET_NAMES.sequences, row);
  });
}

function seedInitialAdminUser_() {
  const users = readSheetRows_(SHEET_NAMES.users);
  if (users.length > 0) return;

  const props = PropertiesService.getScriptProperties();
  const username = String(props.getProperty('INITIAL_ADMIN_USERNAME') || 'admin').trim();
  const initialPassword = String(props.getProperty('INITIAL_ADMIN_PASSWORD') || 'ChangeMe123!').trim();
  const email = String(props.getProperty('INITIAL_ADMIN_EMAIL') || Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const name = String(props.getProperty('INITIAL_ADMIN_NAME') || '系統管理員').trim();
  const unit = String(props.getProperty('INITIAL_ADMIN_UNIT') || '資訊部').trim();

  if (!username || !initialPassword) {
    throw createHttpError_('CONFIG_ERROR', 'INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD are required', 500);
  }

  assertPasswordPolicy_(initialPassword, username);

  const now = nowIso_();
  const policy = getPasswordPolicy_();
  const expiresAt = new Date(Date.now() + policy.maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
  const salt = createSalt_();
  const hash = hashPassword_(initialPassword, salt);

  const user = {
    id: createId_('USR'),
    username,
    password_hash: hash,
    password_salt: salt,
    email,
    name,
    role: '最高管理員',
    unit,
    sub_unit: '',
    employee_no: '',
    is_active: true,
    must_change_password: true,
    password_changed_at: now,
    password_expires_at: expiresAt,
    failed_count: 0,
    locked_until: '',
    last_login_at: '',
    created_at: now,
    updated_at: now,
    row_version: 1
  };

  appendSheetRow_(SHEET_NAMES.users, user);
  appendPasswordHistory_({
    userId: user.id,
    username: user.username,
    passwordHash: hash,
    passwordSalt: salt,
    changedBy: 'SYSTEM',
    reason: 'INITIAL_SEED'
  });
}
