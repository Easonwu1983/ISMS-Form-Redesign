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
  mapGraphFieldsToSystemUser,
  mapSystemUserForClient,
  mapSystemUserToGraphFields,
  normalizeSystemUserPayload,
  readStoredPasswordState,
  validateActionEnvelope,
  validateSystemUserPayload
} = require('../azure-function/system-user-api/src/shared/contract');
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

function createSystemUserRouter(deps) {
  const {
    parseJsonBody,
    writeJson,
    graphRequest,
    resolveSiteId,
    getDelegatedToken,
    requestAuthz
  } = deps;

  const state = {
    listMap: null,
    listColumnsMap: new Map(),
    loginFailures: new Map()
  };

  function getEnv(name, fallback) {
    const value = cleanText(process.env[name]);
    return value || fallback || '';
  }

  const sessionSecret = getEnv('AUTH_SESSION_SECRET', 'isms-campus-auth-dev-secret');

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

  function readClientAddress(req) {
    const forwarded = cleanText(req && req.headers && req.headers['x-forwarded-for']);
    if (forwarded) return cleanText(forwarded.split(',')[0]);
    return cleanText(req && req.socket && req.socket.remoteAddress);
  }

  function buildLoginFailureKey(username) {
    return cleanText(username).toLowerCase();
  }

  function getLoginFailureState(username) {
    const key = buildLoginFailureKey(username);
    const entry = state.loginFailures.get(key);
    if (!entry) return { key, failedCount: 0, lockedUntil: '' };
    const lockUntil = cleanText(entry.lockedUntil);
    if (lockUntil) {
      const lockUntilMs = Date.parse(lockUntil);
      if (!Number.isFinite(lockUntilMs) || lockUntilMs <= Date.now()) {
        state.loginFailures.delete(key);
        return { key, failedCount: 0, lockedUntil: '' };
      }
    }
    return {
      key,
      failedCount: Number.isFinite(Number(entry.failedCount)) ? Number(entry.failedCount) : 0,
      lockedUntil: lockUntil
    };
  }

  function registerFailedLogin(username) {
    const snapshot = getLoginFailureState(username);
    const failedCount = snapshot.failedCount + 1;
    const maxAttempts = getLoginMaxFailedAttempts();
    const lockedUntil = failedCount >= maxAttempts
      ? new Date(Date.now() + getLoginLockoutMs()).toISOString()
      : '';
    const next = {
      failedCount,
      lockedUntil,
      updatedAt: new Date().toISOString()
    };
    state.loginFailures.set(snapshot.key, next);
    return {
      ...next,
      remainingAttempts: Math.max(0, maxAttempts - failedCount),
      isLocked: !!lockedUntil
    };
  }

  function clearFailedLogin(username) {
    state.loginFailures.delete(buildLoginFailureKey(username));
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
    return {
      username: cleanText(item.username),
      name: cleanText(item.name),
      email: cleanText(item.email),
      role: cleanText(item.role),
      unit: cleanText(item.unit),
      units: Array.isArray(item.units) ? item.units.slice() : [],
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
      'name',
      'email',
      'role',
      'unit',
      { key: 'units', kind: 'array' },
      'activeUnit',
      {
        label: 'hasPassword',
        kind: 'boolean',
        get: function (_item, index) {
          return index === 0 ? beforePassword.hasPassword : afterPassword.hasPassword;
        }
      },
      {
        label: 'mustChangePassword',
        kind: 'boolean',
        get: function (_item, index) {
          return index === 0 ? beforePassword.mustChangePassword : afterPassword.mustChangePassword;
        }
      },
      {
        label: 'sessionVersion',
        kind: 'number',
        get: function (_item, index) {
          return index === 0 ? beforePassword.sessionVersion : afterPassword.sessionVersion;
        }
      },
      {
        label: 'passwordChangedAt',
        get: function (_item, index) {
          return index === 0 ? beforePassword.passwordChangedAt : afterPassword.passwordChangedAt;
        }
      },
      {
        label: 'resetTokenExpiresAt',
        get: function (_item, index) {
          return index === 0 ? beforePassword.resetTokenExpiresAt : afterPassword.resetTokenExpiresAt;
        }
      }
    ].map((definition) => {
      if (typeof definition === 'string') return definition;
      const originalGet = definition.get;
      if (!originalGet) return definition;
      return {
        ...definition,
        get: function (item) {
          return originalGet(item, item === beforeItem ? 0 : 1);
        }
      };
    }));
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
    return existingPassword;
  }

  function routeUserName(value) {
    return decodeURIComponent(String(value || '').trim());
  }

  async function fetchListMap() {
    const siteId = await resolveSiteId();
    const body = await graphRequest('GET', `/sites/${siteId}/lists?$select=id,displayName,webUrl`);
    return new Map((Array.isArray(body && body.value) ? body.value : []).map((entry) => [cleanText(entry.displayName), entry]));
  }

  async function resolveNamedList(name) {
    const listName = cleanText(name);
    if (!state.listMap || !state.listMap.has(listName)) {
      state.listMap = await fetchListMap();
    }
    let list = state.listMap.get(listName);
    if (!list) {
      state.listMap = await fetchListMap();
      list = state.listMap.get(listName);
    }
    if (!list) {
      throw createError(`SharePoint list not found: ${listName}`, 500);
    }
    return list;
  }

  async function fetchListColumnNames(listId) {
    const siteId = await resolveSiteId();
    const body = await graphRequest('GET', `/sites/${siteId}/lists/${listId}/columns?$select=name`);
    return new Set((Array.isArray(body && body.value) ? body.value : []).map((entry) => cleanText(entry && entry.name)).filter(Boolean));
  }

  async function resolveListColumnNames(listId) {
    const cleanListId = cleanText(listId);
    if (!cleanListId) return new Set();
    if (!state.listColumnsMap.has(cleanListId)) {
      state.listColumnsMap.set(cleanListId, await fetchListColumnNames(cleanListId));
    }
    return state.listColumnsMap.get(cleanListId);
  }

  function filterFieldsForExistingColumns(fields, existingNames) {
    const allowed = existingNames instanceof Set ? existingNames : new Set();
    return Object.entries(fields || {}).reduce((result, [key, value]) => {
      if (key === 'Title' || allowed.has(key)) result[key] = value;
      return result;
    }, {});
  }

  function getUsersListName() {
    return getEnv('SYSTEM_USERS_LIST', 'SystemUsers');
  }

  function getAuditListName() {
    return getEnv('UNIT_CONTACT_AUDIT_LIST', 'OpsAudit');
  }

  async function resolveUsersList() {
    return resolveNamedList(getUsersListName());
  }

  async function resolveAuditList() {
    return resolveNamedList(getAuditListName());
  }

  async function listAllUsers() {
    const siteId = await resolveSiteId();
    const list = await resolveUsersList();
    const rows = [];
    let nextUrl = `/sites/${siteId}/lists/${list.id}/items?$expand=fields&$top=200`;
    while (nextUrl) {
      const body = await graphRequest('GET', nextUrl);
      const batch = Array.isArray(body && body.value) ? body.value : [];
      rows.push(...batch.map((entry) => ({
        listItemId: cleanText(entry && entry.id),
        item: mapGraphFieldsToSystemUser(entry && entry.fields ? entry.fields : {})
      })));
      nextUrl = cleanText(body && body['@odata.nextLink']);
    }
    return rows;
  }

  async function getUserEntryByUsername(username) {
    const target = cleanText(username).toLowerCase();
    if (!target) throw createError('Missing username', 400);
    const rows = await listAllUsers();
    return rows.find((entry) => cleanText(entry.item.username).toLowerCase() === target) || null;
  }

  async function getUserEntryByEmail(email) {
    const target = cleanEmail(email);
    if (!target) throw createError('Missing email', 400);
    const rows = await listAllUsers();
    return rows.find((entry) => cleanEmail(entry.item.email) === target) || null;
  }

  async function findDuplicateEmail(email, excludeUsername) {
    const targetEmail = cleanEmail(email);
    const skipUser = cleanText(excludeUsername).toLowerCase();
    if (!targetEmail) return null;
    const rows = await listAllUsers();
    return rows.find((entry) => (
      cleanEmail(entry.item.email) === targetEmail
      && cleanText(entry.item.username).toLowerCase() !== skipUser
    )) || null;
  }

  async function upsertUser(existingEntry, nextItem) {
    const siteId = await resolveSiteId();
    const list = await resolveUsersList();
    const normalized = createSystemUserRecord(nextItem, nextItem.updatedAt || new Date().toISOString());
    const columnNames = await resolveListColumnNames(list.id);
    const graphFields = filterFieldsForExistingColumns(mapSystemUserToGraphFields(normalized), columnNames);
    if (existingEntry) {
      await graphRequest('PATCH', `/sites/${siteId}/lists/${list.id}/items/${existingEntry.listItemId}/fields`, graphFields);
      return { created: false, item: normalized };
    }
    await graphRequest('POST', `/sites/${siteId}/lists/${list.id}/items`, {
      fields: graphFields
    });
    return { created: true, item: normalized };
  }

  async function deleteUserEntry(existingEntry) {
    const siteId = await resolveSiteId();
    const list = await resolveUsersList();
    await graphRequest('DELETE', `/sites/${siteId}/lists/${list.id}/items/${existingEntry.listItemId}`);
  }

  async function createAuditRow(input) {
    const siteId = await resolveSiteId();
    const list = await resolveAuditList();
    await graphRequest('POST', `/sites/${siteId}/lists/${list.id}/items`, {
      fields: {
        Title: cleanText(input.recordId || input.eventType || 'audit'),
        EventType: cleanText(input.eventType),
        ActorEmail: cleanText(input.actorEmail),
        TargetEmail: cleanText(input.targetEmail),
        UnitCode: cleanText(input.unitCode),
        RecordId: cleanText(input.recordId),
        OccurredAt: cleanText(input.occurredAt) || new Date().toISOString(),
        PayloadJson: cleanText(input.payloadJson)
      }
    });
  }

  function filterUsers(items, url) {
    const role = cleanText(url.searchParams.get('role'));
    const unit = cleanText(url.searchParams.get('unit'));
    const query = cleanText(url.searchParams.get('q')).toLowerCase();
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

  async function buildHealth() {
    const siteId = await resolveSiteId();
    const { decoded, mode } = await getDelegatedToken();
    const health = {
      ok: true,
      ready: true,
      contractVersion: CONTRACT_VERSION,
      repository: mode === 'app-only' ? 'sharepoint-app-only' : 'sharepoint-delegated-cli',
      actor: {
        tokenMode: cleanText(mode) || 'delegated-cli',
        appId: cleanText(decoded.appid || decoded.azp),
        upn: cleanText(decoded.upn),
        scopes: cleanText(decoded.scp),
        roles: Array.isArray(decoded.roles) ? decoded.roles.join(',') : ''
      },
      site: { id: siteId }
    };
    try {
      health.usersList = await resolveUsersList();
    } catch (error) {
      health.ok = false;
      health.ready = false;
      health.message = cleanText(error && error.message) || 'System user list is not ready.';
    }
    return health;
  }

  async function buildAuthHealth() {
    const health = await buildHealth();
    return {
      ...health,
      contractVersion: AUTH_CONTRACT_VERSION
    };
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
      const rows = await listAllUsers();
      const items = filterUsers(rows.map((entry) => entry.item), url);
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        items: items.map(sanitizeUserForClient),
        contractVersion: CONTRACT_VERSION
      }), origin);
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
        ok: true,
        item: sanitizeUserForClient(existing.item),
        contractVersion: CONTRACT_VERSION
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
      const existing = await getUserEntryByUsername(incoming.username).catch(() => null);
      const existingAuthState = readStoredPasswordState(existing && existing.item && existing.item.password);
      const payload = {
        ...(existing ? existing.item : {}),
        ...incoming,
        password: preparePasswordForPersist(incoming, {
          existingPassword: cleanText(existing && existing.item && existing.item.password),
          forcePasswordChange: cleanText(incoming.password) ? (envelope.payload && envelope.payload.forcePasswordChange !== false) : existingAuthState.mustChangePassword,
          sessionVersion: existingAuthState.sessionVersion || 1
        })
      };
      validateSystemUserPayload(payload, { requirePassword: !existing });
      const emailDuplicate = await findDuplicateEmail(payload.email, payload.username);
      if (emailDuplicate) {
        throw createError('Another user already uses this email', 409);
      }
      const now = new Date().toISOString();
      const saved = await upsertUser(existing, {
        ...(existing ? existing.item : {}),
        ...payload,
        createdAt: existing ? existing.item.createdAt : (payload.createdAt || now),
        updatedAt: now
      });
      const actor = buildActorAudit(authz);
      await createAuditRow({
        eventType: existing ? 'system-user.updated' : 'system-user.created',
        actorEmail: actor.actorEmail,
        targetEmail: saved.item.email,
        unitCode: '',
        recordId: saved.item.username,
        occurredAt: now,
        payloadJson: JSON.stringify({
          action: USER_ACTIONS.UPSERT,
          actorName: actor.actorName,
          actorUsername: actor.actorUsername,
          snapshot: existing ? null : buildSystemUserSnapshot(saved.item),
          changes: buildSystemUserChanges(existing && existing.item, saved.item)
        })
      });
      await writeJson(res, buildJsonResponse(saved.created ? 201 : 200, {
        ok: true,
        item: sanitizeUserForClient(saved.item),
        contractVersion: CONTRACT_VERSION
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
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, USER_ACTIONS.DELETE);
      const payload = envelope && envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {};
      if (existing.item.role === USER_ROLES.ADMIN) {
        throw createError('Primary admin cannot be deleted', 409);
      }
      const now = new Date().toISOString();
      await deleteUserEntry(existing);
      const actor = buildActorAudit(authz);
      await createAuditRow({
        eventType: 'system-user.deleted',
        actorEmail: actor.actorEmail,
        targetEmail: existing.item.email,
        unitCode: '',
        recordId: existing.item.username,
        occurredAt: now,
        payloadJson: JSON.stringify({
          action: USER_ACTIONS.DELETE,
          actorName: actor.actorName,
          actorUsername: actor.actorUsername,
          deletedState: buildSystemUserSnapshot(existing.item)
        })
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        deletedId: existing.item.username,
        contractVersion: CONTRACT_VERSION
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
      const payload = envelope && envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {};
      const now = new Date().toISOString();
      const reset = createResetToken(existing.item.password, { now });
      const saved = await upsertUser(existing, {
        ...existing.item,
        password: serializePasswordSecret(reset.secret),
        mustChangePassword: true,
        resetRequestedAt: now,
        resetTokenExpiresAt: reset.expiresAt,
        updatedAt: now
      });
      const actor = buildActorAudit(authz);
      await createAuditRow({
        eventType: 'system-user.reset-token-issued',
        actorEmail: actor.actorEmail,
        targetEmail: saved.item.email,
        unitCode: '',
        recordId: saved.item.username,
        occurredAt: now,
        payloadJson: JSON.stringify({
          action: USER_ACTIONS.RESET_PASSWORD,
          actorName: actor.actorName,
          actorUsername: actor.actorUsername,
          changes: buildSystemUserChanges(existing.item, saved.item)
        })
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        item: sanitizeUserForClient(saved.item),
        resetToken: reset.token,
        resetTokenExpiresAt: reset.expiresAt,
        contractVersion: CONTRACT_VERSION
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
      const throttle = getLoginFailureState(payload.username);
      if (throttle.lockedUntil) {
        await createAuditRow({
          eventType: 'auth.login.locked',
          actorEmail: '',
          targetEmail: '',
          unitCode: '',
          recordId: payload.username,
          occurredAt: new Date().toISOString(),
          payloadJson: JSON.stringify({
            action: AUTH_ACTIONS.LOGIN,
            reason: 'locked',
            clientAddress: readClientAddress(req),
            lockedUntil: throttle.lockedUntil
          })
        });
        await writeJson(res, buildJsonResponse(429, {
          ok: false,
          error: 'Too many failed login attempts. Please try again later.',
          lockedUntil: throttle.lockedUntil,
          contractVersion: AUTH_CONTRACT_VERSION
        }), origin);
        return;
      }
      const existing = await getUserEntryByUsername(payload.username).catch(() => null);
      if (!existing) {
        const nextThrottle = registerFailedLogin(payload.username);
        await createAuditRow({
          eventType: 'auth.login.failed',
          actorEmail: '',
          targetEmail: '',
          unitCode: '',
          recordId: payload.username,
          occurredAt: new Date().toISOString(),
          payloadJson: JSON.stringify({
            action: AUTH_ACTIONS.LOGIN,
            reason: 'user-not-found',
            clientAddress: readClientAddress(req),
            failedCount: nextThrottle.failedCount,
            lockedUntil: nextThrottle.lockedUntil
          })
        });
        await writeJson(res, buildJsonResponse(nextThrottle.isLocked ? 429 : 401, {
          ok: false,
          error: nextThrottle.isLocked ? 'Too many failed login attempts. Please try again later.' : 'Invalid username or password',
          lockedUntil: nextThrottle.lockedUntil,
          contractVersion: AUTH_CONTRACT_VERSION
        }), origin);
        return;
      }
      const verification = verifyPassword(payload.password, existing.item.password);
      if (!verification.ok) {
        const nextThrottle = registerFailedLogin(existing.item.username);
        await createAuditRow({
          eventType: 'auth.login.failed',
          actorEmail: '',
          targetEmail: existing.item.email,
          unitCode: '',
          recordId: existing.item.username,
          occurredAt: new Date().toISOString(),
          payloadJson: JSON.stringify({
            action: AUTH_ACTIONS.LOGIN,
            reason: 'invalid-password',
            clientAddress: readClientAddress(req),
            failedCount: nextThrottle.failedCount,
            lockedUntil: nextThrottle.lockedUntil
          })
        });
        await writeJson(res, buildJsonResponse(nextThrottle.isLocked ? 429 : 401, {
          ok: false,
          error: nextThrottle.isLocked ? 'Too many failed login attempts. Please try again later.' : 'Invalid username or password',
          lockedUntil: nextThrottle.lockedUntil,
          contractVersion: AUTH_CONTRACT_VERSION
        }), origin);
        return;
      }
      let resolvedEntry = existing;
      if (verification.needsUpgrade) {
        const upgraded = upgradePasswordSecret(payload.password, verification.secret);
        resolvedEntry = await upsertUser(existing, {
          ...existing.item,
          password: serializePasswordSecret(upgraded),
          passwordChangedAt: upgraded.passwordChangedAt,
          mustChangePassword: upgraded.mustChangePassword,
          resetTokenExpiresAt: '',
          resetRequestedAt: '',
          sessionVersion: upgraded.sessionVersion,
          updatedAt: new Date().toISOString()
        });
      }
      clearFailedLogin(resolvedEntry.item.username);
      await createAuditRow({
        eventType: 'auth.login.success',
        actorEmail: resolvedEntry.item.email,
        targetEmail: resolvedEntry.item.email,
        unitCode: '',
        recordId: resolvedEntry.item.username,
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
        ...existing.item,
        password: serializePasswordSecret(nextSecret),
        sessionVersion: nextSecret.sessionVersion,
        updatedAt: now
      });
      clearFailedLogin(saved.item.username);
      await createAuditRow({
        eventType: 'auth.logout',
        actorEmail: saved.item.email,
        targetEmail: saved.item.email,
        unitCode: '',
        recordId: saved.item.username,
        occurredAt: now,
        payloadJson: JSON.stringify({
          action: AUTH_ACTIONS.LOGOUT,
          previousSessionVersion: Number(authz.sessionPayload && authz.sessionPayload.sessionVersion || 1),
          nextSessionVersion: nextSecret.sessionVersion,
          changes: buildSystemUserChanges(existing.item, saved.item)
        })
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        username: saved.item.username,
        loggedOut: true,
        contractVersion: AUTH_CONTRACT_VERSION
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
      const existing = await getUserEntryByEmail(payload.email);
      if (!existing) throw createError('System user not found', 404);
      if (cleanText(existing.item.username).toLowerCase() !== cleanText(payload.username).toLowerCase()) {
        throw createError('System user not found', 404);
      }
      const now = new Date().toISOString();
      const reset = createResetToken(existing.item.password, { now });
      const saved = await upsertUser(existing, {
        ...existing.item,
        password: serializePasswordSecret(reset.secret),
        mustChangePassword: true,
        resetRequestedAt: now,
        resetTokenExpiresAt: reset.expiresAt,
        updatedAt: now
      });
      await createAuditRow({
        eventType: 'auth.reset-token-issued',
        actorEmail: cleanText(payload.actorEmail || payload.email),
        targetEmail: saved.item.email,
        unitCode: '',
        recordId: saved.item.username,
        occurredAt: now,
        payloadJson: JSON.stringify({
          action: AUTH_ACTIONS.REQUEST_RESET,
          actorName: cleanText(payload.actorName),
          changes: buildSystemUserChanges(existing.item, saved.item)
        })
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        item: sanitizeUserForClient(saved.item),
        resetToken: reset.token,
        resetTokenExpiresAt: reset.expiresAt,
        contractVersion: AUTH_CONTRACT_VERSION
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
        ...existing.item,
        password: serializePasswordSecret(nextSecret),
        mustChangePassword: false,
        passwordChangedAt: nextSecret.passwordChangedAt,
        resetRequestedAt: '',
        resetTokenExpiresAt: '',
        sessionVersion: nextSecret.sessionVersion,
        updatedAt: now
      });
      await createAuditRow({
        eventType: 'auth.reset-password.completed',
        actorEmail: saved.item.email,
        targetEmail: saved.item.email,
        unitCode: '',
        recordId: saved.item.username,
        occurredAt: now,
        payloadJson: JSON.stringify({
          action: AUTH_ACTIONS.REDEEM_RESET,
          changes: buildSystemUserChanges(existing.item, saved.item)
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
        ...existing.item,
        password: serializePasswordSecret(nextSecret),
        mustChangePassword: false,
        passwordChangedAt: nextSecret.passwordChangedAt,
        resetRequestedAt: '',
        resetTokenExpiresAt: '',
        sessionVersion: nextSecret.sessionVersion,
        updatedAt: now
      });
      await createAuditRow({
        eventType: 'auth.password-changed',
        actorEmail: saved.item.email,
        targetEmail: saved.item.email,
        unitCode: '',
        recordId: saved.item.username,
        occurredAt: now,
        payloadJson: JSON.stringify({
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

  return {
    tryHandle
  };
}

module.exports = {
  createSystemUserRouter
};
