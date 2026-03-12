const CONTRACT_VERSION = '2026-03-12';

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

const PASSWORD_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

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
    password: cleanText(base.password || base.Password),
    name: cleanText(base.name || base.displayName || base.DisplayName),
    email: cleanEmail(base.email || base.Email),
    role,
    unit: units[0] || '',
    units,
    activeUnit,
    createdAt: cleanText(base.createdAt || base.CreatedAt),
    updatedAt: cleanText(base.updatedAt || base.UpdatedAt),
    backendMode: cleanText(base.backendMode || base.BackendMode) || 'a3-campus-backend',
    recordSource: cleanText(base.recordSource || base.RecordSource) || 'frontend'
  };
}

function normalizeStoredSystemUser(entry) {
  return normalizeSystemUserPayload(entry);
}

function mapSystemUserForClient(entry) {
  return normalizeStoredSystemUser(entry);
}

function mapSystemUserToGraphFields(entry) {
  const item = normalizeStoredSystemUser(entry);
  return {
    Title: item.username,
    UserName: item.username,
    Password: item.password,
    DisplayName: item.name,
    Email: item.email,
    Role: item.role,
    PrimaryUnit: item.unit,
    AuthorizedUnitsJson: JSON.stringify(item.units || []),
    ActiveUnit: item.activeUnit,
    CreatedAt: item.createdAt || null,
    UpdatedAt: item.updatedAt || null,
    BackendMode: item.backendMode,
    RecordSource: item.recordSource
  };
}

function mapGraphFieldsToSystemUser(fields) {
  const units = parseJsonField(fields.AuthorizedUnitsJson, function () { return []; });
  return normalizeStoredSystemUser({
    username: fields.UserName || fields.Title,
    password: fields.Password,
    name: fields.DisplayName,
    email: fields.Email,
    role: fields.Role,
    unit: fields.PrimaryUnit,
    units,
    activeUnit: fields.ActiveUnit,
    createdAt: fields.CreatedAt,
    updatedAt: fields.UpdatedAt,
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
  if (payload.role !== USER_ROLES.ADMIN && payload.role !== USER_ROLES.VIEWER && !payload.units.length) {
    throw createError('At least one authorized unit is required', 400);
  }
}

function generatePassword(length) {
  const size = Number.isFinite(Number(length)) ? Number(length) : 8;
  let password = '';
  for (let index = 0; index < size; index += 1) {
    password += PASSWORD_CHARS[Math.floor(Math.random() * PASSWORD_CHARS.length)];
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
  validateActionEnvelope,
  validateSystemUserPayload
};
