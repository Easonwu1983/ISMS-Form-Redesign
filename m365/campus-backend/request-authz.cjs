'use strict';

const {
  USER_ROLES
} = require('../azure-function/system-user-api/src/shared/contract');
const {
  verifySessionToken
} = require('./auth-security.cjs');
const db = require('./db.cjs');

function cleanText(value) {
  return String(value || '').trim();
}

function parseUnits(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((entry) => cleanText(entry)).filter(Boolean)));
  }
  if (typeof value === 'string') {
    return Array.from(new Set(value.split(/\r?\n|,|;|\|/).map((entry) => cleanText(entry)).filter(Boolean)));
  }
  return [];
}

function cleanLower(value) {
  return cleanText(value).toLowerCase();
}

function createHttpError(message, statusCode) {
  const error = new Error(cleanText(message) || 'Forbidden');
  error.statusCode = statusCode || 403;
  return error;
}

function readHeader(req, name) {
  if (!req || !req.headers) return '';
  const value = req.headers[String(name || '').toLowerCase()];
  return Array.isArray(value) ? cleanText(value[0]) : cleanText(value);
}

function readSessionCookie(req) {
  const cookieHeader = readHeader(req, 'cookie');
  if (!cookieHeader) return '';
  const match = cookieHeader.match(/(?:^|;\s*)isms_session=([^;]*)/);
  if (!match || !match[1]) return '';
  try { return decodeURIComponent(match[1].trim()); } catch (_) { return match[1].trim(); }
}

function decodeHeaderUnit(value) {
  const raw = cleanText(value);
  if (!raw) return '';
  try {
    return cleanText(decodeURIComponent(raw));
  } catch (_) {
    return raw;
  }
}

function mapRowToSystemUser(row) {
  if (!row) return null;
  return {
    username: row.username || '',
    password: row.password || '',
    name: row.display_name || '',
    email: row.email || '',
    role: row.role || '',
    securityRoles: parseUnits(row.security_roles_json),
    primaryUnit: row.primary_unit || '',
    authorizedUnits: parseUnits(row.authorized_units_json),
    scopeUnits: parseUnits(row.authorized_units_json),
    unit: row.primary_unit || '',
    units: parseUnits(row.authorized_units_json),
    activeUnit: row.active_unit || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    passwordChangedAt: row.password_changed_at || '',
    resetTokenExpiresAt: row.reset_token_expires_at || '',
    resetRequestedAt: row.reset_requested_at || '',
    mustChangePassword: row.must_change_password || false,
    sessionVersion: row.session_version || 1,
    backendMode: row.backend_mode || '',
    recordSource: row.record_source || '',
    passwordSecret: row.password_secret || '',
    failedAttempts: row.failed_attempts || 0,
    lockedUntil: row.locked_until || null
  };
}

function createRequestAuthz() {
  function getEnv(name, fallback) {
    const value = cleanText(process.env[name]);
    return value || fallback || '';
  }

  const sessionSecret = getEnv('AUTH_SESSION_SECRET', '');
  if (!sessionSecret) {
    throw new Error('AUTH_SESSION_SECRET is required for request authorization.');
  }

  async function listSystemUsers() {
    const rows = await db.queryAll(`
      SELECT id, username, password, password_secret, display_name, email, role,
             security_roles_json, primary_unit, authorized_units_json, active_unit,
             created_at, updated_at, password_changed_at, reset_token_expires_at,
             reset_requested_at, must_change_password, session_version,
             failed_attempts, locked_until, backend_mode, record_source
      FROM system_users
    `);
    return rows.map((row) => ({
      listItemId: String(row.id),
      item: mapRowToSystemUser(row)
    }));
  }

  async function listReviewScopes() {
    const rows = await db.queryAll(`
      SELECT id, review_scope_key, username, unit_value,
             created_at, updated_at, backend_mode, record_source
      FROM unit_review_scopes
    `);
    return rows.map((row) => ({
      listItemId: String(row.id),
      item: {
        id: row.review_scope_key || '',
        username: row.username || '',
        unit: row.unit_value || '',
        createdAt: row.created_at || '',
        updatedAt: row.updated_at || '',
        backendMode: row.backend_mode || '',
        recordSource: row.record_source || ''
      }
    }));
  }

  async function getSystemUserEntryByUsername(username) {
    const target = cleanLower(username);
    if (!target) return null;
    const row = await db.queryOne(`
      SELECT id, username, password, password_secret, display_name, email, role,
             security_roles_json, primary_unit, authorized_units_json, active_unit,
             created_at, updated_at, password_changed_at, reset_token_expires_at,
             reset_requested_at, must_change_password, session_version,
             failed_attempts, locked_until, backend_mode, record_source
      FROM system_users
      WHERE LOWER(username) = $1
    `, [target]);
    if (!row) return null;
    return { listItemId: String(row.id), item: mapRowToSystemUser(row) };
  }

  async function listReviewUnitsByUsername(username) {
    const target = cleanLower(username);
    if (!target) return [];
    const rows = await db.queryAll(`
      SELECT unit_value FROM unit_review_scopes WHERE LOWER(username) = $1
    `, [target]);
    return rows.map((r) => cleanText(r.unit_value)).filter(Boolean);
  }

  function resolveActiveUnit(req, user) {
    const requested = decodeHeaderUnit(readHeader(req, 'x-isms-active-unit'));
    const authorizedUnits = parseUnits(user && (user.authorizedUnits || user.scopeUnits || user.units));
    if (requested && authorizedUnits.includes(requested)) return requested;
    return cleanText(user && user.activeUnit) || authorizedUnits[0] || '';
  }

  async function requireAuthenticatedUser(req) {
    if (req && req.__ismsAuthz) return req.__ismsAuthz;
    const authorization = readHeader(req, 'authorization');
    let token = '';
    if (authorization && /^Bearer\s+/i.test(authorization)) {
      token = authorization.replace(/^Bearer\s+/i, '').trim();
    }
    if (!token) {
      token = readSessionCookie(req);
    }
    if (!token) {
      throw createHttpError('Authentication required', 401);
    }
    const sessionPayload = verifySessionToken(token, sessionSecret);
    if (!sessionPayload || !cleanText(sessionPayload.sub)) {
      throw createHttpError('Invalid session token', 401);
    }
    const userEntry = await getSystemUserEntryByUsername(sessionPayload.sub);
    if (!userEntry || !userEntry.item) {
      throw createHttpError('Session user not found', 401);
    }
    const storedSessionVersion = Number(userEntry.item.sessionVersion || 1);
    const currentSessionVersion = Number(sessionPayload.sessionVersion || 1);
    if (!Number.isFinite(storedSessionVersion) || storedSessionVersion !== currentSessionVersion) {
      throw createHttpError('Session expired', 401);
    }
    const authorizedUnits = parseUnits(userEntry.item && (userEntry.item.authorizedUnits || userEntry.item.scopeUnits || userEntry.item.units));
    const scopeUnits = parseUnits(userEntry.item && (userEntry.item.scopeUnits || userEntry.item.authorizedUnits || userEntry.item.units));
    const primaryUnit = cleanText(userEntry.item && (userEntry.item.primaryUnit || userEntry.item.unit)) || authorizedUnits[0] || '';
    const securityRoles = parseUnits(userEntry.item && userEntry.item.securityRoles);
    const user = {
      ...userEntry.item,
      primaryUnit,
      authorizedUnits,
      scopeUnits,
      securityRoles,
      units: authorizedUnits.slice(),
      activeUnit: resolveActiveUnit(req, { ...userEntry.item, authorizedUnits, scopeUnits, units: authorizedUnits, primaryUnit })
    };
    const authz = {
      token,
      sessionPayload,
      username: cleanText(user.username),
      role: cleanText(user.role),
      user,
      primaryUnit: cleanText(user.primaryUnit),
      scopeUnits: parseUnits(user.scopeUnits),
      activeUnit: cleanText(user.activeUnit),
      authorizedUnits: parseUnits(user.units),
      securityRoles: parseUnits(user.securityRoles),
      reviewUnits: cleanText(user.role) === USER_ROLES.UNIT_ADMIN ? await listReviewUnitsByUsername(user.username) : []
    };
    if (req) req.__ismsAuthz = authz;
    return authz;
  }

  function isAdmin(authz) {
    return cleanText(authz && authz.role) === USER_ROLES.ADMIN;
  }

  function isUnitAdmin(authz) {
    return cleanText(authz && authz.role) === USER_ROLES.UNIT_ADMIN;
  }

  function isViewer() {
    return false;
  }

  function matchesUsername(authz, username) {
    return cleanLower(authz && authz.username) === cleanLower(username);
  }

  function getAccessUnits(authz) {
    if (!authz) return [];
    return parseUnits(authz.authorizedUnits || authz.scopeUnits || authz.user && authz.user.authorizedUnits);
  }

  function hasUnitAccess(authz, unit) {
    if (!authz) return false;
    const target = cleanText(unit);
    if (!target) return isAdmin(authz);
    if (isAdmin(authz)) return true;
    return getAccessUnits(authz).includes(target);
  }

  function hasReviewScope(authz, unit) {
    if (!authz) return false;
    const target = cleanText(unit);
    if (isAdmin(authz)) return true;
    if (!isUnitAdmin(authz)) return false;
    const reviewUnits = parseUnits(authz.reviewUnits);
    if (!target) return reviewUnits.length > 0;
    return reviewUnits.includes(target);
  }

  function canAccessCorrectiveAction(authz, item) {
    if (!authz || !item) return false;
    if (isAdmin(authz)) return true;
    if (hasUnitAccess(authz, item.handlerUnit)) return true;
    if (matchesUsername(authz, item.handlerUsername)) return true;
    if (matchesUsername(authz, item.proposerUsername)) return true;
    return false;
  }

  function canReviewCorrectiveAction(authz, item) {
    return hasReviewScope(authz, item && (item.handlerUnit || item.proposerUnit));
  }

  function canRespondCorrectiveAction(authz, item) {
    if (!authz || !item) return false;
    return isAdmin(authz) || matchesUsername(authz, item.handlerUsername);
  }

  function canAccessChecklist(authz, item) {
    if (!authz || !item) return false;
    if (isAdmin(authz)) return true;
    return hasUnitAccess(authz, item.unit) || matchesUsername(authz, item.fillerUsername);
  }

  function canEditChecklist(authz, item) {
    if (!authz || !item) return false;
    if (isAdmin(authz)) return true;
    return hasUnitAccess(authz, item.unit) || matchesUsername(authz, item.fillerUsername);
  }

  function canAccessTrainingForm(authz, form) {
    if (!authz || !form) return false;
    if (isAdmin(authz)) return true;
    return hasUnitAccess(authz, form.unit) || matchesUsername(authz, form.fillerUsername);
  }

  function canManageTrainingForm(authz, form) {
    if (!authz || !form) return false;
    if (isAdmin(authz)) return true;
    return matchesUsername(authz, form.fillerUsername);
  }

  function canManageTrainingRoster(authz, roster) {
    if (!authz || !roster) return false;
    if (isAdmin(authz)) return true;
    return isUnitAdmin(authz) ? hasUnitAccess(authz, roster.unit) : matchesUsername(authz, roster.createdByUsername);
  }

  function requireAdmin(authz, message) {
    if (!isAdmin(authz)) throw createHttpError(message || 'Forbidden', 403);
    return authz;
  }

  function requireSelfOrAdmin(authz, username, message) {
    if (isAdmin(authz) || matchesUsername(authz, username)) return authz;
    throw createHttpError(message || 'Forbidden', 403);
  }

  function buildActorDetails(authz) {
    return {
      actorEmail: cleanText(authz && authz.user && authz.user.email),
      actorName: cleanText(authz && authz.user && authz.user.name),
      actorUsername: cleanText(authz && authz.username),
      actorRole: cleanText(authz && authz.role),
      actorUnit: cleanText(authz && authz.primaryUnit) || cleanText(authz && authz.user && authz.user.unit),
      actorActiveUnit: cleanText(authz && authz.activeUnit)
    };
  }

  function clearReviewUnitsCache() {
    // no-op: PG queries are fast enough, no cache needed
  }

  return {
    USER_ROLES,
    cleanText,
    createHttpError,
    listSystemUsers,
    listReviewScopes,
    requireAuthenticatedUser,
    requireAdmin,
    requireSelfOrAdmin,
    isAdmin,
    isUnitAdmin,
    isViewer,
    matchesUsername,
    getAccessUnits,
    hasUnitAccess,
    hasReviewScope,
    canAccessCorrectiveAction,
    canReviewCorrectiveAction,
    canRespondCorrectiveAction,
    canAccessChecklist,
    canEditChecklist,
    canAccessTrainingForm,
    canManageTrainingForm,
    canManageTrainingRoster,
    buildActorDetails,
    clearReviewUnitsCache,
    getSystemUserEntryByUsername,
    mapRowToSystemUser
  };
}

module.exports = {
  createRequestAuthz
};
