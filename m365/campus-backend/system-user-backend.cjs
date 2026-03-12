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
  validateActionEnvelope,
  validateSystemUserPayload
} = require('../azure-function/system-user-api/src/shared/contract');

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

  async function findDuplicateEmail(email, excludeUsername) {
    const targetEmail = cleanText(email).toLowerCase();
    const skipUser = cleanText(excludeUsername).toLowerCase();
    if (!targetEmail) return null;
    const rows = await listAllUsers();
    return rows.find((entry) => (
      cleanText(entry.item.email).toLowerCase() === targetEmail
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

  async function handleHealth(_req, res, origin) {
    try {
      await writeJson(res, buildJsonResponse(200, await buildHealth()), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to read system-user backend health.', 500), origin);
    }
  }

  async function handleList(_req, res, origin, url) {
    try {
      const rows = await listAllUsers();
      const items = filterUsers(rows.map((entry) => entry.item), url);
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        items: items.map(mapSystemUserForClient),
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
        item: mapSystemUserForClient(existing.item),
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
      const payload = normalizeSystemUserPayload(envelope.payload);
      validateSystemUserPayload(payload, { requirePassword: true });
      const existing = await getUserEntryByUsername(payload.username).catch(() => null);
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
        item: mapSystemUserForClient(saved.item),
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
      const nextPassword = cleanText(payload.password) || generatePassword(8);
      const now = new Date().toISOString();
      const saved = await upsertUser(existing, {
        ...existing.item,
        password: nextPassword,
        updatedAt: now
      });
      await createAuditRow({
        eventType: 'system-user.password-reset',
        actorEmail: cleanText(payload.actorEmail),
        targetEmail: saved.item.email,
        unitCode: '',
        recordId: saved.item.username,
        occurredAt: now,
        payloadJson: JSON.stringify({ action: USER_ACTIONS.RESET_PASSWORD, actorName: cleanText(payload.actorName) })
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        item: mapSystemUserForClient(saved.item),
        password: nextPassword,
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to reset system user password.', 500), origin);
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
    return Promise.resolve(false);
  }

  return {
    tryHandle
  };
}

module.exports = {
  createSystemUserRouter
};


