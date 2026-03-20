function authenticateRequest_(request) {
  const sessionToken = getSessionTokenFromRequest_(request);
  if (!sessionToken) throw createHttpError_('UNAUTHORIZED', 'Missing session token', 401);

  const session = findValidSessionByToken_(sessionToken);
  if (!session) throw createHttpError_('UNAUTHORIZED', 'Session expired or invalid', 401);

  let user = findUserById_(session.user_id) || findUserByUsername_(session.username);
  if (!user) throw createHttpError_('UNAUTHORIZED', 'User not found', 401);
  if (!safeToBool_(user.is_active === '' ? true : user.is_active)) {
    throw createHttpError_('FORBIDDEN', 'User is disabled', 403);
  }

  if (isPasswordExpired_(user) && !safeToBool_(user.must_change_password)) {
    user = markUserMustChangePassword_(user);
  }

  touchSessionSeenAt_(session);
  return mapAuthContext_(user, session);
}

function authLoginAction_(payload, _authContext, request) {
  const username = String((payload && payload.username) || '').trim();
  const password = String((payload && payload.password) || '');
  if (!username || !password) {
    throw createHttpError_('VALIDATION_ERROR', 'username and password are required', 400);
  }

  assertLoginRateLimit_(username, request);

  let user = findUserByUsername_(username);
  if (!user) {
    recordLoginRateLimitFailure_(username, request);
    logLoginAttempt_({ username, success: false, request, message: 'USER_NOT_FOUND' });
    throw createHttpError_('UNAUTHORIZED', 'Invalid username or password', 401);
  }

  if (!safeToBool_(user.is_active === '' ? true : user.is_active)) {
    recordLoginRateLimitFailure_(username, request);
    logLoginAttempt_({ user, username, success: false, request, message: 'USER_DISABLED' });
    throw createHttpError_('FORBIDDEN', 'User is disabled', 403);
  }

  ensureUserHasPasswordHash_(user);

  const lockUntil = parseIsoMs_(user.locked_until);
  if (lockUntil > Date.now()) {
    recordLoginRateLimitFailure_(username, request);
    logLoginAttempt_({ user, username, success: false, request, message: 'ACCOUNT_LOCKED' });
    throw createHttpError_('LOCKED', `Account locked until ${new Date(lockUntil).toISOString()}`, 423);
  }

  const verified = verifyPassword_(password, user.password_salt, user.password_hash);
  if (!verified) {
    recordFailedLogin_(user);
    recordLoginRateLimitFailure_(username, request);
    logLoginAttempt_({ user, username, success: false, request, message: 'INVALID_PASSWORD' });
    throw createHttpError_('UNAUTHORIZED', 'Invalid username or password', 401);
  }

  user = recordSuccessfulLogin_(user);
  if (isPasswordExpired_(user) && !safeToBool_(user.must_change_password)) {
    user = markUserMustChangePassword_(user);
  }

  clearLoginRateLimit_(username, request);
  const session = createLoginSession_(user, request);
  logLoginAttempt_({ user, username, success: true, request, message: 'LOGIN_OK' });

  return {
    sessionToken: session.sessionToken,
    expiresAt: session.expiresAt,
    user: mapUserForClient_(user),
    config: {
      timezone: getTimezone_(),
      sessionTtlHours: getNumberConfig_('session_ttl_hours', 12)
    }
  };
}

function authLogoutAction_(_payload, authContext, request) {
  if (!authContext) throw createHttpError_('UNAUTHORIZED', 'Unauthorized', 401);

  const sessionToken = getSessionTokenFromRequest_(request);
  if (sessionToken) revokeSessionByToken_(sessionToken);

  return {
    ok: true,
    ts: nowIso_()
  };
}

function authChangePasswordAction_(payload, authContext) {
  if (!authContext) throw createHttpError_('UNAUTHORIZED', 'Unauthorized', 401);

  const currentPassword = String((payload && payload.currentPassword) || '');
  const newPassword = String((payload && payload.newPassword) || '');
  if (!currentPassword || !newPassword) {
    throw createHttpError_('VALIDATION_ERROR', 'currentPassword and newPassword are required', 400);
  }

  const user = findUserById_(authContext.userId);
  if (!user) throw createHttpError_('UNAUTHORIZED', 'User not found', 401);

  ensureUserHasPasswordHash_(user);
  if (!verifyPassword_(currentPassword, user.password_salt, user.password_hash)) {
    throw createHttpError_('UNAUTHORIZED', 'Current password is incorrect', 401);
  }

  const updated = changeUserPassword_(
    user,
    newPassword,
    authContext.username || user.username,
    'USER_CHANGE',
    { revokeSessions: true, exceptSessionId: authContext.sessionId }
  );

  return {
    ok: true,
    user: mapUserForClient_(updated),
    changedAt: nowIso_()
  };
}

function authRequestPasswordResetAction_(payload, _authContext, request) {
  const username = String((payload && payload.username) || '').trim();
  const email = String((payload && payload.email) || '').trim().toLowerCase();
  const generic = {
    ok: true,
    message: 'If the account exists, reset instructions have been sent.'
  };

  if (!username && !email) return generic;

  const user = findUserByUsernameOrEmail_(username, email);
  if (!user || !safeToBool_(user.is_active === '' ? true : user.is_active) || !String(user.email || '').trim()) {
    return generic;
  }

  revokePendingResetTokens_(user.id);

  const token = createResetToken_();
  const tokenHash = hashResetToken_(token);
  const ttlMinutes = getIntConfig_('reset_token_ttl_minutes', 15, 5, 120);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  const meta = getClientMetaFromRequest_(request);

  appendSheetRow_(SHEET_NAMES.passwordResets, {
    id: createId_('RSTK'),
    user_id: String(user.id || ''),
    username: String(user.username || ''),
    email: String(user.email || '').toLowerCase(),
    token_hash: tokenHash,
    requested_at: nowIso_(),
    expires_at: expiresAt,
    used_at: '',
    request_ip: meta.ip,
    request_ua: meta.ua
  });

  const subject = '[內部稽核管考追蹤系統] 密碼重設驗證碼';
  const body = [
    `帳號: ${user.username}`,
    `重設驗證碼: ${token}`,
    `有效時間: ${ttlMinutes} 分鐘`,
    '若非本人操作請忽略此信。'
  ].join('\n');
  sendMailByGmailApp_(String(user.email || '').toLowerCase(), subject, body, getMailSender_(), '內部稽核管考追蹤系統');

  return generic;
}

function authResetPasswordAction_(payload, _authContext, request) {
  const username = String((payload && payload.username) || '').trim();
  const token = String((payload && payload.token) || '').trim();
  const newPassword = String((payload && payload.newPassword) || '');

  if (!username || !token || !newPassword) {
    throw createHttpError_('VALIDATION_ERROR', 'username, token and newPassword are required', 400);
  }

  const user = findUserByUsername_(username);
  if (!user) throw createHttpError_('UNAUTHORIZED', 'Invalid reset token', 401);

  const tokenRow = findValidResetTokenRow_(user.id, token);
  if (!tokenRow) throw createHttpError_('UNAUTHORIZED', 'Invalid reset token', 401);

  changeUserPassword_(user, newPassword, 'SYSTEM', 'RESET_TOKEN', { revokeSessions: true });
  markResetTokenUsed_(tokenRow.id);
  clearLoginRateLimit_(username, request);

  return {
    ok: true,
    message: 'Password has been reset successfully'
  };
}

function getSessionTokenFromRequest_(request) {
  if (!request) return '';
  if (request.sessionToken) return String(request.sessionToken);
  if (request.payload && request.payload.sessionToken) return String(request.payload.sessionToken);
  if (request.payload && request.payload.token) return String(request.payload.token);
  return '';
}

function createLoginSession_(user, request) {
  const now = Date.now();
  const ttlHours = Math.max(1, Math.floor(getNumberConfig_('session_ttl_hours', 12)));
  const expiresAt = new Date(now + ttlHours * 60 * 60 * 1000).toISOString();
  const sessionToken = createSessionToken_();
  const tokenHash = hashToken_(sessionToken);
  const meta = getClientMetaFromRequest_(request);

  appendSheetRow_(SHEET_NAMES.loginSessions, {
    id: createId_('SES'),
    session_token_hash: tokenHash,
    user_id: String(user.id || ''),
    username: String(user.username || ''),
    issued_at: new Date(now).toISOString(),
    expires_at: expiresAt,
    revoked_at: '',
    ip: meta.ip,
    ua: meta.ua,
    last_seen_at: new Date(now).toISOString()
  });

  return {
    sessionToken,
    expiresAt
  };
}

function findValidSessionByToken_(sessionToken) {
  const tokenHash = hashToken_(sessionToken);
  const rows = readSheetRows_(SHEET_NAMES.loginSessions);
  const now = Date.now();

  const found = rows
    .filter((r) => String(r.session_token_hash || '') === tokenHash)
    .filter((r) => !String(r.revoked_at || '').trim())
    .filter((r) => parseIsoMs_(r.expires_at) > now)
    .sort((a, b) => parseIsoMs_(b.issued_at) - parseIsoMs_(a.issued_at));

  return found.length > 0 ? found[0] : null;
}

function revokeSessionByToken_(sessionToken) {
  const tokenHash = hashToken_(sessionToken);
  const rows = readSheetRows_(SHEET_NAMES.loginSessions);
  const row = rows.find((r) => String(r.session_token_hash || '') === tokenHash && !String(r.revoked_at || '').trim());
  if (!row) return;

  upsertSheetRowByKey_(SHEET_NAMES.loginSessions, 'id', {
    ...row,
    revoked_at: nowIso_(),
    last_seen_at: nowIso_()
  });
}

function touchSessionSeenAt_(sessionRow) {
  if (!sessionRow || !sessionRow.id) return;
  upsertSheetRowByKey_(SHEET_NAMES.loginSessions, 'id', {
    ...sessionRow,
    last_seen_at: nowIso_()
  });
}

function recordFailedLogin_(user) {
  const maxFailures = Math.max(1, Math.floor(getNumberConfig_('login_max_failures', 5)));
  const lockMinutes = Math.max(1, Math.floor(getNumberConfig_('login_lock_minutes', 15)));
  const failedCount = Math.max(0, Number(user.failed_count || 0)) + 1;

  const nextUser = {
    ...user,
    failed_count: failedCount,
    updated_at: nowIso_(),
    row_version: Math.max(0, Number(user.row_version || 0)) + 1
  };

  if (failedCount >= maxFailures) {
    nextUser.locked_until = new Date(Date.now() + lockMinutes * 60 * 1000).toISOString();
    nextUser.failed_count = 0;
  }

  upsertSheetRowByKey_(SHEET_NAMES.users, 'id', nextUser);
}

function recordSuccessfulLogin_(user) {
  const nextUser = {
    ...user,
    failed_count: 0,
    locked_until: '',
    last_login_at: nowIso_(),
    updated_at: nowIso_(),
    row_version: Math.max(0, Number(user.row_version || 0)) + 1
  };
  upsertSheetRowByKey_(SHEET_NAMES.users, 'id', nextUser);
  return nextUser;
}

function ensureUserHasPasswordHash_(user) {
  const rawHash = String(user.password_hash || '').trim();
  const rawSalt = String(user.password_salt || '').trim();
  if (rawHash && rawSalt) return;

  // Backward compatibility: if old "password" column exists, migrate it to hash.
  const legacyPassword = String(user.password || '').trim();
  if (!legacyPassword) {
    throw createHttpError_('CONFIG_ERROR', `User ${user.username || user.id || ''} has no password hash`, 500);
  }

  const now = nowIso_();
  const policy = getPasswordPolicy_();
  const salt = createSalt_();
  const hash = hashPassword_(legacyPassword, salt);
  const nextUser = {
    ...user,
    password_hash: hash,
    password_salt: salt,
    password: '',
    must_change_password: true,
    password_changed_at: now,
    password_expires_at: new Date(Date.now() + policy.maxAgeDays * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: now,
    row_version: Math.max(0, Number(user.row_version || 0)) + 1
  };

  upsertSheetRowByKey_(SHEET_NAMES.users, 'id', nextUser);
  appendPasswordHistory_({
    userId: nextUser.id,
    username: nextUser.username,
    passwordHash: hash,
    passwordSalt: salt,
    changedBy: 'SYSTEM',
    reason: 'LEGACY_MIGRATION'
  });

  user.password_hash = hash;
  user.password_salt = salt;
  user.must_change_password = true;
  user.password_changed_at = nextUser.password_changed_at;
  user.password_expires_at = nextUser.password_expires_at;
}

function markUserMustChangePassword_(user) {
  const nextUser = {
    ...user,
    must_change_password: true,
    updated_at: nowIso_(),
    row_version: Math.max(0, Number(user.row_version || 0)) + 1
  };
  upsertSheetRowByKey_(SHEET_NAMES.users, 'id', nextUser);
  return nextUser;
}

function revokePendingResetTokens_(userId) {
  const rows = readSheetRows_(SHEET_NAMES.passwordResets);
  if (rows.length === 0) return;

  const now = nowIso_();
  let changed = false;
  const nextRows = rows.map((r) => {
    const sameUser = String(r.user_id || '') === String(userId || '');
    const notUsed = !String(r.used_at || '').trim();
    if (!sameUser || !notUsed) return r;
    changed = true;
    return { ...r, used_at: now };
  });

  if (changed) replaceSheetRows_(SHEET_NAMES.passwordResets, nextRows);
}

function findValidResetTokenRow_(userId, token) {
  const hash = hashResetToken_(token);
  const now = Date.now();
  const rows = readSheetRows_(SHEET_NAMES.passwordResets)
    .filter((r) => String(r.user_id || '') === String(userId || ''))
    .filter((r) => String(r.token_hash || '') === hash)
    .filter((r) => !String(r.used_at || '').trim())
    .filter((r) => parseIsoMs_(r.expires_at) > now)
    .sort((a, b) => parseIsoMs_(b.requested_at) - parseIsoMs_(a.requested_at));

  return rows.length > 0 ? rows[0] : null;
}

function markResetTokenUsed_(resetId) {
  if (!resetId) return;
  const rows = readSheetRows_(SHEET_NAMES.passwordResets);
  const row = rows.find((r) => String(r.id || '') === String(resetId));
  if (!row) return;

  upsertSheetRowByKey_(SHEET_NAMES.passwordResets, 'id', {
    ...row,
    used_at: nowIso_()
  });
}

function mapAuthContext_(user, session) {
  return {
    userId: user.id,
    username: String(user.username || ''),
    email: String(user.email || '').toLowerCase(),
    name: String(user.name || ''),
    role: String(user.role || '單位管理員'),
    unit: String(user.unit || ''),
    subUnit: String(user.sub_unit || ''),
    mustChangePassword: safeToBool_(user.must_change_password),
    passwordExpiresAt: String(user.password_expires_at || ''),
    sessionId: String(session.id || '')
  };
}

function mapUserForClient_(user) {
  return {
    id: String(user.id || ''),
    username: String(user.username || ''),
    email: String(user.email || '').toLowerCase(),
    name: String(user.name || ''),
    role: String(user.role || '單位管理員'),
    unit: String(user.unit || ''),
    subUnit: String(user.sub_unit || ''),
    mustChangePassword: safeToBool_(user.must_change_password),
    passwordExpiresAt: String(user.password_expires_at || '')
  };
}

function findUserById_(id) {
  if (!id) return null;
  const rows = readSheetRows_(SHEET_NAMES.users);
  return rows.find((r) => String(r.id || '') === String(id || '')) || null;
}

function findUserByUsername_(username) {
  if (!username) return null;
  const target = String(username || '').toLowerCase();
  const rows = readSheetRows_(SHEET_NAMES.users);
  return rows.find((r) => String(r.username || '').toLowerCase() === target) || null;
}

function findUserByEmail_(email) {
  if (!email) return null;
  const target = String(email || '').toLowerCase();
  const rows = readSheetRows_(SHEET_NAMES.users);
  return rows.find((r) => String(r.email || '').toLowerCase() === target) || null;
}

function findUserByUsernameOrEmail_(username, email) {
  if (username) {
    const byUsername = findUserByUsername_(username);
    if (byUsername) return byUsername;
  }
  if (email) return findUserByEmail_(email);
  return null;
}

function createSessionToken_() {
  return `st_${Utilities.getUuid().replace(/-/g, '')}${Utilities.getUuid().replace(/-/g, '').slice(0, 12)}`;
}

function createSalt_() {
  const raw = `${Utilities.getUuid()}-${Utilities.getUuid()}-${Date.now()}`;
  return Utilities.base64EncodeWebSafe(raw).slice(0, 22);
}

function hashPassword_(password, salt) {
  return sha256Hex_(`${String(salt || '')}|${String(password || '')}`);
}

function hashToken_(token) {
  return sha256Hex_(`session|${String(token || '')}`);
}

function verifyPassword_(password, salt, hash) {
  const expected = String(hash || '');
  const actual = hashPassword_(password, salt);
  return constantTimeEquals_(actual, expected);
}

function sha256Hex_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text || ''), Utilities.Charset.UTF_8);
  return bytes
    .map((b) => {
      const v = b < 0 ? b + 256 : b;
      return v.toString(16).padStart(2, '0');
    })
    .join('');
}

function constantTimeEquals_(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (x.length !== y.length) return false;

  let mismatch = 0;
  for (let i = 0; i < x.length; i += 1) {
    mismatch |= (x.charCodeAt(i) ^ y.charCodeAt(i));
  }
  return mismatch === 0;
}

function getClientMetaFromRequest_(request) {
  const ip = String((request && request.ip) || (request && request.payload && request.payload.ip) || '').trim();
  const ua = String((request && request.ua) || (request && request.payload && request.payload.ua) || '').trim();
  return { ip, ua };
}

function logLoginAttempt_(params) {
  try {
    const user = params && params.user ? params.user : null;
    const meta = getClientMetaFromRequest_(params ? params.request : null);

    const row = {
      id: createId_('LOG'),
      time: nowIso_(),
      username: String((user && user.username) || (params && params.username) || ''),
      email: String((user && user.email) || '').toLowerCase(),
      name: String((user && user.name) || ''),
      role: String((user && user.role) || ''),
      success: !!(params && params.success),
      ip: meta.ip,
      ua: meta.ua,
      message: String((params && params.message) || '')
    };
    row.integrity_hash = computeLogIntegrityHash_(row);

    appendSheetRow_(SHEET_NAMES.loginLogs, row);
  } catch (_) {
    // Keep auth flow available even when audit write fails.
  }
}

function isAdmin_(authContext) {
  return !!authContext && authContext.role === '最高管理員';
}

function isUnitAdmin_(authContext) {
  return !!authContext && authContext.role === '單位管理員';
}
