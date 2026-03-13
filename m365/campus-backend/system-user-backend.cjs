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
  parsePasswordSecret,
  serializePasswordSecret,
  verifyPassword,
  verifyResetToken,
  changePassword,
  upgradePasswordSecret,
  verifySessionToken
} = require('./auth-security.cjs');

function createSystemUserRouter(deps) {
  const {
    parseJsonBody,
    writeJson,
    graphRequest,
    resolveSiteId,
    getDelegatedToken
  } = deps;

  const state = {
    listMap: null
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

  function sanitizeUserForClient(entry) {
    return mapSystemUserForClient(entry);
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
    if (existingEntry) {
      await graphRequest('PATCH', `/sites/${siteId}/lists/${list.id}/items/${existingEntry.listItemId}/fields`, mapSystemUserToGraphFields(normalized));
      return { created: false, item: normalized };
    }
    await graphRequest('POST', `/sites/${siteId}/lists/${list.id}/items`, {
      fields: mapSystemUserToGraphFields(normalized)
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
    const { decoded } = await getDelegatedToken();
    const health = {
      ok: true,
      ready: true,
      contractVersion: CONTRACT_VERSION,
      repository: 'sharepoint-delegated-cli',
      actor: {
        appId: cleanText(decoded.appid),
        upn: cleanText(decoded.upn),
        scopes: cleanText(decoded.scp)
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

  async function handleList(_req, res, origin, url) {
    try {
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

  async function handleDetail(_req, res, origin, username) {
    try {
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
      await createAuditRow({
        eventType: existing ? 'system-user.updated' : 'system-user.created',
        actorEmail: saved.item.email,
        targetEmail: saved.item.email,
        unitCode: '',
        recordId: saved.item.username,
        occurredAt: now,
        payloadJson: JSON.stringify({ action: USER_ACTIONS.UPSERT, role: saved.item.role, units: saved.item.units })
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
      await createAuditRow({
        eventType: 'system-user.deleted',
        actorEmail: cleanText(payload.actorEmail),
        targetEmail: existing.item.email,
        unitCode: '',
        recordId: existing.item.username,
        occurredAt: now,
        payloadJson: JSON.stringify({ action: USER_ACTIONS.DELETE, actorName: cleanText(payload.actorName) })
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
      await createAuditRow({
        eventType: 'system-user.reset-token-issued',
        actorEmail: cleanText(payload.actorEmail || payload.email),
        targetEmail: saved.item.email,
        unitCode: '',
        recordId: saved.item.username,
        occurredAt: now,
        payloadJson: JSON.stringify({ action: USER_ACTIONS.RESET_PASSWORD, actorName: cleanText(payload.actorName) })
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
      const existing = await getUserEntryByUsername(payload.username).catch(() => null);
      if (!existing) {
        await writeJson(res, buildJsonResponse(401, {
          ok: false,
          error: 'Invalid username or password',
          contractVersion: AUTH_CONTRACT_VERSION
        }), origin);
        return;
      }
      const verification = verifyPassword(payload.password, existing.item.password);
      if (!verification.ok) {
        await writeJson(res, buildJsonResponse(401, {
          ok: false,
          error: 'Invalid username or password',
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
      await createAuditRow({
        eventType: 'auth.login.success',
        actorEmail: resolvedEntry.item.email,
        targetEmail: resolvedEntry.item.email,
        unitCode: '',
        recordId: resolvedEntry.item.username,
        occurredAt: new Date().toISOString(),
        payloadJson: JSON.stringify({ action: AUTH_ACTIONS.LOGIN })
      });
      await writeJson(res, buildJsonResponse(200, buildLoginPayload(resolvedEntry.item)), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to login.', 500), origin);
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
        payloadJson: JSON.stringify({ action: AUTH_ACTIONS.REQUEST_RESET, actorName: cleanText(payload.actorName) })
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
        payloadJson: JSON.stringify({ action: AUTH_ACTIONS.REDEEM_RESET })
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
        payloadJson: JSON.stringify({ action: AUTH_ACTIONS.CHANGE_PASSWORD })
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
