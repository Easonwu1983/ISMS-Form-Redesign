const {
  ACTIONS,
  CONTRACT_VERSION,
  STATUSES,
  buildErrorResponse,
  buildJsonResponse,
  cleanText,
  createChecklistRecord,
  createError,
  mapChecklistForClient,
  mapChecklistToGraphFields,
  mapGraphFieldsToChecklist,
  normalizeChecklistPayload,
  parseChecklistId,
  validateActionEnvelope,
  validateChecklistPayload
} = require('../azure-function/checklist-api/src/shared/contract');

function createChecklistRouter(deps) {
  const {
    parseJsonBody,
    writeJson,
    graphRequest,
    resolveSiteId,
    getDelegatedToken,
    requestAuthz
  } = deps;

  const state = {
    listMap: null
  };

  function getEnv(name, fallback) {
    const value = cleanText(process.env[name]);
    return value || fallback || '';
  }

  function routeChecklistId(value) {
    return decodeURIComponent(String(value || '').trim());
  }

  function actorLabel(payload, fallback) {
    return cleanText(payload && (payload.actorName || payload.actorUsername || payload.fillerName || payload.fillerUsername)) || fallback || 'system';
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

  function getChecklistsListName() {
    return getEnv('CHECKLISTS_LIST', 'Checklists');
  }

  function getAuditListName() {
    return getEnv('UNIT_CONTACT_AUDIT_LIST', 'OpsAudit');
  }

  async function resolveChecklistsList() {
    return resolveNamedList(getChecklistsListName());
  }

  async function resolveAuditList() {
    return resolveNamedList(getAuditListName());
  }

  async function listAllEntries() {
    const siteId = await resolveSiteId();
    const list = await resolveChecklistsList();
    const rows = [];
    let nextUrl = `/sites/${siteId}/lists/${list.id}/items?$expand=fields&$top=200`;
    while (nextUrl) {
      const body = await graphRequest('GET', nextUrl);
      const batch = Array.isArray(body && body.value) ? body.value : [];
      rows.push(...batch.map((entry) => ({
        listItemId: cleanText(entry && entry.id),
        item: mapGraphFieldsToChecklist(entry && entry.fields ? entry.fields : {})
      })));
      nextUrl = cleanText(body && body['@odata.nextLink']);
    }
    return rows;
  }

  async function getEntryByChecklistId(checklistId) {
    const target = cleanText(checklistId);
    if (!target) throw createError('\u7f3a\u5c11\u6aa2\u6838\u8868\u7de8\u865f\u3002', 400);
    const rows = await listAllEntries();
    return rows.find((entry) => entry.item.id === target) || null;
  }

  async function findDuplicateChecklist(unit, auditYear, excludeId) {
    const targetUnit = cleanText(unit);
    const targetYear = cleanText(auditYear);
    const skipId = cleanText(excludeId);
    if (!targetUnit || !targetYear) return null;
    const rows = await listAllEntries();
    return rows.find((entry) => (
      entry.item.unit === targetUnit
      && entry.item.auditYear === targetYear
      && entry.item.id !== skipId
    )) || null;
  }

  async function upsertChecklist(existingEntry, nextItem) {
    const siteId = await resolveSiteId();
    const list = await resolveChecklistsList();
    const normalized = createChecklistRecord(nextItem, nextItem.status, nextItem.updatedAt || new Date().toISOString());
    if (existingEntry) {
      await graphRequest('PATCH', `/sites/${siteId}/lists/${list.id}/items/${existingEntry.listItemId}/fields`, mapChecklistToGraphFields(normalized));
      return { created: false, item: normalized };
    }
    await graphRequest('POST', `/sites/${siteId}/lists/${list.id}/items`, {
      fields: mapChecklistToGraphFields(normalized)
    });
    return { created: true, item: normalized };
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
    const status = cleanText(url.searchParams.get('status'));
    const unit = cleanText(url.searchParams.get('unit'));
    const auditYear = cleanText(url.searchParams.get('auditYear'));
    const fillerUsername = cleanText(url.searchParams.get('fillerUsername'));
    const query = cleanText(url.searchParams.get('q')).toLowerCase();
    return items.filter((entry) => {
      if (status && entry.status !== status) return false;
      if (unit && entry.unit !== unit) return false;
      if (auditYear && entry.auditYear !== auditYear) return false;
      if (fillerUsername && entry.fillerUsername !== fillerUsername) return false;
      if (query) {
        const haystack = [
          entry.id,
          entry.unit,
          entry.fillerName,
          entry.fillerUsername,
          entry.auditYear
        ].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    }).sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
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
      health.list = await resolveChecklistsList();
    } catch (error) {
      health.ok = false;
      health.ready = false;
      health.message = cleanText(error && error.message) || 'Checklists list is not ready.';
    }
    return health;
  }

  function assertEditable(existing) {
    if (existing && existing.item.status === STATUSES.SUBMITTED) {
      throw createError('\u6aa2\u6838\u8868\u5df2\u6b63\u5f0f\u9001\u51fa\uff0c\u7121\u6cd5\u518d\u4fee\u6539\u3002', 409);
    }
  }

  async function handleHealth(_req, res, origin) {
    try {
      await writeJson(res, buildJsonResponse(200, await buildHealth()), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to read checklist backend health.', 500), origin);
    }
  }

  async function handleList(req, res, origin, url) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const rows = await listAllEntries();
      const items = filterItems(rows.map((entry) => entry.item), url)
        .filter((entry) => requestAuthz.canAccessChecklist(authz, entry));
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        items: items.map(mapChecklistForClient),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to list checklists.', 500), origin);
    }
  }

  async function handleDetail(req, res, origin, checklistId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getEntryByChecklistId(checklistId);
      if (!existing) {
        throw createError('\u627e\u4e0d\u5230\u6307\u5b9a\u7684\u6aa2\u6838\u8868\u3002', 404);
      }
      if (!requestAuthz.canAccessChecklist(authz, existing.item)) {
        throw requestAuthz.createHttpError('You do not have access to this checklist', 403);
      }
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        item: mapChecklistForClient(existing.item),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to read checklist detail.', 500), origin);
    }
  }

  async function writeChecklist(req, res, origin, checklistId, action, status) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getEntryByChecklistId(checklistId);
      assertEditable(existing);
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, action);
      const payload = normalizeChecklistPayload(envelope.payload);
      if (cleanText(checklistId) !== cleanText(payload.id)) {
        throw createError('\u8def\u7531\u7de8\u865f\u8207 payload \u7de8\u865f\u4e0d\u4e00\u81f4\u3002', 400);
      }
      if (existing && !requestAuthz.canEditChecklist(authz, existing.item)) {
        throw requestAuthz.createHttpError('You do not have permission to edit this checklist', 403);
      }
      if (!existing) {
        const intendedUnit = cleanText(payload.unit);
        if (!(requestAuthz.isAdmin(authz) || requestAuthz.hasUnitAccess(authz, intendedUnit) || requestAuthz.matchesUsername(authz, payload.fillerUsername))) {
          throw requestAuthz.createHttpError('You do not have permission to create a checklist for this unit', 403);
        }
      }
      validateChecklistPayload(payload, {
        requireSubmittedState: status === STATUSES.SUBMITTED
      });
      const duplicate = await findDuplicateChecklist(payload.unit, payload.auditYear, payload.id);
      if (duplicate) {
        throw createError('\u672c\u5e74\u5ea6\u8a72\u55ae\u4f4d\u5df2\u5b58\u5728\u6aa2\u6838\u8868\uff0c\u8acb\u6539\u70ba\u7e8c\u586b\u6216\u67e5\u770b\u65e2\u6709\u7d00\u9304\u3002', 409);
      }
      const now = new Date().toISOString();
      const actorDisplay = actorLabel(payload, payload.fillerName);
      const nextItem = createChecklistRecord({
        ...payload,
        createdAt: existing ? existing.item.createdAt : payload.createdAt
      }, status, now);
      const stored = await upsertChecklist(existing, nextItem);
      const parsedId = parseChecklistId(stored.item.id);
      const actor = requestAuthz.buildActorDetails(authz);
      await createAuditRow({
        eventType: status === STATUSES.SUBMITTED ? 'checklist.submitted' : 'checklist.draft_saved',
        actorEmail: actor.actorEmail,
        unitCode: cleanText(stored.item.unitCode) || cleanText(parsedId && parsedId.unitCode),
        recordId: stored.item.id,
        occurredAt: now,
        payloadJson: JSON.stringify({
          actorName: actor.actorName,
          actorUsername: actor.actorUsername,
          previousStatus: cleanText(existing && existing.item && existing.item.status),
          status: stored.item.status,
          unit: stored.item.unit,
          auditYear: stored.item.auditYear,
          actorLabel: actorDisplay
        })
      });
      await writeJson(res, buildJsonResponse(stored.created ? 201 : 200, {
        ok: true,
        item: mapChecklistForClient(stored.item),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      const fallbackMessage = status === STATUSES.SUBMITTED
        ? 'Failed to submit checklist.'
        : 'Failed to save checklist draft.';
      await writeJson(res, buildErrorResponse(error, fallbackMessage), origin);
    }
  }

  async function tryHandle(req, res, origin, url) {
    const pathname = cleanText(url && url.pathname);
    if (pathname === '/api/checklists/health') {
      await handleHealth(req, res, origin);
      return true;
    }
    if (pathname === '/api/checklists' && req.method === 'GET') {
      await handleList(req, res, origin, url);
      return true;
    }

    const detailMatch = pathname.match(/^\/api\/checklists\/([^/]+)$/);
    if (detailMatch && req.method === 'GET') {
      await handleDetail(req, res, origin, routeChecklistId(detailMatch[1]));
      return true;
    }

    const saveDraftMatch = pathname.match(/^\/api\/checklists\/([^/]+)\/save-draft$/);
    if (saveDraftMatch && req.method === 'POST') {
      await writeChecklist(req, res, origin, routeChecklistId(saveDraftMatch[1]), ACTIONS.SAVE_DRAFT, STATUSES.DRAFT);
      return true;
    }

    const submitMatch = pathname.match(/^\/api\/checklists\/([^/]+)\/submit$/);
    if (submitMatch && req.method === 'POST') {
      await writeChecklist(req, res, origin, routeChecklistId(submitMatch[1]), ACTIONS.SUBMIT, STATUSES.SUBMITTED);
      return true;
    }

    return false;
  }

  return {
    tryHandle
  };
}

module.exports = {
  createChecklistRouter
};
