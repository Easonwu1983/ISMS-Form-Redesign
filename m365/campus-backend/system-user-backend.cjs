'use strict';

const {
  CONTRACT_VERSION,
  USER_ACTIONS,
  USER_ROLES,
  buildErrorResponse,
  buildJsonResponse,
  cleanText,
  createError,
  createSystemUserRecord,
  generatePassword,
  mapSystemUserForClient,
  normalizeSystemUserPayload,
  readStoredPasswordState,
  validateActionEnvelope,
  validatePasswordComplexity,
  validateSystemUserPayload
} = require('../azure-function/system-user-api/src/shared/contract');
const {
  STATUSES: CORRECTIVE_ACTION_STATUSES
} = require('../azure-function/corrective-action-api/src/shared/contract');
const {
  CONTRACT_VERSION: AUTH_CONTRACT_VERSION,
  AUTH_ACTIONS,
  cleanEmail,
  cleanText: cleanAuthText,
  normalizeChangePasswordPayload,
  normalizeLoginPayload,
  normalizeRedeemResetPayload,
  normalizeRequestResetPayload,
  validateChangePasswordPayload,
  validateActionEnvelope: validateAuthActionEnvelope,
  validateLoginPayload,
  validateRedeemResetPayload,
  validateRequestResetPayload
} = require('../azure-function/auth-api/src/shared/contract');
const {
  createPasswordSecret,
  createResetToken,
  createSessionToken,
  invalidateSessions,
  parsePasswordSecret,
  serializePasswordSecret,
  verifyPassword,
  verifyResetToken,
  changePassword,
  upgradePasswordSecret,
  verifySessionToken
} = require('./auth-security.cjs');
const {
  buildFieldChanges
} = require('./audit-diff.cjs');
const {
  buildHtmlDocument
} = require('./graph-mailer.cjs');
const db = require('./db.cjs');
const { mapRowToSystemUser } = require('./request-authz.cjs').createRequestAuthz ? { mapRowToSystemUser: null } : {};

function mapRowToUser(row) {
  if (!row) return null;
  const parseUnits = (v) => {
    if (Array.isArray(v)) return v.filter(Boolean);
    if (typeof v === 'string') return v.split(/\r?\n|,|;|\|/).map(s => s.trim()).filter(Boolean);
    return [];
  };
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
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
    passwordChangedAt: row.password_changed_at ? new Date(row.password_changed_at).toISOString() : '',
    resetTokenExpiresAt: row.reset_token_expires_at ? new Date(row.reset_token_expires_at).toISOString() : '',
    resetRequestedAt: row.reset_requested_at ? new Date(row.reset_requested_at).toISOString() : '',
    mustChangePassword: row.must_change_password || false,
    sessionVersion: row.session_version || 1,
    backendMode: row.backend_mode || '',
    recordSource: row.record_source || '',
    passwordSecret: row.password_secret || '',
    failedAttempts: row.failed_attempts || 0,
    lockedUntil: row.locked_until || null
  };
}

const USER_SELECT = `
  SELECT id, username, password, password_secret, display_name, email, role,
         security_roles_json, primary_unit, authorized_units_json, active_unit,
         created_at, updated_at, password_changed_at, reset_token_expires_at,
         reset_requested_at, must_change_password, session_version,
         failed_attempts, locked_until, backend_mode, record_source
  FROM system_users
`;

function createSystemUserRouter(deps) {
  const {
    parseJsonBody,
    writeJson,
    sendGraphMail,
    requestAuthz
  } = deps;

  // Keep getDelegatedToken and graphRequest for sendGraphMail only (interim)
  const graphRequest = deps.graphRequest;
  const getDelegatedToken = deps.getDelegatedToken;

  const state = {
    resetRequests: new Map(),
    legacyPasswordMigrationDone: false,
    legacyPasswordMigrationCount: 0
  };

  function getEnv(name, fallback) {
    const value = cleanText(process.env[name]);
    return value || fallback || '';
  }

  const sessionSecret = getEnv('AUTH_SESSION_SECRET', '');
  if (!sessionSecret) {
    throw new Error('AUTH_SESSION_SECRET is required for system user router.');
  }

  function readNonNegativeEnvNumber(name, fallback) {
    const raw = cleanText(process.env[name]);
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  function getSessionTtlMs() {
    const raw = Number(process.env.AUTH_SESSION_TTL_MS || '');
    return Number.isFinite(raw) && raw > 0 ? raw : (8 * 60 * 60 * 1000);
  }

  function getLoginMaxFailedAttempts() {
    const raw = Number(process.env.AUTH_MAX_FAILED_ATTEMPTS || '');
    return Number.isFinite(raw) && raw > 0 ? raw : 5;
  }

  function getLoginLockoutMs() {
    const raw = Number(process.env.AUTH_LOCKOUT_MS || '');
    return Number.isFinite(raw) && raw > 0 ? raw : (15 * 60 * 1000);
  }

  function getResetRequestWindowMs() {
    const raw = Number(process.env.AUTH_RESET_REQUEST_WINDOW_MS || '');
    return Number.isFinite(raw) && raw > 0 ? raw : (15 * 60 * 1000);
  }

  function getResetRequestMaxAttempts() {
    const raw = Number(process.env.AUTH_RESET_REQUEST_MAX_ATTEMPTS || '');
    return Number.isFinite(raw) && raw > 0 ? raw : 3;
  }

  function isTrustedProxyAddress(address) {
    const value = cleanText(address);
    if (!value) return false;
    if (value === '::1' || value === '127.0.0.1' || value === 'localhost') return true;
    if (value.startsWith('::ffff:127.')) return true;
    if (/^10\./.test(value)) return true;
    if (/^192\.168\./.test(value)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(value)) return true;
    if (/^fc[0-9a-f]{2}:/i.test(value) || /^fd[0-9a-f]{2}:/i.test(value)) return true;
    return false;
  }

  function readClientAddress(req) {
    const remoteAddress = cleanText(req && req.socket && req.socket.remoteAddress);
    const forwarded = cleanText(req && req.headers && req.headers['x-forwarded-for']);
    if (forwarded && isTrustedProxyAddress(remoteAddress)) {
      return cleanText(forwarded.split(',')[0]);
    }
    return remoteAddress;
  }

  // ── Login lockout (now DB-backed) ─────────────────────────

  async function getLoginFailureState(username) {
    const target = cleanText(username).toLowerCase();
    if (!target) return { failedCount: 0, lockedUntil: '' };
    const row = await db.queryOne(
      `SELECT failed_attempts, locked_until FROM system_users WHERE LOWER(username) = $1`,
      [target]
    );
    if (!row) return { failedCount: 0, lockedUntil: '' };
    const lockedUntil = row.locked_until ? new Date(row.locked_until) : null;
    if (lockedUntil && lockedUntil.getTime() <= Date.now()) {
      await db.query(
        `UPDATE system_users SET failed_attempts = 0, locked_until = NULL WHERE LOWER(username) = $1`,
        [target]
      );
      return { failedCount: 0, lockedUntil: '' };
    }
    return {
      failedCount: Number(row.failed_attempts) || 0,
      lockedUntil: lockedUntil ? lockedUntil.toISOString() : ''
    };
  }

  async function registerFailedLogin(username) {
    const target = cleanText(username).toLowerCase();
    const maxAttempts = getLoginMaxFailedAttempts();
    const row = await db.queryOne(`
      UPDATE system_users
      SET failed_attempts = COALESCE(failed_attempts, 0) + 1,
          locked_until = CASE
            WHEN COALESCE(failed_attempts, 0) + 1 >= $2
            THEN NOW() + ($3 || ' milliseconds')::interval
            ELSE locked_until
          END
      WHERE LOWER(username) = $1
      RETURNING failed_attempts, locked_until
    `, [target, maxAttempts, String(getLoginLockoutMs())]);
    if (!row) {
      return { failedCount: 1, lockedUntil: '', remainingAttempts: maxAttempts - 1, isLocked: false };
    }
    const failedCount = Number(row.failed_attempts) || 0;
    const lockedUntil = row.locked_until ? new Date(row.locked_until).toISOString() : '';
    return {
      failedCount,
      lockedUntil,
      remainingAttempts: Math.max(0, maxAttempts - failedCount),
      isLocked: !!lockedUntil
    };
  }

  async function clearFailedLogin(username) {
    const target = cleanText(username).toLowerCase();
    if (!target) return;
    await db.query(
      `UPDATE system_users SET failed_attempts = 0, locked_until = NULL WHERE LOWER(username) = $1`,
      [target]
    );
  }

  // ── Reset request rate limiting (still in-memory, no DB table needed) ──

  function buildResetRequestKey(username, email, clientAddress) {
    return [cleanText(username).toLowerCase(), cleanText(email).toLowerCase(), cleanText(clientAddress).toLowerCase()].join('::');
  }

  function getResetRequestState(username, email, clientAddress) {
    const key = buildResetRequestKey(username, email, clientAddress);
    const entry = state.resetRequests.get(key);
    if (!entry) return { key, count: 0, resetAt: 0 };
    if (!Number.isFinite(Number(entry.resetAt)) || Number(entry.resetAt) <= Date.now()) {
      state.resetRequests.delete(key);
      return { key, count: 0, resetAt: 0 };
    }
    return { key, count: Number(entry.count || 0), resetAt: Number(entry.resetAt || 0) };
  }

  function registerResetRequest(username, email, clientAddress) {
    const snapshot = getResetRequestState(username, email, clientAddress);
    const count = snapshot.count + 1;
    const next = { count, resetAt: Date.now() + getResetRequestWindowMs() };
    state.resetRequests.set(snapshot.key, next);
    return {
      count,
      remaining: Math.max(0, getResetRequestMaxAttempts() - count),
      limited: count > getResetRequestMaxAttempts(),
      retryAt: new Date(next.resetAt).toISOString()
    };
  }

  // ── List filters and pagination ───────────────────────────

  function readUsersListFilters(url) {
    const source = url && url.searchParams ? url.searchParams : new URLSearchParams();
    const limit = Math.max(1, Math.min(200, Number(source.get('limit')) || 20));
    const offset = Math.max(0, Number(source.get('offset')) || 0);
    return {
      role: cleanText(source.get('role')),
      unit: cleanText(source.get('unit')),
      q: cleanText(source.get('q')),
      summaryOnly: cleanText(source.get('summaryOnly')) === '1',
      limit,
      offset
    };
  }

  function buildUsersListPage(filters, total) {
    const next = filters && typeof filters === 'object' ? filters : {};
    const safeTotal = Math.max(0, Number(total) || 0);
    const limit = Math.max(1, Math.min(200, Number(next.limit) || 20));
    const pageCount = safeTotal > 0 ? Math.max(1, Math.ceil(safeTotal / limit)) : 0;
    const safeOffset = safeTotal > 0
      ? Math.min(Math.max(0, Number(next.offset) || 0), Math.max(0, (pageCount - 1) * limit))
      : 0;
    const currentPage = safeTotal > 0 ? Math.floor(safeOffset / limit) + 1 : 0;
    const hasPrev = safeOffset > 0;
    const hasNext = safeTotal > 0 && (safeOffset + limit) < safeTotal;
    return {
      offset: safeOffset, limit, total: safeTotal, pageCount, currentPage,
      hasPrev, hasNext,
      prevOffset: hasPrev ? Math.max(0, safeOffset - limit) : 0,
      nextOffset: hasNext ? safeOffset + limit : safeOffset,
      pageStart: safeTotal > 0 ? safeOffset + 1 : 0,
      pageEnd: safeTotal > 0 ? Math.min(safeOffset + limit, safeTotal) : 0
    };
  }

  function summarizeUsers(items) {
    const rows = Array.isArray(items) ? items : [];
    const summary = { total: rows.length, admin: 0, unitAdmin: 0, securityWindow: 0 };
    rows.forEach((entry) => {
      const role = cleanText(entry && entry.role);
      if (role === USER_ROLES.ADMIN) summary.admin += 1;
      if (role === USER_ROLES.UNIT_ADMIN) summary.unitAdmin += 1;
      const securityRoles = Array.isArray(entry && entry.securityRoles) ? entry.securityRoles.filter(Boolean) : [];
      if (securityRoles.length) summary.securityWindow += 1;
    });
    return summary;
  }

  function sanitizeUserForClient(entry) {
    return mapSystemUserForClient(entry);
  }

  function buildActorAudit(authz) {
    return requestAuthz && typeof requestAuthz.buildActorDetails === 'function'
      ? requestAuthz.buildActorDetails(authz)
      : {};
  }

  function buildLoginPayload(item) {
    const authState = readStoredPasswordState(item && item.password);
    return {
      ok: true,
      item: sanitizeUserForClient(item),
      session: createSessionToken(item, sessionSecret, {
        sessionVersion: authState.sessionVersion || 1,
        ttlMs: getSessionTtlMs()
      }),
      mustChangePassword: authState.mustChangePassword === true,
      contractVersion: AUTH_CONTRACT_VERSION
    };
  }

  function buildVerifyPayload(item, authz) {
    const authState = readStoredPasswordState(item && item.password);
    return {
      ok: true,
      item: sanitizeUserForClient(item),
      session: {
        token: cleanText(authz && authz.token),
        expiresAt: cleanText(authz && authz.sessionPayload && authz.sessionPayload.exp),
        payload: authz && authz.sessionPayload ? authz.sessionPayload : null
      },
      mustChangePassword: authState.mustChangePassword === true,
      contractVersion: AUTH_CONTRACT_VERSION
    };
  }

  function buildSystemUserSnapshot(item) {
    if (!item) return null;
    const passwordState = readStoredPasswordState(item.password);
    const primaryUnit = cleanText(item.primaryUnit || item.unit);
    const authorizedUnits = Array.isArray(item.authorizedUnits) && item.authorizedUnits.length
      ? item.authorizedUnits.slice()
      : (Array.isArray(item.units) ? item.units.slice() : []);
    return {
      username: cleanText(item.username), name: cleanText(item.name),
      email: cleanText(item.email), role: cleanText(item.role),
      securityRoles: Array.isArray(item.securityRoles) ? item.securityRoles.slice() : [],
      primaryUnit, authorizedUnits, scopeUnits: authorizedUnits.slice(),
      unit: primaryUnit, units: authorizedUnits.slice(),
      activeUnit: cleanText(item.activeUnit),
      hasPassword: passwordState.hasPassword === true,
      mustChangePassword: passwordState.mustChangePassword === true,
      sessionVersion: Number(passwordState.sessionVersion || 1)
    };
  }

  function buildSystemUserChanges(beforeItem, afterItem) {
    const beforePassword = readStoredPasswordState(beforeItem && beforeItem.password);
    const afterPassword = readStoredPasswordState(afterItem && afterItem.password);
    return buildFieldChanges(beforeItem, afterItem, [
      'name', 'email', 'role',
      { key: 'securityRoles', kind: 'array' },
      'primaryUnit', 'unit',
      { key: 'authorizedUnits', kind: 'array' },
      { key: 'units', kind: 'array' },
      'activeUnit',
      { label: 'hasPassword', kind: 'boolean', get: (_, index) => index === 0 ? beforePassword.hasPassword : afterPassword.hasPassword },
      { label: 'mustChangePassword', kind: 'boolean', get: (_, index) => index === 0 ? beforePassword.mustChangePassword : afterPassword.mustChangePassword },
      { label: 'sessionVersion', kind: 'number', get: (_, index) => index === 0 ? beforePassword.sessionVersion : afterPassword.sessionVersion },
      { label: 'passwordChangedAt', get: (_, index) => index === 0 ? beforePassword.passwordChangedAt : afterPassword.passwordChangedAt },
      { label: 'resetTokenExpiresAt', get: (_, index) => index === 0 ? beforePassword.resetTokenExpiresAt : afterPassword.resetTokenExpiresAt }
    ].map((definition) => {
      if (typeof definition === 'string') return definition;
      const originalGet = definition.get;
      if (!originalGet) return definition;
      return { ...definition, get: (item) => originalGet(item, item === beforeItem ? 0 : 1) };
    }));
  }

  function buildResetMail(savedItem, reset) {
    return {
      subject: 'ISMS 系統密碼重設通知',
      html: buildHtmlDocument([
        `您好，${cleanText(savedItem && savedItem.name) || cleanText(savedItem && savedItem.username)}：`,
        '系統已為您建立一次性密碼重設代碼。',
        `帳號：${cleanText(savedItem && savedItem.username)}`,
        `重設代碼：${cleanText(reset && reset.token)}`,
        `有效期限：${cleanText(reset && reset.expiresAt)}`,
        '請回到登入頁的「忘記密碼」流程，輸入重設代碼與新密碼完成重設。',
        '若這不是您本人操作，請立即聯絡系統管理者。'
      ])
    };
  }

  function preparePasswordForPersist(nextItem, options) {
    const opts = options || {};
    const existingPassword = cleanText(opts.existingPassword);
    const incomingPassword = cleanText(nextItem && nextItem.password);
    if (incomingPassword) {
      const secret = createPasswordSecret(incomingPassword, {
        mustChangePassword: opts.forcePasswordChange === true,
        sessionVersion: opts.sessionVersion
      });
      return serializePasswordSecret(secret);
    }
    if (!existingPassword) return '';
    const parsed = parsePasswordSecret(existingPassword);
    if (parsed.hasPassword && !parsed.legacy) return existingPassword;
    return serializePasswordSecret(upgradePasswordSecret(parsed.plaintext || parsed.raw || existingPassword, parsed.raw || existingPassword));
  }

  function routeUserName(value) {
    return decodeURIComponent(String(value || '').trim());
  }

  // ── DB operations ─────────────────────────────────────────

  async function listAllUsers() {
    const rows = await db.queryAll(USER_SELECT + ` ORDER BY username`);
    return rows.map((row) => ({ listItemId: String(row.id), item: mapRowToUser(row) }));
  }

  async function getUserEntryByUsername(username) {
    const target = cleanText(username).toLowerCase();
    if (!target) throw createError('Missing username', 400);
    const row = await db.queryOne(USER_SELECT + ` WHERE LOWER(username) = $1`, [target]);
    if (!row) return null;
    return { listItemId: String(row.id), item: mapRowToUser(row) };
  }

  async function getUserEntryByEmail(email) {
    const target = cleanEmail(email);
    if (!target) throw createError('Missing email', 400);
    const row = await db.queryOne(USER_SELECT + ` WHERE LOWER(email) = $1`, [target]);
    if (!row) return null;
    return { listItemId: String(row.id), item: mapRowToUser(row) };
  }

  async function findDuplicateEmail(email, excludeUsername) {
    const targetEmail = cleanEmail(email);
    const skipUser = cleanText(excludeUsername).toLowerCase();
    if (!targetEmail) return null;
    const row = await db.queryOne(
      USER_SELECT + ` WHERE LOWER(email) = $1 AND LOWER(username) != $2`,
      [targetEmail, skipUser]
    );
    if (!row) return null;
    return { listItemId: String(row.id), item: mapRowToUser(row) };
  }

  async function upsertUser(existingEntry, nextItem) {
    const normalized = createSystemUserRecord(nextItem, nextItem.updatedAt || new Date().toISOString());
    const now = normalized.updatedAt || new Date().toISOString();
    const securityRolesJson = Array.isArray(normalized.securityRoles) ? JSON.stringify(normalized.securityRoles) : '[]';
    const authorizedUnitsJson = Array.isArray(normalized.authorizedUnits || normalized.units)
      ? JSON.stringify(normalized.authorizedUnits || normalized.units)
      : '[]';

    if (existingEntry) {
      const row = await db.queryOne(`
        UPDATE system_users SET
          password = $2, password_secret = $3, display_name = $4, email = $5, role = $6,
          security_roles_json = $7, primary_unit = $8, authorized_units_json = $9,
          active_unit = $10, password_changed_at = $11, reset_token_expires_at = $12,
          reset_requested_at = $13, must_change_password = $14, session_version = $15,
          backend_mode = $16, record_source = $17, updated_at = $18
        WHERE id = $1
        RETURNING id
      `, [
        Number(existingEntry.listItemId),
        cleanText(normalized.password),
        cleanText(normalized.passwordSecret || ''),
        cleanText(normalized.name),
        cleanText(normalized.email),
        cleanText(normalized.role),
        securityRolesJson,
        cleanText(normalized.primaryUnit || normalized.unit),
        authorizedUnitsJson,
        cleanText(normalized.activeUnit),
        normalized.passwordChangedAt || null,
        normalized.resetTokenExpiresAt || null,
        normalized.resetRequestedAt || null,
        normalized.mustChangePassword || false,
        Number(normalized.sessionVersion || 1),
        cleanText(normalized.backendMode) || 'pg-campus-backend',
        cleanText(normalized.recordSource) || 'frontend',
        now
      ]);
      return { created: false, item: normalized };
    }

    const row = await db.queryOne(`
      INSERT INTO system_users (
        username, password, password_secret, display_name, email, role,
        security_roles_json, primary_unit, authorized_units_json, active_unit,
        password_changed_at, reset_token_expires_at, reset_requested_at,
        must_change_password, session_version, backend_mode, record_source,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING id
    `, [
      cleanText(normalized.username),
      cleanText(normalized.password),
      cleanText(normalized.passwordSecret || ''),
      cleanText(normalized.name),
      cleanText(normalized.email),
      cleanText(normalized.role),
      securityRolesJson,
      cleanText(normalized.primaryUnit || normalized.unit),
      authorizedUnitsJson,
      cleanText(normalized.activeUnit),
      normalized.passwordChangedAt || null,
      normalized.resetTokenExpiresAt || null,
      normalized.resetRequestedAt || null,
      normalized.mustChangePassword || false,
      Number(normalized.sessionVersion || 1),
      cleanText(normalized.backendMode) || 'pg-campus-backend',
      cleanText(normalized.recordSource) || 'frontend',
      normalized.createdAt || now,
      now
    ]);
    return { created: true, item: normalized };
  }

  async function deleteUserEntry(existingEntry) {
    await db.query(`DELETE FROM system_users WHERE id = $1`, [Number(existingEntry.listItemId)]);
  }

  async function createAuditRow(input) {
    await db.query(`
      INSERT INTO ops_audit (title, event_type, actor_email, target_email, unit_code, record_id, occurred_at, payload_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      cleanText(input.recordId || input.eventType || 'audit'),
      cleanText(input.eventType),
      cleanText(input.actorEmail),
      cleanText(input.targetEmail),
      cleanText(input.unitCode),
      cleanText(input.recordId),
      cleanText(input.occurredAt) || new Date().toISOString(),
      cleanText(input.payloadJson)
    ]);
  }

  async function tryCreateAuditRow(input) {
    try {
      await createAuditRow(input);
    } catch (error) {
      console.error('[system-users] failed to create audit row', String(error && error.message || error || 'unknown error'), input && input.eventType ? 'event=' + input.eventType : '');
    }
  }

  async function listCorrectiveActionsByUsername(username) {
    const target = cleanText(username).toLowerCase();
    if (!target) return [];
    const rows = await db.queryAll(`
      SELECT case_id, status, handler_username, reviewer, trackings_json
      FROM corrective_actions
      WHERE status != $1
        AND (LOWER(handler_username) = $2 OR LOWER(reviewer) = $2)
    `, [CORRECTIVE_ACTION_STATUSES.CLOSED || '結案', target]);
    return rows.map((row) => ({
      id: row.case_id,
      status: row.status,
      refs: ['handler']
    }));
  }

  function filterUsers(items, filters) {
    const next = filters && typeof filters === 'object' ? filters : {};
    const role = cleanText(next.role);
    const unit = cleanText(next.unit);
    const query = cleanText(next.q).toLowerCase();
    return items.filter((entry) => {
      if (role && entry.role !== role) return false;
      if (unit && entry.unit !== unit && !(Array.isArray(entry.units) && entry.units.includes(unit))) return false;
      if (query) {
        const haystack = [entry.username, entry.name, entry.email, entry.role, entry.unit].concat(Array.isArray(entry.units) ? entry.units : []).join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    }).sort((left, right) => String(left.username || '').localeCompare(String(right.username || '')));
  }

  // ── Handlers ──────────────────────────────────────────────

  async function buildHealth() {
    const dbHealth = await db.healthCheck();
    return {
      ok: dbHealth.ok,
      ready: dbHealth.ok,
      contractVersion: CONTRACT_VERSION,
      repository: 'postgresql',
      database: { ok: dbHealth.ok, latencyMs: dbHealth.latencyMs }
    };
  }

  async function buildAuthHealth() {
    const health = await buildHealth();
    return { ...health, contractVersion: AUTH_CONTRACT_VERSION };
  }

  async function handleHealth(_req, res, origin) {
    try {
      await writeJson(res, buildJsonResponse(200, await buildHealth()), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to read system-user backend health.', 500), origin);
    }
  }

  async function handleAuthHealth(_req, res, origin) {
    try {
      await writeJson(res, buildJsonResponse(200, await buildAuthHealth()), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to read auth backend health.', 500), origin);
    }
  }

  async function handleList(req, res, origin, url) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      requestAuthz.requireAdmin(authz, 'Only admin can list system users');
      const filters = readUsersListFilters(url);
      const rows = await listAllUsers();
      const filteredItems = filterUsers(rows.map((entry) => entry.item), filters);
      const summary = summarizeUsers(filteredItems);
      const page = buildUsersListPage(filters, filteredItems.length);
      const payload = {
        ok: true,
        items: filters.summaryOnly
          ? []
          : filteredItems.slice(page.offset, page.offset + page.limit).map(sanitizeUserForClient),
        total: filteredItems.length,
        summary,
        page: filters.summaryOnly
          ? { ...page, returned: 0, pageStart: 0, pageEnd: 0 }
          : { ...page, returned: Math.max(0, Math.min(page.limit, filteredItems.length - page.offset)) },
        filters: {
          role: filters.role, unit: filters.unit, q: filters.q,
          limit: String(page.limit), offset: String(page.offset),
          summaryOnly: filters.summaryOnly ? '1' : ''
        },
        generatedAt: new Date().toISOString(),
        contractVersion: CONTRACT_VERSION
      };
      await writeJson(res, buildJsonResponse(200, payload), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to list system users.', 500), origin);
    }
  }

  async function handleDetail(req, res, origin, username) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      requestAuthz.requireSelfOrAdmin(authz, username, 'Only admin or the same user can read this account');
      const existing = await getUserEntryByUsername(username);
      if (!existing) throw createError('System user not found', 404);
      await writeJson(res, buildJsonResponse(200, {
        ok: true, item: sanitizeUserForClient(existing.item), contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to read system user detail.', 500), origin);
    }
  }

  async function handleUpsert(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      requestAuthz.requireAdmin(authz, 'Only admin can manage system users');
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, USER_ACTIONS.UPSERT);
      const incoming = normalizeSystemUserPayload(envelope.payload);
      const incomingPassword = cleanText(incoming.password);
      if (incomingPassword) validatePasswordComplexity(incomingPassword, 'password');
      const existing = await getUserEntryByUsername(incoming.username).catch(() => null);
      const existingAuthState = readStoredPasswordState(existing && existing.item && existing.item.password);
      const source = existing && existing.item ? existing.item : {};
      const now = new Date().toISOString();
      const payload = normalizeSystemUserPayload({
        username: source.username || incoming.username,
        password: incomingPassword,
        name: cleanText(incoming.name) || cleanText(source.name),
        email: cleanText(incoming.email) || cleanText(source.email),
        role: cleanText(incoming.role) || cleanText(source.role),
        securityRoles: Array.isArray(incoming.securityRoles) && incoming.securityRoles.length
          ? incoming.securityRoles
          : (Array.isArray(source.securityRoles) ? source.securityRoles : []),
        primaryUnit: cleanText(incoming.primaryUnit) || cleanText(incoming.unit) || cleanText(source.primaryUnit) || cleanText(source.unit),
        authorizedUnits: Array.isArray(incoming.authorizedUnits) && incoming.authorizedUnits.length
          ? incoming.authorizedUnits
          : (Array.isArray(incoming.units) && incoming.units.length ? incoming.units : (Array.isArray(source.authorizedUnits) && source.authorizedUnits.length ? source.authorizedUnits : source.units)),
        units: Array.isArray(incoming.authorizedUnits) && incoming.authorizedUnits.length
          ? incoming.authorizedUnits
          : (Array.isArray(incoming.units) && incoming.units.length ? incoming.units : (Array.isArray(source.authorizedUnits) && source.authorizedUnits.length ? source.authorizedUnits : source.units)),
        activeUnit: cleanText(incoming.activeUnit) || cleanText(source.activeUnit),
        createdAt: cleanText(source.createdAt) || cleanText(incoming.createdAt),
        updatedAt: now,
        passwordChangedAt: cleanText(source.passwordChangedAt),
        resetTokenExpiresAt: cleanText(source.resetTokenExpiresAt),
        resetRequestedAt: cleanText(source.resetRequestedAt),
        mustChangePassword: incomingPassword ? (envelope.payload && envelope.payload.forcePasswordChange !== false) : existingAuthState.mustChangePassword,
        sessionVersion: existingAuthState.sessionVersion || 1,
        backendMode: cleanText(source.backendMode) || 'pg-campus-backend',
        recordSource: cleanText(source.recordSource) || 'frontend'
      });
      validateSystemUserPayload(payload, { requirePassword: !existing });
      const emailDuplicate = await findDuplicateEmail(payload.email, payload.username);
      if (emailDuplicate) throw createError('Another user already uses this email', 409);
      const persistPassword = preparePasswordForPersist({ password: incomingPassword }, {
        existingPassword: cleanText(existing && existing.item && existing.item.password),
        forcePasswordChange: incomingPassword ? (envelope.payload && envelope.payload.forcePasswordChange !== false) : existingAuthState.mustChangePassword,
        sessionVersion: existingAuthState.sessionVersion || 1
      });
      const saved = await upsertUser(existing, {
        username: payload.username, password: persistPassword,
        name: payload.name, email: payload.email, role: payload.role,
        primaryUnit: payload.primaryUnit, authorizedUnits: payload.authorizedUnits,
        scopeUnits: payload.scopeUnits, unit: payload.primaryUnit, units: payload.units,
        activeUnit: payload.activeUnit,
        createdAt: existing ? cleanText(source.createdAt) || now : (payload.createdAt || now),
        updatedAt: now,
        passwordChangedAt: payload.passwordChangedAt || cleanText(source.passwordChangedAt),
        resetTokenExpiresAt: payload.resetTokenExpiresAt || cleanText(source.resetTokenExpiresAt),
        resetRequestedAt: payload.resetRequestedAt || cleanText(source.resetRequestedAt),
        mustChangePassword: payload.mustChangePassword,
        sessionVersion: payload.sessionVersion || 1,
        backendMode: payload.backendMode, recordSource: payload.recordSource
      });
      const actor = buildActorAudit(authz);
      await tryCreateAuditRow({
        eventType: existing ? 'system-user.updated' : 'system-user.created',
        actorEmail: actor.actorEmail, targetEmail: saved.item.email,
        unitCode: '', recordId: saved.item.username, occurredAt: now,
        payloadJson: JSON.stringify({
          action: USER_ACTIONS.UPSERT, actorName: actor.actorName, actorUsername: actor.actorUsername,
          snapshot: existing ? null : buildSystemUserSnapshot(saved.item),
          changes: buildSystemUserChanges(existing && existing.item, saved.item)
        })
      });
      await writeJson(res, buildJsonResponse(saved.created ? 201 : 200, {
        ok: true, item: sanitizeUserForClient(saved.item), contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to upsert system user.', 500), origin);
    }
  }

  async function handleDelete(req, res, origin, username) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      requestAuthz.requireAdmin(authz, 'Only admin can delete system users');
      const existing = await getUserEntryByUsername(username);
      if (!existing) throw createError('System user not found', 404);
      const cleanUsername = cleanText(username).toLowerCase();
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, USER_ACTIONS.DELETE);
      if (existing.item.role === USER_ROLES.ADMIN) {
        throw createError('Primary admin cannot be deleted', 409);
      }
      const blockingCases = await listCorrectiveActionsByUsername(cleanUsername);
      if (blockingCases.length) {
        const caseSummary = blockingCases.slice(0, 5).map((entry) => `${entry.id}${entry.refs && entry.refs.length ? `(${entry.refs.join('、')})` : ''}`).join('、');
        throw createError(`此帳號仍關聯 ${blockingCases.length} 筆未結案矯正單，請先轉派或結案後再刪除${caseSummary ? `：${caseSummary}` : ''}`, 409);
      }
      const now = new Date().toISOString();
      await deleteUserEntry(existing);
      const actor = buildActorAudit(authz);
      await tryCreateAuditRow({
        eventType: 'system-user.deleted', actorEmail: actor.actorEmail,
        targetEmail: existing.item.email, unitCode: '', recordId: existing.item.username,
        occurredAt: now, payloadJson: JSON.stringify({
          action: USER_ACTIONS.DELETE, actorName: actor.actorName,
          actorUsername: actor.actorUsername, deletedState: buildSystemUserSnapshot(existing.item)
        })
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true, deletedId: existing.item.username, contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to delete system user.', 500), origin);
    }
  }

  async function handleResetPassword(req, res, origin, username) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      requestAuthz.requireAdmin(authz, 'Only admin can reset another user password');
      const existing = await getUserEntryByUsername(username);
      if (!existing) throw createError('System user not found', 404);
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, USER_ACTIONS.RESET_PASSWORD);
      const now = new Date().toISOString();
      const reset = createResetToken(existing.item.password, { now });
      const saved = await upsertUser(existing, {
        ...existing.item, password: serializePasswordSecret(reset.secret),
        mustChangePassword: true, resetRequestedAt: now,
        resetTokenExpiresAt: reset.expiresAt, updatedAt: now
      });
      const actor = buildActorAudit(authz);
      await tryCreateAuditRow({
        eventType: 'system-user.reset-token-issued', actorEmail: actor.actorEmail,
        targetEmail: saved.item.email, unitCode: '', recordId: saved.item.username,
        occurredAt: now, payloadJson: JSON.stringify({
          action: USER_ACTIONS.RESET_PASSWORD, actorName: actor.actorName,
          actorUsername: actor.actorUsername, changes: buildSystemUserChanges(existing.item, saved.item)
        })
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true, item: sanitizeUserForClient(saved.item),
        resetTokenExpiresAt: reset.expiresAt, contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to reset system user password.', 500), origin);
    }
  }

  async function handleLogin(req, res, origin) {
    try {
      const envelope = await parseJsonBody(req);
      validateAuthActionEnvelope(envelope, AUTH_ACTIONS.LOGIN);
      const payload = normalizeLoginPayload(envelope.payload);
      validateLoginPayload(payload);
      const throttle = await getLoginFailureState(payload.username);
      if (throttle.lockedUntil) {
        void tryCreateAuditRow({
          eventType: 'auth.login.locked', actorEmail: '', targetEmail: '',
          unitCode: '', recordId: payload.username, occurredAt: new Date().toISOString(),
          payloadJson: JSON.stringify({
            action: AUTH_ACTIONS.LOGIN, reason: 'locked',
            clientAddress: readClientAddress(req), lockedUntil: throttle.lockedUntil
          })
        });
        await writeJson(res, buildJsonResponse(429, {
          ok: false, error: 'Too many failed login attempts. Please try again later.',
          lockedUntil: throttle.lockedUntil, contractVersion: AUTH_CONTRACT_VERSION
        }), origin);
        return;
      }
      const existing = await getUserEntryByUsername(payload.username).catch(() => null);
      if (!existing) {
        const nextThrottle = await registerFailedLogin(payload.username);
        void tryCreateAuditRow({
          eventType: 'auth.login.failed', actorEmail: '', targetEmail: '',
          unitCode: '', recordId: payload.username, occurredAt: new Date().toISOString(),
          payloadJson: JSON.stringify({
            action: AUTH_ACTIONS.LOGIN, reason: 'user-not-found',
            clientAddress: readClientAddress(req), failedCount: nextThrottle.failedCount,
            lockedUntil: nextThrottle.lockedUntil
          })
        });
        await writeJson(res, buildJsonResponse(nextThrottle.isLocked ? 429 : 401, {
          ok: false,
          error: nextThrottle.isLocked ? 'Too many failed login attempts. Please try again later.' : 'Invalid username or password',
          lockedUntil: nextThrottle.lockedUntil, contractVersion: AUTH_CONTRACT_VERSION
        }), origin);
        return;
      }
      const verification = verifyPassword(payload.password, existing.item.password);
      if (!verification.ok) {
        const nextThrottle = await registerFailedLogin(existing.item.username);
        await tryCreateAuditRow({
          eventType: 'auth.login.failed', actorEmail: '', targetEmail: existing.item.email,
          unitCode: '', recordId: existing.item.username, occurredAt: new Date().toISOString(),
          payloadJson: JSON.stringify({
            action: AUTH_ACTIONS.LOGIN, reason: 'invalid-password',
            clientAddress: readClientAddress(req), failedCount: nextThrottle.failedCount,
            lockedUntil: nextThrottle.lockedUntil
          })
        });
        await writeJson(res, buildJsonResponse(nextThrottle.isLocked ? 429 : 401, {
          ok: false,
          error: nextThrottle.isLocked ? 'Too many failed login attempts. Please try again later.' : 'Invalid username or password',
          lockedUntil: nextThrottle.lockedUntil, contractVersion: AUTH_CONTRACT_VERSION
        }), origin);
        return;
      }
      let resolvedEntry = existing;
      if (verification.needsUpgrade) {
        const upgraded = upgradePasswordSecret(payload.password, verification.secret);
        resolvedEntry = await upsertUser(existing, {
          ...existing.item, password: serializePasswordSecret(upgraded),
          passwordChangedAt: upgraded.passwordChangedAt,
          mustChangePassword: upgraded.mustChangePassword,
          resetTokenExpiresAt: '', resetRequestedAt: '',
          sessionVersion: upgraded.sessionVersion, updatedAt: new Date().toISOString()
        });
      }
      await clearFailedLogin(resolvedEntry.item.username);
      void tryCreateAuditRow({
        eventType: 'auth.login.success', actorEmail: resolvedEntry.item.email,
        targetEmail: resolvedEntry.item.email, unitCode: '', recordId: resolvedEntry.item.username,
        occurredAt: new Date().toISOString(),
        payloadJson: JSON.stringify({
          action: AUTH_ACTIONS.LOGIN,
          sessionVersion: readStoredPasswordState(resolvedEntry.item.password).sessionVersion
        })
      });
      await writeJson(res, buildJsonResponse(200, buildLoginPayload(resolvedEntry.item)), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to login.', 500), origin);
    }
  }

  async function handleVerify(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getUserEntryByUsername(authz.username);
      if (!existing) throw createError('System user not found', 404);
      await writeJson(res, buildJsonResponse(200, buildVerifyPayload(existing.item, authz)), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to verify session.', 500), origin);
    }
  }

  async function handleLogout(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getUserEntryByUsername(authz.username);
      if (!existing) throw createError('System user not found', 404);
      const now = new Date().toISOString();
      const nextSecret = invalidateSessions(existing.item.password, { updatedAt: now });
      const saved = await upsertUser(existing, {
        ...existing.item, password: serializePasswordSecret(nextSecret),
        sessionVersion: nextSecret.sessionVersion, updatedAt: now
      });
      await clearFailedLogin(saved.item.username);
      void tryCreateAuditRow({
        eventType: 'auth.logout', actorEmail: saved.item.email,
        targetEmail: saved.item.email, unitCode: '', recordId: saved.item.username,
        occurredAt: now, payloadJson: JSON.stringify({
          action: AUTH_ACTIONS.LOGOUT,
          previousSessionVersion: Number(authz.sessionPayload && authz.sessionPayload.sessionVersion || 1),
          nextSessionVersion: nextSecret.sessionVersion,
          changes: buildSystemUserChanges(existing.item, saved.item)
        })
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true, username: saved.item.username, loggedOut: true, contractVersion: AUTH_CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to logout.', 500), origin);
    }
  }

  async function handleRequestReset(req, res, origin) {
    try {
      const envelope = await parseJsonBody(req);
      validateAuthActionEnvelope(envelope, AUTH_ACTIONS.REQUEST_RESET);
      const payload = normalizeRequestResetPayload(envelope.payload);
      validateRequestResetPayload(payload);
      const clientAddress = readClientAddress(req);
      const throttle = registerResetRequest(payload.username, payload.email, clientAddress);
      if (throttle.limited) throw createError('Too many reset requests. Please try again later.', 429);
      const existing = await getUserEntryByEmail(payload.email);
      if (!existing) throw createError('System user not found', 404);
      if (cleanText(existing.item.username).toLowerCase() !== cleanText(payload.username).toLowerCase()) {
        throw createError('System user not found', 404);
      }
      const now = new Date().toISOString();
      const reset = createResetToken(existing.item.password, { now });
      const saved = await upsertUser(existing, {
        ...existing.item, password: serializePasswordSecret(reset.secret),
        mustChangePassword: true, resetRequestedAt: now,
        resetTokenExpiresAt: reset.expiresAt, updatedAt: now
      });
      const delivery = await sendGraphMail({
        graphRequest, getDelegatedToken,
        to: saved.item.email, ...buildResetMail(saved.item, reset)
      });
      await tryCreateAuditRow({
        eventType: 'auth.reset-token-issued',
        actorEmail: cleanText(payload.actorEmail || payload.email),
        targetEmail: saved.item.email, unitCode: '', recordId: saved.item.username,
        occurredAt: now, payloadJson: JSON.stringify({
          action: AUTH_ACTIONS.REQUEST_RESET,
          actorName: cleanText(payload.actorName),
          changes: buildSystemUserChanges(existing.item, saved.item)
        })
      });
      await tryCreateAuditRow({
        eventType: delivery.sent ? 'auth.reset-email-sent' : 'auth.reset-email-failed',
        actorEmail: cleanText(payload.actorEmail || payload.email),
        targetEmail: saved.item.email, unitCode: '', recordId: saved.item.username,
        occurredAt: now, payloadJson: JSON.stringify({
          action: AUTH_ACTIONS.REQUEST_RESET,
          actorName: cleanText(payload.actorName), delivery
        })
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true, item: sanitizeUserForClient(saved.item),
        resetTokenExpiresAt: reset.expiresAt, delivery, contractVersion: AUTH_CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to reset password by email.', 500), origin);
    }
  }

  async function handleRedeemReset(req, res, origin) {
    try {
      const envelope = await parseJsonBody(req);
      validateAuthActionEnvelope(envelope, AUTH_ACTIONS.REDEEM_RESET);
      const payload = normalizeRedeemResetPayload(envelope.payload);
      validateRedeemResetPayload(payload);
      const existing = await getUserEntryByUsername(payload.username);
      if (!existing) throw createError('System user not found', 404);
      if (!verifyResetToken(payload.token, existing.item.password)) {
        throw createError('Invalid or expired reset token', 401);
      }
      const nextSecret = changePassword(existing.item.password, payload.newPassword, { mustChangePassword: false });
      const now = new Date().toISOString();
      const saved = await upsertUser(existing, {
        ...existing.item, password: serializePasswordSecret(nextSecret),
        mustChangePassword: false, passwordChangedAt: nextSecret.passwordChangedAt,
        resetRequestedAt: '', resetTokenExpiresAt: '',
        sessionVersion: nextSecret.sessionVersion, updatedAt: now
      });
      await tryCreateAuditRow({
        eventType: 'auth.reset-password.completed', actorEmail: saved.item.email,
        targetEmail: saved.item.email, unitCode: '', recordId: saved.item.username,
        occurredAt: now, payloadJson: JSON.stringify({
          action: AUTH_ACTIONS.REDEEM_RESET, changes: buildSystemUserChanges(existing.item, saved.item)
        })
      });
      await writeJson(res, buildJsonResponse(200, buildLoginPayload(saved.item)), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to redeem reset token.', 500), origin);
    }
  }

  async function handleChangePassword(req, res, origin) {
    try {
      const envelope = await parseJsonBody(req);
      validateAuthActionEnvelope(envelope, AUTH_ACTIONS.CHANGE_PASSWORD);
      const payload = normalizeChangePasswordPayload(envelope.payload);
      validateChangePasswordPayload(payload);
      const existing = await getUserEntryByUsername(payload.username);
      if (!existing) throw createError('System user not found', 404);
      if (payload.sessionToken) {
        const sessionPayload = verifySessionToken(payload.sessionToken, sessionSecret);
        if (!sessionPayload || cleanText(sessionPayload.sub).toLowerCase() !== cleanText(payload.username).toLowerCase()) {
          throw createError('Invalid session token', 401);
        }
        const existingState = readStoredPasswordState(existing.item.password);
        if (Number(existingState.sessionVersion || 1) !== Number(sessionPayload.sessionVersion || 1)) {
          throw createError('Session expired', 401);
        }
      }
      const verification = verifyPassword(payload.currentPassword, existing.item.password);
      if (!verification.ok) throw createError('Current password is invalid', 401);
      const nextSecret = changePassword(existing.item.password, payload.newPassword, { mustChangePassword: false });
      const now = new Date().toISOString();
      const saved = await upsertUser(existing, {
        ...existing.item, password: serializePasswordSecret(nextSecret),
        mustChangePassword: false, passwordChangedAt: nextSecret.passwordChangedAt,
        resetRequestedAt: '', resetTokenExpiresAt: '',
        sessionVersion: nextSecret.sessionVersion, updatedAt: now
      });
      await tryCreateAuditRow({
        eventType: 'auth.password-changed', actorEmail: saved.item.email,
        targetEmail: saved.item.email, unitCode: '', recordId: saved.item.username,
        occurredAt: now, payloadJson: JSON.stringify({
          action: AUTH_ACTIONS.CHANGE_PASSWORD,
          changes: buildSystemUserChanges(existing.item, saved.item)
        })
      });
      await writeJson(res, buildJsonResponse(200, buildLoginPayload(saved.item)), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to change password.', 500), origin);
    }
  }

  function tryHandle(req, res, origin, url) {
    const detailMatch = url.pathname.match(/^\/api\/system-users\/([^/]+)\/?$/);
    const deleteMatch = url.pathname.match(/^\/api\/system-users\/([^/]+)\/delete\/?$/);
    const resetMatch = url.pathname.match(/^\/api\/system-users\/([^/]+)\/reset-password\/?$/);

    if (url.pathname === '/api/system-users/health' && req.method === 'GET') {
      return handleHealth(req, res, origin).then(() => true);
    }
    if (url.pathname === '/api/system-users' && req.method === 'GET') {
      return handleList(req, res, origin, url).then(() => true);
    }
    if (url.pathname === '/api/system-users/upsert' && req.method === 'POST') {
      return handleUpsert(req, res, origin).then(() => true);
    }
    if (detailMatch && req.method === 'GET') {
      return handleDetail(req, res, origin, routeUserName(detailMatch[1])).then(() => true);
    }
    if (deleteMatch && req.method === 'POST') {
      return handleDelete(req, res, origin, routeUserName(deleteMatch[1])).then(() => true);
    }
    if (resetMatch && req.method === 'POST') {
      return handleResetPassword(req, res, origin, routeUserName(resetMatch[1])).then(() => true);
    }
    if (url.pathname === '/api/auth/health' && req.method === 'GET') {
      return handleAuthHealth(req, res, origin).then(() => true);
    }
    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      return handleLogin(req, res, origin).then(() => true);
    }
    if (url.pathname === '/api/auth/verify' && req.method === 'GET') {
      return handleVerify(req, res, origin).then(() => true);
    }
    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      return handleLogout(req, res, origin).then(() => true);
    }
    if (url.pathname === '/api/auth/request-reset' && req.method === 'POST') {
      return handleRequestReset(req, res, origin).then(() => true);
    }
    if (url.pathname === '/api/auth/redeem-reset' && req.method === 'POST') {
      return handleRedeemReset(req, res, origin).then(() => true);
    }
    if (url.pathname === '/api/auth/change-password' && req.method === 'POST') {
      return handleChangePassword(req, res, origin).then(() => true);
    }
    return Promise.resolve(false);
  }

  function invalidateUsersCache() {
    // no-op: no cache needed with PG
  }

  return {
    tryHandle,
    invalidateUsersCache
  };
}

module.exports = {
  createSystemUserRouter
};
