const crypto = require('crypto');


const CONTRACT_VERSION = '2026-03-13';

const USER_ACTIONS = {
  LIST: 'system-user.list',
  DETAIL: 'system-user.detail',
  UPSERT: 'system-user.upsert',
  DELETE: 'system-user.delete',
  RESET_PASSWORD: 'system-user.reset-password'
};

const USER_ROLES = {
  ADMIN: '最高管理員',
  UNIT_ADMIN: '單位管理員',
  REPORTER: '填報人',
  VIEWER: '跨單位檢視者'
};
const DEFAULT_DISPLAY_NAME_BY_USERNAME = {
  admin: '計算機及資訊網路中心',
  unit1: '王經理',
  unit2: '張稽核員',
  user1: '李工程師',
  user2: '陳資安主管',
  user3: '黃工程師',
  user4: '劉文管人員',
  viewer1: '跨單位檢視者'
};

const PASSWORD_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const PASSWORD_SECRET_PREFIX = 'ps1';

function cleanText(value) {
  return String(value || '').trim();
}

function cleanEmail(value) {
  return cleanText(value).toLowerCase();
}

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode || 400;
  return error;
}

function validatePasswordComplexity(password, fieldName) {
  const label = cleanText(fieldName) || 'password';
  const value = cleanText(password);
  if (!value) throw createError('Missing ' + label, 400);
  if (value.length < 8) throw createError('Password must be at least 8 characters', 400);
  if (!/[a-z]/.test(value)) throw createError('Password must include at least one lowercase letter', 400);
  if (!/[A-Z]/.test(value)) throw createError('Password must include at least one uppercase letter', 400);
  if (!/[0-9]/.test(value)) throw createError('Password must include at least one number', 400);
}

function parseJsonField(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return typeof fallback === 'function' ? fallback() : fallback;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_) {
      return typeof fallback === 'function' ? fallback() : fallback;
    }
  }
  return value;
}

function parseUserUnits(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((entry) => cleanText(entry)).filter(Boolean)));
  }
  if (typeof value === 'string') {
    return Array.from(new Set(value.split(/\r?\n|,|;|\|/).map((entry) => cleanText(entry)).filter(Boolean)));
  }
  return [];
}

function normalizeUserRole(role) {
  const cleanRole = cleanText(role);
  if (cleanRole === USER_ROLES.ADMIN) return USER_ROLES.ADMIN;
  if (cleanRole === USER_ROLES.UNIT_ADMIN) return USER_ROLES.UNIT_ADMIN;
  if (cleanRole === USER_ROLES.VIEWER || cleanRole.toLowerCase() === 'super_viewer') return USER_ROLES.VIEWER;
  return USER_ROLES.REPORTER;
}

function normalizeSystemUserPayload(payload) {
  const base = payload && typeof payload === 'object' ? payload : {};
  const role = normalizeUserRole(base.role);
  const units = parseUserUnits(base.units || base.authorizedUnits || base.AuthorizedUnitsJson);
  const primaryUnit = cleanText(base.unit || base.primaryUnit || base.PrimaryUnit);
  if (primaryUnit && !units.includes(primaryUnit)) {
    units.unshift(primaryUnit);
  }
  const activeUnit = role === USER_ROLES.ADMIN ? '' : (cleanText(base.activeUnit || base.ActiveUnit) || units[0] || '');
  return {
    username: cleanText(base.username || base.userName || base.UserName),
    password: cleanText(base.password || base.PasswordSecret || base.Password),
    name: cleanText(base.name || base.displayName || base.DisplayName),
    email: cleanEmail(base.email || base.Email),
    role,
    unit: units[0] || '',
    units,
    activeUnit,
    createdAt: cleanText(base.createdAt || base.CreatedAt),
    updatedAt: cleanText(base.updatedAt || base.UpdatedAt),
    passwordChangedAt: cleanText(base.passwordChangedAt || base.PasswordChangedAt),
    resetTokenExpiresAt: cleanText(base.resetTokenExpiresAt || base.ResetTokenExpiresAt),
    resetRequestedAt: cleanText(base.resetRequestedAt || base.ResetRequestedAt),
    mustChangePassword: base.mustChangePassword === true || cleanText(base.MustChangePassword).toLowerCase() === 'true',
    sessionVersion: Number.isFinite(Number(base.sessionVersion || base.SessionVersion))
      ? Number(base.sessionVersion || base.SessionVersion)
      : 1,
    backendMode: cleanText(base.backendMode || base.BackendMode) || 'a3-campus-backend',
    recordSource: cleanText(base.recordSource || base.RecordSource) || 'frontend'
  };
}

function normalizeStoredSystemUser(entry) {
  return normalizeSystemUserPayload(entry);
}

function readStoredPasswordState(value) {
  const raw = cleanText(value);
  function compactTimestampToIso(input) {
    const normalized = cleanText(input);
    if (!normalized) return '';
    const epochMs = Number.parseInt(normalized, 36);
    return Number.isFinite(epochMs) ? new Date(epochMs).toISOString() : '';
  }
  if (!raw) {
    return {
      raw: '',
      hasPassword: false,
      legacy: false,
      scheme: '',
      mustChangePassword: false,
      passwordChangedAt: '',
      resetTokenHash: '',
      resetTokenExpiresAt: '',
      resetRequestedAt: '',
      sessionVersion: 1
    };
  }

  if (raw.startsWith(PASSWORD_SECRET_PREFIX + '|')) {
    const parts = raw.split('|');
    return {
      raw,
      hasPassword: true,
      legacy: false,
      scheme: 'scrypt-v1',
      salt: cleanText(parts[1]),
      hash: cleanText(parts[2]),
      plaintext: '',
      mustChangePassword: cleanText(parts[3]) === '1',
      passwordChangedAt: compactTimestampToIso(parts[4]),
      resetTokenHash: cleanText(parts[5]),
      resetTokenExpiresAt: compactTimestampToIso(parts[6]),
      resetRequestedAt: compactTimestampToIso(parts[7]),
      sessionVersion: Number.isFinite(Number(parts[8])) ? Number(parts[8]) : 1
    };
  }

  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      return {
        raw,
        hasPassword: !!cleanText(parsed.hash || parsed.password || parsed.plaintext || raw),
        legacy: cleanText(parsed.scheme) === 'legacy-plain',
        scheme: cleanText(parsed.scheme || ''),
        salt: cleanText(parsed.salt || ''),
        hash: cleanText(parsed.hash || ''),
        plaintext: cleanText(parsed.plaintext || ''),
        mustChangePassword: parsed.mustChangePassword === true,
        passwordChangedAt: cleanText(parsed.passwordChangedAt || ''),
        resetTokenHash: cleanText(parsed.resetTokenHash || ''),
        resetTokenExpiresAt: cleanText(parsed.resetTokenExpiresAt || ''),
        resetRequestedAt: cleanText(parsed.resetRequestedAt || ''),
        sessionVersion: Number.isFinite(Number(parsed.sessionVersion)) ? Number(parsed.sessionVersion) : 1
      };
    } catch (_) {
      // fall through to legacy handling
    }
  }

  return {
    raw,
    hasPassword: true,
    legacy: true,
    scheme: 'legacy-plain',
    salt: '',
    hash: '',
    plaintext: raw,
    mustChangePassword: false,
    passwordChangedAt: '',
    resetTokenHash: '',
    resetTokenExpiresAt: '',
    resetRequestedAt: '',
    sessionVersion: 1
  };
}

function mapSystemUserForClient(entry) {
  const normalized = normalizeStoredSystemUser(entry);
  const { password: _password, ...publicFields } = normalized;
  const passwordState = readStoredPasswordState(normalized.password);
  const displayName = cleanText(normalized.name) || DEFAULT_DISPLAY_NAME_BY_USERNAME[cleanText(normalized.username)] || cleanText(normalized.username);
  return {
    ...publicFields,
    name: displayName,
    hasPassword: passwordState.hasPassword,
    mustChangePassword: passwordState.mustChangePassword,
    passwordChangedAt: passwordState.passwordChangedAt,
    resetTokenExpiresAt: passwordState.resetTokenExpiresAt,
    sessionVersion: passwordState.sessionVersion
  };
}

function mapSystemUserToGraphFields(entry) {
  const item = normalizeStoredSystemUser(entry);
  const passwordValue = cleanText(item.password);
  const isStructuredPassword = passwordValue.startsWith('{') || passwordValue.startsWith(PASSWORD_SECRET_PREFIX + '|');
  return {
    Title: item.name || item.username,
    UserName: item.username,
    Password: passwordValue || '[no-password]',
    PasswordSecret: isStructuredPassword ? passwordValue : '',
    DisplayName: item.name,
    Email: item.email,
    Role: item.role,
    PrimaryUnit: item.unit,
    AuthorizedUnitsJson: JSON.stringify(item.units || []),
    ActiveUnit: item.activeUnit,
    CreatedAt: item.createdAt || null,
    UpdatedAt: item.updatedAt || null,
    PasswordChangedAt: item.passwordChangedAt || null,
    ResetTokenExpiresAt: item.resetTokenExpiresAt || null,
    ResetRequestedAt: item.resetRequestedAt || null,
    MustChangePassword: item.mustChangePassword ? 'true' : 'false',
    SessionVersion: Number.isFinite(Number(item.sessionVersion)) ? Number(item.sessionVersion) : 1,
    BackendMode: item.backendMode,
    RecordSource: item.recordSource
  };
}

function mapGraphFieldsToSystemUser(fields) {
  const units = parseJsonField(fields.AuthorizedUnitsJson, function () { return []; });
  const username = cleanText(fields.UserName || fields.Title);
  const rawTitle = cleanText(fields.Title);
  const displayName = cleanText(fields.DisplayName) || (rawTitle && rawTitle !== username ? rawTitle : '');
  return normalizeStoredSystemUser({
    username: username,
    password: fields.PasswordSecret || fields.Password,
    name: displayName,
    email: fields.Email,
    role: fields.Role,
    unit: fields.PrimaryUnit,
    units,
    activeUnit: fields.ActiveUnit,
    createdAt: fields.CreatedAt,
    updatedAt: fields.UpdatedAt,
    passwordChangedAt: fields.PasswordChangedAt,
    resetTokenExpiresAt: fields.ResetTokenExpiresAt,
    resetRequestedAt: fields.ResetRequestedAt,
    mustChangePassword: fields.MustChangePassword,
    sessionVersion: fields.SessionVersion,
    backendMode: fields.BackendMode,
    recordSource: fields.RecordSource
  });
}

function createSystemUserRecord(payload, now) {
  const base = normalizeSystemUserPayload(payload);
  const timestamp = cleanText(now) || new Date().toISOString();
  return normalizeStoredSystemUser({
    ...base,
    createdAt: cleanText(base.createdAt) || timestamp,
    updatedAt: timestamp
  });
}

function validateActionEnvelope(envelope, expectedAction) {
  if (!envelope || typeof envelope !== 'object') {
    throw createError('Invalid request envelope', 400);
  }
  const action = cleanText(envelope.action);
  if (!action) throw createError('Missing action', 400);
  if (expectedAction && action !== expectedAction) {
    throw createError('Action does not match endpoint', 400);
  }
}

function validateSystemUserPayload(payload, options) {
  const opts = options || {};
  if (!cleanText(payload.username)) throw createError('Missing username', 400);
  if (!cleanText(payload.name)) throw createError('Missing display name', 400);
  if (!cleanEmail(payload.email)) throw createError('Missing email', 400);
  if (opts.requirePassword && !cleanText(payload.password)) throw createError('Missing password', 400);
  if (cleanText(payload.password)) validatePasswordComplexity(payload.password, 'password');
  if (payload.role !== USER_ROLES.ADMIN && payload.role !== USER_ROLES.VIEWER && !payload.units.length) {
    throw createError('At least one authorized unit is required', 400);
  }
}

function generatePassword(length) {
  const size = Number.isFinite(Number(length)) ? Number(length) : 8;
  const bytes = crypto.randomBytes(size);
  let password = '';
  for (let index = 0; index < size; index += 1) {
    password += PASSWORD_CHARS[bytes[index] % PASSWORD_CHARS.length];
  }
  return password;
}

function buildJsonResponse(status, jsonBody, headers) {
  return {
    status,
    jsonBody,
    headers
  };
}

function buildErrorResponse(error, fallbackMessage, status) {
  const code = Number(error && (error.statusCode || error.status || status)) || 500;
  return {
    status: code,
    jsonBody: {
      ok: false,
      error: cleanText(error && error.message) || fallbackMessage || 'Unexpected error'
    }
  };
}

module.exports = {
  CONTRACT_VERSION,
  PASSWORD_CHARS,
  USER_ACTIONS,
  USER_ROLES,
  buildErrorResponse,
  buildJsonResponse,
  cleanText,
  cleanEmail,
  createError,
  createSystemUserRecord,
  generatePassword,
  mapGraphFieldsToSystemUser,
  mapSystemUserForClient,
  mapSystemUserToGraphFields,
  normalizeStoredSystemUser,
  normalizeSystemUserPayload,
  parseUserUnits,
  readStoredPasswordState,
  validatePasswordComplexity,
  validateActionEnvelope,
  validateSystemUserPayload
};

