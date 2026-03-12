const {
  CONTRACT_VERSION,
  FORM_ACTIONS,
  ROSTER_ACTIONS,
  FORM_STATUSES,
  buildErrorResponse,
  buildJsonResponse,
  cleanText,
  createError,
  createTrainingFormRecord,
  createTrainingRosterRecord,
  mapGraphFieldsToTrainingForm,
  mapGraphFieldsToTrainingRoster,
  mapTrainingFormForClient,
  mapTrainingFormToGraphFields,
  mapTrainingRosterForClient,
  mapTrainingRosterToGraphFields,
  normalizeTrainingFormPayload,
  normalizeTrainingRosterPayload,
  validateActionEnvelope,
  validateTrainingFormPayload,
  validateTrainingRosterPayload
} = require('../azure-function/training-api/src/shared/contract');

function createTrainingRouter(deps) {
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

  function routeId(value) {
    return decodeURIComponent(String(value || '').trim());
  }

  function actorLabel(payload, fallback) {
    return cleanText(payload && (payload.actorName || payload.actorUsername || payload.fillerName || payload.createdBy || payload.createdByUsername)) || fallback || 'system';
  }

  function appendHistory(history, action, user, time) {
    return (Array.isArray(history) ? history : []).concat([{
      time: cleanText(time) || new Date().toISOString(),
      action: cleanText(action),
      user: cleanText(user) || 'system'
    }]);
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

  function getTrainingFormsListName() {
    return getEnv('TRAINING_FORMS_LIST', 'TrainingForms');
  }

  function getTrainingRostersListName() {
    return getEnv('TRAINING_ROSTERS_LIST', 'TrainingRosters');
  }

  function getAuditListName() {
    return getEnv('UNIT_CONTACT_AUDIT_LIST', 'OpsAudit');
  }

  async function resolveTrainingFormsList() {
    return resolveNamedList(getTrainingFormsListName());
  }

  async function resolveTrainingRostersList() {
    return resolveNamedList(getTrainingRostersListName());
  }

  async function resolveAuditList() {
    return resolveNamedList(getAuditListName());
  }

  async function listAllForms() {
    const siteId = await resolveSiteId();
    const list = await resolveTrainingFormsList();
    const rows = [];
    let nextUrl = `/sites/${siteId}/lists/${list.id}/items?$expand=fields&$top=200`;
    while (nextUrl) {
      const body = await graphRequest('GET', nextUrl);
      const batch = Array.isArray(body && body.value) ? body.value : [];
      rows.push(...batch.map((entry) => ({
        listItemId: cleanText(entry && entry.id),
        item: mapGraphFieldsToTrainingForm(entry && entry.fields ? entry.fields : {})
      })));
      nextUrl = cleanText(body && body['@odata.nextLink']);
    }
    return rows;
  }

  async function listAllRosters() {
    const siteId = await resolveSiteId();
    const list = await resolveTrainingRostersList();
    const rows = [];
    let nextUrl = `/sites/${siteId}/lists/${list.id}/items?$expand=fields&$top=200`;
    while (nextUrl) {
      const body = await graphRequest('GET', nextUrl);
      const batch = Array.isArray(body && body.value) ? body.value : [];
      rows.push(...batch.map((entry) => ({
        listItemId: cleanText(entry && entry.id),
        item: mapGraphFieldsToTrainingRoster(entry && entry.fields ? entry.fields : {})
      })));
      nextUrl = cleanText(body && body['@odata.nextLink']);
    }
    return rows;
  }

  async function getFormEntryById(formId) {
    const target = cleanText(formId);
    if (!target) throw createError('缺少教育訓練編號。', 400);
    const rows = await listAllForms();
    return rows.find((entry) => entry.item.id === target) || null;
  }

  async function getRosterEntryById(rosterId) {
    const target = cleanText(rosterId);
    if (!target) throw createError('缺少名單編號。', 400);
    const rows = await listAllRosters();
    return rows.find((entry) => entry.item.id === target) || null;
  }

  async function findDuplicateForm(unit, trainingYear, excludeId) {
    const targetUnit = cleanText(unit);
    const targetYear = cleanText(trainingYear);
    const skipId = cleanText(excludeId);
    if (!targetUnit || !targetYear) return null;
    const rows = await listAllForms();
    return rows.find((entry) => (
      entry.item.unit === targetUnit
      && entry.item.trainingYear === targetYear
      && entry.item.id !== skipId
    )) || null;
  }

  async function findDuplicateRoster(unit, name, excludeId) {
    const targetUnit = cleanText(unit);
    const targetName = cleanText(name).toLowerCase();
    const skipId = cleanText(excludeId);
    if (!targetUnit || !targetName) return null;
    const rows = await listAllRosters();
    return rows.find((entry) => (
      entry.item.unit === targetUnit
      && cleanText(entry.item.name).toLowerCase() === targetName
      && entry.item.id !== skipId
    )) || null;
  }

  async function upsertForm(existingEntry, nextItem) {
    const siteId = await resolveSiteId();
    const list = await resolveTrainingFormsList();
    const normalized = createTrainingFormRecord(nextItem, nextItem.status, nextItem.updatedAt || new Date().toISOString());
    if (existingEntry) {
      await graphRequest('PATCH', `/sites/${siteId}/lists/${list.id}/items/${existingEntry.listItemId}/fields`, mapTrainingFormToGraphFields(normalized));
      return { created: false, item: normalized };
    }
    await graphRequest('POST', `/sites/${siteId}/lists/${list.id}/items`, {
      fields: mapTrainingFormToGraphFields(normalized)
    });
    return { created: true, item: normalized };
  }

  async function upsertRoster(existingEntry, nextItem) {
    const siteId = await resolveSiteId();
    const list = await resolveTrainingRostersList();
    const normalized = createTrainingRosterRecord(nextItem, nextItem.updatedAt || new Date().toISOString());
    if (existingEntry) {
      await graphRequest('PATCH', `/sites/${siteId}/lists/${list.id}/items/${existingEntry.listItemId}/fields`, mapTrainingRosterToGraphFields(normalized));
      return { created: false, item: normalized };
    }
    await graphRequest('POST', `/sites/${siteId}/lists/${list.id}/items`, {
      fields: mapTrainingRosterToGraphFields(normalized)
    });
    return { created: true, item: normalized };
  }

  async function deleteRosterEntry(existingEntry) {
    const siteId = await resolveSiteId();
    const list = await resolveTrainingRostersList();
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

  function filterForms(items, url) {
    const status = cleanText(url.searchParams.get('status'));
    const unit = cleanText(url.searchParams.get('unit'));
    const statsUnit = cleanText(url.searchParams.get('statsUnit'));
    const trainingYear = cleanText(url.searchParams.get('trainingYear'));
    const fillerUsername = cleanText(url.searchParams.get('fillerUsername'));
    const query = cleanText(url.searchParams.get('q')).toLowerCase();
    return items.filter((entry) => {
      if (status && entry.status !== status) return false;
      if (unit && entry.unit !== unit) return false;
      if (statsUnit && entry.statsUnit !== statsUnit) return false;
      if (trainingYear && entry.trainingYear !== trainingYear) return false;
      if (fillerUsername && entry.fillerUsername !== fillerUsername) return false;
      if (query) {
        const haystack = [
          entry.id,
          entry.unit,
          entry.statsUnit,
          entry.fillerName,
          entry.fillerUsername,
          entry.trainingYear
        ].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    }).sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
  }

  function filterRosters(items, url) {
    const unit = cleanText(url.searchParams.get('unit'));
    const statsUnit = cleanText(url.searchParams.get('statsUnit'));
    const source = cleanText(url.searchParams.get('source'));
    const query = cleanText(url.searchParams.get('q')).toLowerCase();
    return items.filter((entry) => {
      if (unit && entry.unit !== unit) return false;
      if (statsUnit && entry.statsUnit !== statsUnit) return false;
      if (source && entry.source !== source) return false;
      if (query) {
        const haystack = [
          entry.id,
          entry.unit,
          entry.statsUnit,
          entry.name,
          entry.unitName,
          entry.identity,
          entry.jobTitle
        ].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    }).sort((left, right) => {
      if (left.unit === right.unit) return String(left.name || '').localeCompare(String(right.name || ''));
      return String(left.unit || '').localeCompare(String(right.unit || ''));
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
      health.formsList = await resolveTrainingFormsList();
      health.rostersList = await resolveTrainingRostersList();
    } catch (error) {
      health.ok = false;
      health.ready = false;
      health.message = cleanText(error && error.message) || 'Training lists are not ready.';
    }
    return health;
  }

  function assertEditable(existing) {
    if (existing && existing.item.status === FORM_STATUSES.SUBMITTED) {
      throw createError('教育訓練填報單已正式送出，無法再修改。', 409);
    }
  }

  function assertCanFinalize(existing) {
    if (!existing) throw createError('找不到指定的教育訓練填報單。', 404);
    if (existing.item.status !== FORM_STATUSES.PENDING_SIGNOFF) {
      throw createError('只有待簽核的填報單可以完成整體送件。', 409);
    }
  }

  function assertCanReturn(existing) {
    if (!existing) throw createError('找不到指定的教育訓練填報單。', 404);
    if (existing.item.status !== FORM_STATUSES.SUBMITTED) {
      throw createError('只有已完成填報的資料可以退回更正。', 409);
    }
  }

  function assertCanUndo(existing) {
    if (!existing) throw createError('找不到指定的教育訓練填報單。', 404);
    if (existing.item.status !== FORM_STATUSES.PENDING_SIGNOFF) {
      throw createError('只有待簽核的填報單可以撤回。', 409);
    }
  }

  async function handleHealth(_req, res, origin) {
    try {
      await writeJson(res, buildJsonResponse(200, await buildHealth()), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to read training backend health.', 500), origin);
    }
  }

  async function handleFormList(_req, res, origin, url) {
    try {
      const rows = await listAllForms();
      const items = filterForms(rows.map((entry) => entry.item), url);
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        items: items.map(mapTrainingFormForClient),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to list training forms.', 500), origin);
    }
  }

  async function handleFormDetail(_req, res, origin, formId) {
    try {
      const existing = await getFormEntryById(formId);
      if (!existing) {
        throw createError('找不到指定的教育訓練填報單。', 404);
      }
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        item: mapTrainingFormForClient(existing.item),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to read training form detail.', 500), origin);
    }
  }

  async function writeTrainingForm(req, res, origin, formId, action, options) {
    try {
      const existing = await getFormEntryById(formId);
      if (typeof options.assertBefore === 'function') {
        options.assertBefore(existing);
      } else {
        assertEditable(existing);
      }
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, action);
      const payload = normalizeTrainingFormPayload(envelope.payload);
      if (cleanText(formId) !== cleanText(payload.id)) {
        throw createError('路由編號與 payload 編號不一致。', 400);
      }
      validateTrainingFormPayload(payload, options.validation || {});
      const duplicate = await findDuplicateForm(payload.unit, payload.trainingYear, payload.id);
      if (duplicate) {
        throw createError('同年度填報單已存在，請直接續編原資料。', 409);
      }

      const actor = actorLabel(payload, (existing && existing.item && existing.item.fillerName) || payload.fillerName);
      const now = new Date().toISOString();
      const nextStatus = typeof options.resolveStatus === 'function'
        ? options.resolveStatus(existing, payload)
        : options.status;
      const existingItem = existing ? existing.item : null;
      const nextHistory = typeof options.buildHistory === 'function'
        ? options.buildHistory(existingItem, payload, actor, now)
        : (payload.history || existingItem?.history || []);
      let nextItemInput = {
        ...(existingItem || {}),
        ...payload,
        status: nextStatus,
        createdAt: existingItem ? existingItem.createdAt : (payload.createdAt || now),
        updatedAt: now,
        history: nextHistory
      };
      if (typeof options.transformItem === 'function') {
        nextItemInput = options.transformItem(nextItemInput, existingItem, payload, now);
      }
      const nextItem = createTrainingFormRecord(nextItemInput, nextStatus, now);
      const saved = await upsertForm(existing, nextItem);
      await createAuditRow({
        eventType: options.eventType,
        actorEmail: nextItem.submitterEmail,
        targetEmail: nextItem.submitterEmail,
        unitCode: nextItem.unitCode,
        recordId: nextItem.id,
        occurredAt: now,
        payloadJson: JSON.stringify({
          action,
          status: nextItem.status,
          backendMode: nextItem.backendMode
        })
      });
      await writeJson(res, buildJsonResponse(saved.created ? 201 : 200, {
        ok: true,
        item: mapTrainingFormForClient(saved.item),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to write training form.', 500), origin);
    }
  }

  async function handleRosterList(_req, res, origin, url) {
    try {
      const rows = await listAllRosters();
      const items = filterRosters(rows.map((entry) => entry.item), url);
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        items: items.map(mapTrainingRosterForClient),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to list training rosters.', 500), origin);
    }
  }

  async function handleRosterUpsert(req, res, origin) {
    try {
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ROSTER_ACTIONS.UPSERT);
      const payload = normalizeTrainingRosterPayload(envelope.payload);
      validateTrainingRosterPayload(payload);
      const now = new Date().toISOString();
      let existing = cleanText(payload.id) ? await getRosterEntryById(payload.id) : null;
      if (!existing) {
        existing = await findDuplicateRoster(payload.unit, payload.name, payload.id);
      }
      const actor = actorLabel(payload, payload.createdBy || payload.name);
      const nextItem = createTrainingRosterRecord({
        ...(existing ? existing.item : {}),
        ...payload,
        createdAt: existing ? existing.item.createdAt : (payload.createdAt || now),
        updatedAt: now
      }, now);
      const saved = await upsertRoster(existing, nextItem);
      await createAuditRow({
        eventType: 'training.roster_upserted',
        actorEmail: '',
        targetEmail: '',
        unitCode: '',
        recordId: nextItem.id || nextItem.name,
        occurredAt: now,
        payloadJson: JSON.stringify({
          action: ROSTER_ACTIONS.UPSERT,
          actor,
          unit: nextItem.unit,
          source: nextItem.source
        })
      });
      await writeJson(res, buildJsonResponse(saved.created ? 201 : 200, {
        ok: true,
        item: mapTrainingRosterForClient(saved.item),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to upsert training roster.', 500), origin);
    }
  }

  async function handleRosterDelete(req, res, origin, rosterId) {
    try {
      const existing = await getRosterEntryById(rosterId);
      if (!existing) {
        throw createError('找不到指定的名單資料。', 404);
      }
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ROSTER_ACTIONS.DELETE);
      const payload = envelope && envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {};
      const now = new Date().toISOString();
      await deleteRosterEntry(existing);
      await createAuditRow({
        eventType: 'training.roster_deleted',
        actorEmail: '',
        targetEmail: '',
        unitCode: '',
        recordId: existing.item.id,
        occurredAt: now,
        payloadJson: JSON.stringify({
          action: ROSTER_ACTIONS.DELETE,
          actor: actorLabel(payload, existing.item.name),
          unit: existing.item.unit,
          source: existing.item.source
        })
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        deletedId: existing.item.id,
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to delete training roster.', 500), origin);
    }
  }

  function buildDraftHistory(existingItem, actor, now) {
    if (existingItem && existingItem.status === FORM_STATUSES.RETURNED) {
      return appendHistory(existingItem.history, '儲存退回更正中的教育訓練草稿', actor, now);
    }
    return appendHistory(existingItem && existingItem.history, existingItem ? '儲存教育訓練統計暫存' : '建立教育訓練統計草稿', actor, now);
  }

  function tryHandle(req, res, origin, url) {
    const formCollectionMatch = url.pathname.match(/^\/api\/training\/forms\/?$/);
    const formDetailMatch = url.pathname.match(/^\/api\/training\/forms\/([^/]+)\/?$/);
    const formActionMatch = url.pathname.match(/^\/api\/training\/forms\/([^/]+)\/(save-draft|submit-step-one|finalize|return|undo)\/?$/);
    const rosterCollectionMatch = url.pathname.match(/^\/api\/training\/rosters\/?$/);
    const rosterUpsertMatch = url.pathname.match(/^\/api\/training\/rosters\/upsert\/?$/);
    const rosterDeleteMatch = url.pathname.match(/^\/api\/training\/rosters\/([^/]+)\/delete\/?$/);

    if (url.pathname === '/api/training/health' && req.method === 'GET') {
      return handleHealth(req, res, origin).then(() => true);
    }
    if (formCollectionMatch && req.method === 'GET') {
      return handleFormList(req, res, origin, url).then(() => true);
    }
    if (formDetailMatch && req.method === 'GET') {
      return handleFormDetail(req, res, origin, routeId(formDetailMatch[1])).then(() => true);
    }
    if (formActionMatch && req.method === 'POST') {
      const formId = routeId(formActionMatch[1]);
      const actionName = formActionMatch[2];
      if (actionName === 'save-draft') {
        return writeTrainingForm(req, res, origin, formId, FORM_ACTIONS.SAVE_DRAFT, {
          validation: { requireRecords: true },
          resolveStatus: function (existing) {
            return existing && existing.item.status === FORM_STATUSES.RETURNED
              ? FORM_STATUSES.RETURNED
              : FORM_STATUSES.DRAFT;
          },
          transformItem: function (item, existingItem) {
            if (existingItem && existingItem.status === FORM_STATUSES.RETURNED) {
              return {
                ...item,
                returnReason: item.returnReason || existingItem.returnReason || ''
              };
            }
            return item;
          },
          buildHistory: function (existingItem, _payload, actor, now) {
            return buildDraftHistory(existingItem, actor, now);
          },
          eventType: 'training.form_saved'
        }).then(() => true);
      }
      if (actionName === 'submit-step-one') {
        return writeTrainingForm(req, res, origin, formId, FORM_ACTIONS.SUBMIT_STEP_ONE, {
          validation: { requireRecords: true },
          resolveStatus: function () {
            return FORM_STATUSES.PENDING_SIGNOFF;
          },
          transformItem: function (item, _existingItem, _payload, now) {
            return {
              ...item,
              returnReason: '',
              stepOneSubmittedAt: now
            };
          },
          buildHistory: function (existingItem, _payload, actor, now) {
            return appendHistory(existingItem && existingItem.history, '完成流程一並鎖定填報內容', actor, now);
          },
          eventType: 'training.form_step_one_submitted'
        }).then(() => true);
      }
      if (actionName === 'finalize') {
        return writeTrainingForm(req, res, origin, formId, FORM_ACTIONS.FINALIZE, {
          assertBefore: assertCanFinalize,
          validation: { requireRecords: true, requireSignedFiles: true },
          resolveStatus: function () {
            return FORM_STATUSES.SUBMITTED;
          },
          transformItem: function (item, _existingItem, _payload, now) {
            return {
              ...item,
              signoffUploadedAt: now,
              submittedAt: now
            };
          },
          buildHistory: function (existingItem, _payload, actor, now) {
            return appendHistory(existingItem && existingItem.history, '上傳簽核掃描檔並完成整體填報', actor, now);
          },
          eventType: 'training.form_finalized'
        }).then(() => true);
      }
      if (actionName === 'return') {
        return writeTrainingForm(req, res, origin, formId, FORM_ACTIONS.RETURN, {
          assertBefore: assertCanReturn,
          validation: { requireRecords: true, requireReturnReason: true },
          resolveStatus: function () {
            return FORM_STATUSES.RETURNED;
          },
          buildHistory: function (existingItem, payload, actor, now) {
            return appendHistory(existingItem && existingItem.history, '管理者退回更正：' + cleanText(payload.returnReason), actor, now);
          },
          eventType: 'training.form_returned'
        }).then(() => true);
      }
      if (actionName === 'undo') {
        return writeTrainingForm(req, res, origin, formId, FORM_ACTIONS.UNDO, {
          assertBefore: assertCanUndo,
          validation: { requireRecords: true },
          resolveStatus: function () {
            return FORM_STATUSES.DRAFT;
          },
          transformItem: function (item) {
            return {
              ...item,
              stepOneSubmittedAt: '',
              printedAt: '',
              signoffUploadedAt: '',
              submittedAt: '',
              returnReason: ''
            };
          },
          buildHistory: function (existingItem, _payload, actor, now) {
            return appendHistory(existingItem && existingItem.history, '填報人撤回流程一，重新開放編修', actor, now);
          },
          eventType: 'training.form_undone'
        }).then(() => true);
      }
    }
    if (rosterCollectionMatch && req.method === 'GET') {
      return handleRosterList(req, res, origin, url).then(() => true);
    }
    if (rosterUpsertMatch && req.method === 'POST') {
      return handleRosterUpsert(req, res, origin).then(() => true);
    }
    if (rosterDeleteMatch && req.method === 'POST') {
      return handleRosterDelete(req, res, origin, routeId(rosterDeleteMatch[1])).then(() => true);
    }
    return Promise.resolve(false);
  }

  return {
    tryHandle
  };
}

module.exports = {
  createTrainingRouter
};
