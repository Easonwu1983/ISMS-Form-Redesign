function parseIsoMs_(value) {
  if (!value) return 0;
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function isPasswordExpired_(userRow) {
  if (!userRow) return false;
  const expiresMs = parseIsoMs_(userRow.password_expires_at);
  if (!expiresMs) return false;
  return Date.now() > expiresMs;
}

function assertPasswordChangeGate_(action, authContext) {
  if (!authContext || !authContext.mustChangePassword) return;
  const allowed = new Set(['health.ping', 'auth.me', 'auth.logout', 'auth.changePassword']);
  if (allowed.has(String(action || ''))) return;
  throw createHttpError_('PASSWORD_CHANGE_REQUIRED', 'Password change is required before other operations', 403);
}

function getPasswordPolicy_() {
  return {
    minLength: getIntConfig_('password_min_length', 12, 8, 128),
    requireUpper: safeToBool_(getConfigValue_('password_require_upper', 'TRUE')),
    requireLower: safeToBool_(getConfigValue_('password_require_lower', 'TRUE')),
    requireDigit: safeToBool_(getConfigValue_('password_require_digit', 'TRUE')),
    requireSpecial: safeToBool_(getConfigValue_('password_require_special', 'TRUE')),
    historyCount: getIntConfig_('password_history_count', 3, 1, 24),
    maxAgeDays: getIntConfig_('password_max_age_days', 90, 1, 3650)
  };
}

function assertPasswordPolicy_(newPassword, username) {
  const policy = getPasswordPolicy_();
  const pwd = String(newPassword || '');
  const errs = [];

  if (pwd.length < policy.minLength) errs.push(`Password must be at least ${policy.minLength} characters`);
  if (policy.requireUpper && !/[A-Z]/.test(pwd)) errs.push('Password must contain an uppercase letter');
  if (policy.requireLower && !/[a-z]/.test(pwd)) errs.push('Password must contain a lowercase letter');
  if (policy.requireDigit && !/[0-9]/.test(pwd)) errs.push('Password must contain a digit');
  if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(pwd)) errs.push('Password must contain a special character');

  const uname = String(username || '').toLowerCase();
  if (uname && pwd.toLowerCase().includes(uname)) errs.push('Password cannot include username');

  if (errs.length > 0) {
    throw createHttpError_('VALIDATION_ERROR', errs.join('; '), 400);
  }
}

function isPasswordReused_(userRow, candidatePassword, historyCount) {
  if (!userRow) return false;

  if (verifyPassword_(candidatePassword, userRow.password_salt, userRow.password_hash)) {
    return true;
  }

  const rows = readSheetRows_(SHEET_NAMES.passwordHistory)
    .filter((r) => String(r.user_id || '') === String(userRow.id || ''))
    .sort((a, b) => parseIsoMs_(b.changed_at) - parseIsoMs_(a.changed_at))
    .slice(0, Math.max(0, Number(historyCount || 0)));

  return rows.some((r) => verifyPassword_(candidatePassword, r.password_salt, r.password_hash));
}

function appendPasswordHistory_(params) {
  appendSheetRow_(SHEET_NAMES.passwordHistory, {
    id: createId_('PWH'),
    user_id: String(params.userId || ''),
    username: String(params.username || ''),
    password_hash: String(params.passwordHash || ''),
    password_salt: String(params.passwordSalt || ''),
    changed_at: nowIso_(),
    changed_by: String(params.changedBy || ''),
    reason: String(params.reason || '')
  });
}

function changeUserPassword_(userRow, newPassword, changedBy, reason, options) {
  if (!userRow) throw createHttpError_('NOT_FOUND', 'User not found', 404);

  const opts = options || {};
  const policy = getPasswordPolicy_();
  assertPasswordPolicy_(newPassword, userRow.username);

  if (isPasswordReused_(userRow, newPassword, policy.historyCount)) {
    throw createHttpError_('VALIDATION_ERROR', `New password cannot reuse latest ${policy.historyCount} passwords`, 400);
  }

  const now = nowIso_();
  const expiresAt = new Date(Date.now() + policy.maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
  const salt = createSalt_();
  const hash = hashPassword_(newPassword, salt);

  const nextUser = {
    ...userRow,
    password_hash: hash,
    password_salt: salt,
    must_change_password: false,
    password_changed_at: now,
    password_expires_at: expiresAt,
    failed_count: 0,
    locked_until: '',
    updated_at: now,
    row_version: Math.max(0, Number(userRow.row_version || 0)) + 1
  };

  upsertSheetRowByKey_(SHEET_NAMES.users, 'id', nextUser);
  appendPasswordHistory_({
    userId: nextUser.id,
    username: nextUser.username,
    passwordHash: hash,
    passwordSalt: salt,
    changedBy,
    reason
  });

  if (opts.revokeSessions !== false) {
    revokeAllSessionsForUser_(nextUser.id, opts.exceptSessionId || '');
  }

  return nextUser;
}

function revokeAllSessionsForUser_(userId, exceptSessionId) {
  if (!userId) return;

  const rows = readSheetRows_(SHEET_NAMES.loginSessions);
  const now = nowIso_();
  let changed = false;

  const nextRows = rows.map((r) => {
    const sameUser = String(r.user_id || '') === String(userId);
    const active = !String(r.revoked_at || '').trim();
    const except = exceptSessionId && String(r.id || '') === String(exceptSessionId);
    if (!sameUser || !active || except) return r;

    changed = true;
    return {
      ...r,
      revoked_at: now,
      last_seen_at: now
    };
  });

  if (changed) replaceSheetRows_(SHEET_NAMES.loginSessions, nextRows);
}

function buildLoginRateLimitKey_(username, request) {
  const meta = getClientMetaFromRequest_(request);
  const user = String(username || '').trim().toLowerCase() || 'unknown';
  const ip = String(meta.ip || 'unknown').trim().toLowerCase();
  return `login_rl_${user}_${ip}`;
}

function assertLoginRateLimit_(username, request) {
  const cache = CacheService.getScriptCache();
  const key = buildLoginRateLimitKey_(username, request);
  const raw = cache.get(key);
  if (!raw) return;

  let state;
  try {
    state = JSON.parse(raw);
  } catch (_) {
    cache.remove(key);
    return;
  }

  const now = Date.now();
  if (!state || now >= Number(state.resetAt || 0)) {
    cache.remove(key);
    return;
  }

  const maxAttempts = getIntConfig_('login_rate_limit_max_attempts', 10, 1, 500);
  if (Number(state.count || 0) >= maxAttempts) {
    throw createHttpError_('LOCKED', 'Too many login attempts. Please retry later.', 423);
  }
}

function recordLoginRateLimitFailure_(username, request) {
  const cache = CacheService.getScriptCache();
  const key = buildLoginRateLimitKey_(username, request);
  const windowMinutes = getIntConfig_('login_rate_limit_window_minutes', 15, 1, 1440);
  const ttlSeconds = windowMinutes * 60;
  const now = Date.now();

  let state = { count: 0, resetAt: now + ttlSeconds * 1000 };
  const raw = cache.get(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && now < Number(parsed.resetAt || 0)) {
        state = parsed;
      }
    } catch (_) {
      // ignore broken cache payload
    }
  }

  state.count = Number(state.count || 0) + 1;
  if (now >= Number(state.resetAt || 0)) {
    state.count = 1;
    state.resetAt = now + ttlSeconds * 1000;
  }

  cache.put(key, JSON.stringify(state), ttlSeconds);
}

function clearLoginRateLimit_(username, request) {
  const cache = CacheService.getScriptCache();
  cache.remove(buildLoginRateLimitKey_(username, request));
}

function computeLogIntegrityHash_(rowObj) {
  const secret = String(PropertiesService.getScriptProperties().getProperty('LOG_HASH_SECRET') || 'default-log-secret');
  return sha256Hex_(`${secret}|${stableStringify_(rowObj || {})}`);
}

function stableStringify_(obj) {
  const keys = Object.keys(obj || {}).sort();
  const normalized = {};
  keys.forEach((k) => {
    normalized[k] = obj[k];
  });
  return JSON.stringify(normalized);
}

function pruneSheetByTime_(sheetName, timeField, retentionDays) {
  const rows = readSheetRows_(sheetName);
  if (rows.length === 0) return 0;

  const cutoff = Date.now() - Number(retentionDays || 180) * 24 * 60 * 60 * 1000;
  const keep = rows.filter((r) => {
    const ts = parseIsoMs_(r[timeField]);
    if (!ts) return true;
    return ts >= cutoff;
  });

  const deleted = rows.length - keep.length;
  if (deleted > 0) replaceSheetRows_(sheetName, keep);
  return deleted;
}

function runDailySecurityMaintenance_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const tz = getTimezone_() || 'Asia/Taipei';
    const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    const last = String(props.getProperty('LAST_SECURITY_MAINTENANCE_DATE') || '');
    if (last === today) return;

    const retentionDays = getLogRetentionDays_();
    pruneSheetByTime_(SHEET_NAMES.loginLogs, 'time', retentionDays);
    pruneSheetByTime_(SHEET_NAMES.apiAudit, 'created_at', retentionDays);
    pruneSheetByTime_(SHEET_NAMES.passwordResets, 'requested_at', retentionDays);
    pruneSheetByTime_(SHEET_NAMES.loginSessions, 'expires_at', retentionDays);

    props.setProperty('LAST_SECURITY_MAINTENANCE_DATE', today);
  } catch (_) {
    // Do not block API calls when maintenance fails.
  }
}

function createResetToken_() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i += 1) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return out;
}

function hashResetToken_(token) {
  return sha256Hex_(`pwreset|${String(token || '')}`);
}
