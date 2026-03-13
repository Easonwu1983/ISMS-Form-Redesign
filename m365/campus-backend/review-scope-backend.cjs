const {
  ACTIONS,
  CONTRACT_VERSION,
  buildErrorResponse,
  buildJsonResponse,
  cleanText,
  createError,
  createReviewScopeRecord,
  mapGraphFieldsToReviewScope,
  mapReviewScopeToGraphFields,
  normalizeReplacePayload,
  validateActionEnvelope,
  validateReplacePayload
} = require('../azure-function/review-scope-api/src/shared/contract');

function createReviewScopeRouter(deps) {
  const {
    parseJsonBody,
    writeJson,
    graphRequest,
    resolveSiteId,
    getDelegatedToken
  } = deps;

  const state = {
    listMap: null,
    listColumnsMap: new Map()
  };

  function getEnv(name, fallback) {
    const value = cleanText(process.env[name]);
    return value || fallback || '';
  }

  function getReviewScopesListName() {
    return getEnv('REVIEW_SCOPES_LIST', 'UnitReviewScopes');
  }

  function getAuditListName() {
    return getEnv('UNIT_CONTACT_AUDIT_LIST', 'OpsAudit');
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

  async function resolveReviewScopesList() {
    return resolveNamedList(getReviewScopesListName());
  }

  async function resolveAuditList() {
    return resolveNamedList(getAuditListName());
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

  async function listAllEntries() {
    const siteId = await resolveSiteId();
    const list = await resolveReviewScopesList();
    const rows = [];
    let nextUrl = `/sites/${siteId}/lists/${list.id}/items?$expand=fields&$top=200`;
    while (nextUrl) {
      const body = await graphRequest('GET', nextUrl);
      const batch = Array.isArray(body && body.value) ? body.value : [];
      rows.push(...batch.map((entry) => ({
        listItemId: cleanText(entry && entry.id),
        item: mapGraphFieldsToReviewScope(entry && entry.fields ? entry.fields : {})
      })));
      nextUrl = cleanText(body && body['@odata.nextLink']);
    }
    return rows;
  }

  async function listEntriesByUsername(username) {
    const target = cleanText(username).toLowerCase();
    const rows = await listAllEntries();
    return rows.filter((entry) => cleanText(entry.item.username).toLowerCase() === target);
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

  function filterItems(items, url) {
    const username = cleanText(url.searchParams.get('username')).toLowerCase();
    const unit = cleanText(url.searchParams.get('unit'));
    return items
      .filter((entry) => {
        if (username && cleanText(entry.username).toLowerCase() !== username) return false;
        if (unit && cleanText(entry.unit) !== unit) return false;
        return true;
      })
      .sort((left, right) => {
        const userCompare = cleanText(left.username).localeCompare(cleanText(right.username), 'zh-Hant');
        if (userCompare !== 0) return userCompare;
        return cleanText(left.unit).localeCompare(cleanText(right.unit), 'zh-Hant');
      });
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
      site: {
        id: siteId
      }
    };
    try {
      health.list = await resolveReviewScopesList();
    } catch (error) {
      health.ok = false;
      health.ready = false;
      health.message = cleanText(error && error.message) || 'Review scope list is not ready.';
    }
    return health;
  }

  async function handleHealth(_req, res, origin) {
    try {
      await writeJson(res, buildJsonResponse(200, await buildHealth()), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to read review scope backend health.', 500), origin);
    }
  }

  async function handleList(_req, res, origin, url) {
    try {
      const rows = await listAllEntries();
      const items = filterItems(rows.map((entry) => entry.item), url);
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        items,
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to list review scopes.', 500), origin);
    }
  }

  async function deleteEntry(listId, listItemId) {
    const siteId = await resolveSiteId();
    await graphRequest('DELETE', `/sites/${siteId}/lists/${listId}/items/${listItemId}`);
  }

  async function createEntry(listId, record) {
    const siteId = await resolveSiteId();
    const columnNames = await resolveListColumnNames(listId);
    await graphRequest('POST', `/sites/${siteId}/lists/${listId}/items`, {
      fields: filterFieldsForExistingColumns(mapReviewScopeToGraphFields(record), columnNames)
    });
  }

  async function handleReplace(req, res, origin) {
    try {
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ACTIONS.REPLACE);
      const payload = validateReplacePayload(envelope.payload);
      const normalized = normalizeReplacePayload(payload);
      const existingEntries = await listEntriesByUsername(normalized.username);
      const list = await resolveReviewScopesList();
      const existingUnits = new Set(existingEntries.map((entry) => cleanText(entry.item.unit)));
      const nextUnits = new Set(normalized.units);
      const now = new Date().toISOString();

      for (const entry of existingEntries) {
        if (!nextUnits.has(cleanText(entry.item.unit))) {
          await deleteEntry(list.id, entry.listItemId);
        }
      }

      for (const unit of normalized.units) {
        if (!existingUnits.has(unit)) {
          await createEntry(list.id, createReviewScopeRecord(normalized, unit, now));
        }
      }

      await createAuditRow({
        eventType: ACTIONS.REPLACE,
        actorEmail: normalized.actorEmail,
        targetEmail: normalized.username,
        unitCode: normalized.units.join(' | '),
        recordId: normalized.username,
        occurredAt: now,
        payloadJson: JSON.stringify({
          username: normalized.username,
          units: normalized.units,
          actorName: normalized.actorName
        })
      });

      const nextRows = await listEntriesByUsername(normalized.username);
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        username: normalized.username,
        items: nextRows.map((entry) => entry.item),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to replace review scopes.', 500), origin);
    }
  }

  function tryHandle(req, res, origin, url) {
    if (url.pathname === '/api/review-scopes/health' && req.method === 'GET') {
      return handleHealth(req, res, origin).then(() => true);
    }
    if (url.pathname === '/api/review-scopes' && req.method === 'GET') {
      return handleList(req, res, origin, url).then(() => true);
    }
    if (url.pathname === '/api/review-scopes/replace' && req.method === 'POST') {
      return handleReplace(req, res, origin).then(() => true);
    }
    return Promise.resolve(false);
  }

  return {
    tryHandle
  };
}

module.exports = {
  createReviewScopeRouter
};
