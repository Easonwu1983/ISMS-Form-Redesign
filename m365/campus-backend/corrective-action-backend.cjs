const {
  ACTIONS,
  CONTRACT_VERSION,
  REVIEW_DECISIONS,
  STATUSES,
  TRACKING_RESULTS,
  TRACKING_REVIEW_DECISIONS,
  buildErrorResponse,
  buildJsonResponse,
  cleanText,
  createCaseRecord,
  createError,
  mapCaseForClient,
  mapCaseToGraphFields,
  mapGraphFieldsToCase,
  normalizeCreatePayload,
  normalizeRespondPayload,
  normalizeReviewPayload,
  normalizeStoredCase,
  normalizeTrackingReviewPayload,
  normalizeTrackingSubmitPayload,
  validateActionEnvelope,
  validateCreatePayload,
  validateRespondPayload,
  validateReviewPayload,
  validateTrackingReviewPayload,
  validateTrackingSubmitPayload
} = require('../azure-function/corrective-action-api/src/shared/contract');

function createCorrectiveActionRouter(deps) {
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

  function routeCaseId(value) {
    return decodeURIComponent(String(value || '').trim());
  }

  function actorLabel(payload, fallback) {
    return cleanText(payload && (payload.actorName || payload.actorUsername)) || fallback || '系統';
  }

  function appendHistory(history, action, user, time) {
    return (Array.isArray(history) ? history : []).concat([{
      time: cleanText(time) || new Date().toISOString(),
      action: cleanText(action),
      user: cleanText(user) || '系統'
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

  function getCorrectiveActionsListName() {
    return getEnv('CORRECTIVE_ACTIONS_LIST', 'CorrectiveActions');
  }

  function getAuditListName() {
    return getEnv('UNIT_CONTACT_AUDIT_LIST', 'OpsAudit');
  }

  async function resolveCorrectiveActionsList() {
    return resolveNamedList(getCorrectiveActionsListName());
  }

  async function resolveAuditList() {
    return resolveNamedList(getAuditListName());
  }

  async function listAllEntries() {
    const siteId = await resolveSiteId();
    const list = await resolveCorrectiveActionsList();
    const rows = [];
    let nextUrl = `/sites/${siteId}/lists/${list.id}/items?$expand=fields&$top=200`;
    while (nextUrl) {
      const body = await graphRequest('GET', nextUrl);
      const batch = Array.isArray(body && body.value) ? body.value : [];
      rows.push(...batch.map((entry) => ({
        listItemId: cleanText(entry && entry.id),
        item: mapGraphFieldsToCase(entry && entry.fields ? entry.fields : {})
      })));
      nextUrl = cleanText(body && body['@odata.nextLink']);
    }
    return rows;
  }

  async function getEntryByCaseId(caseId) {
    const target = cleanText(caseId);
    if (!target) throw createError('缺少矯正單號。', 400);
    const rows = await listAllEntries();
    return rows.find((entry) => entry.item.id === target) || null;
  }

  async function updateCaseRecord(existingEntry, nextItem) {
    const siteId = await resolveSiteId();
    const list = await resolveCorrectiveActionsList();
    const normalized = normalizeStoredCase(nextItem);
    await graphRequest('PATCH', `/sites/${siteId}/lists/${list.id}/items/${existingEntry.listItemId}/fields`, mapCaseToGraphFields(normalized));
    return normalized;
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
      health.list = await resolveCorrectiveActionsList();
    } catch (error) {
      health.ok = false;
      health.ready = false;
      health.message = cleanText(error && error.message) || 'CorrectiveActions list is not ready.';
    }
    return health;
  }

  function filterItems(items, url) {
    const status = cleanText(url.searchParams.get('status'));
    const handlerUnit = cleanText(url.searchParams.get('handlerUnit'));
    const handlerUsername = cleanText(url.searchParams.get('handlerUsername'));
    const query = cleanText(url.searchParams.get('q')).toLowerCase();
    return items.filter((entry) => {
      if (status && entry.status !== status) return false;
      if (handlerUnit && entry.handlerUnit !== handlerUnit) return false;
      if (handlerUsername && entry.handlerUsername !== handlerUsername) return false;
      if (query) {
        const haystack = [
          entry.id,
          entry.proposerName,
          entry.handlerName,
          entry.problemDesc,
          entry.deficiencyType,
          entry.source
        ].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    }).sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
  }

  async function handleHealth(_req, res, origin) {
    try {
      await writeJson(res, buildJsonResponse(200, await buildHealth()), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to read corrective-action backend health.', 500), origin);
    }
  }

  async function handleList(_req, res, origin, url) {
    try {
      const rows = await listAllEntries();
      const items = filterItems(rows.map((entry) => entry.item), url);
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        items: items.map(mapCaseForClient),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to list corrective actions.', 500), origin);
    }
  }

  async function handleDetail(_req, res, origin, caseId) {
    try {
      const existing = await getEntryByCaseId(caseId);
      if (!existing) {
        throw createError('找不到矯正單。', 404);
      }
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        item: mapCaseForClient(existing.item),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to read corrective action detail.', 500), origin);
    }
  }

  async function handleCreate(req, res, origin) {
    try {
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ACTIONS.CREATE);
      const payload = normalizeCreatePayload(envelope.payload);
      validateCreatePayload(payload);
      const existing = await getEntryByCaseId(payload.id);
      if (existing) {
        throw createError('矯正單號已存在。', 409);
      }
      const now = new Date().toISOString();
      const actor = actorLabel(payload, payload.proposerName);
      const item = createCaseRecord({
        ...payload,
        history: [
          { time: now, action: '開立矯正單', user: actor },
          { time: now, action: `狀態變更為「${STATUSES.PENDING}」`, user: actor }
        ]
      }, now);
      const siteId = await resolveSiteId();
      const list = await resolveCorrectiveActionsList();
      await graphRequest('POST', `/sites/${siteId}/lists/${list.id}/items`, {
        fields: mapCaseToGraphFields(item)
      });
      await createAuditRow({
        eventType: 'corrective_action.created',
        actorEmail: '',
        targetEmail: cleanText(item.handlerEmail),
        unitCode: cleanText(item.handlerUnitCode),
        recordId: item.id,
        occurredAt: now,
        payloadJson: JSON.stringify({
          status: item.status,
          proposerUnit: item.proposerUnit,
          handlerUnit: item.handlerUnit
        })
      });
      await writeJson(res, buildJsonResponse(201, {
        ok: true,
        item: mapCaseForClient(item),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to create corrective action.'), origin);
    }
  }

  async function handleRespond(req, res, origin, caseId) {
    try {
      const existing = await getEntryByCaseId(caseId);
      if (!existing) throw createError('找不到矯正單。', 404);
      if (existing.item.status !== STATUSES.PENDING) {
        throw createError('目前狀態不可送出矯正措施。', 409);
      }
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ACTIONS.RESPOND);
      const payload = normalizeRespondPayload(envelope.payload);
      validateRespondPayload(payload);
      const now = new Date().toISOString();
      const actor = actorLabel(payload, existing.item.handlerName || '系統');
      const history = appendHistory(existing.item.history, `${actor} 已回覆矯正措施`, actor, now);
      const nextHistory = appendHistory(history, `狀態變更為「${STATUSES.PROPOSED}」`, actor, now);
      if (payload.evidence.length) {
        nextHistory.push({ time: now, action: `上傳 ${payload.evidence.length} 筆佐證附件`, user: actor });
      }
      const nextItem = {
        ...existing.item,
        correctiveAction: payload.correctiveAction,
        correctiveDueDate: payload.correctiveDueDate || existing.item.correctiveDueDate,
        rootCause: payload.rootCause,
        rootElimination: payload.rootElimination,
        rootElimDueDate: payload.rootElimDueDate,
        riskDesc: payload.riskDesc,
        riskAcceptor: payload.riskAcceptor,
        riskAcceptDate: payload.riskAcceptDate,
        riskAssessDate: payload.riskAssessDate,
        evidence: (existing.item.evidence || []).concat(payload.evidence || []),
        status: STATUSES.PROPOSED,
        updatedAt: now,
        history: nextHistory
      };
      const updated = await updateCaseRecord(existing, nextItem);
      await createAuditRow({
        eventType: 'corrective_action.responded',
        targetEmail: cleanText(updated.handlerEmail),
        unitCode: cleanText(updated.handlerUnitCode),
        recordId: updated.id,
        occurredAt: now,
        payloadJson: JSON.stringify({
          status: updated.status,
          evidenceCount: payload.evidence.length
        })
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        item: mapCaseForClient(updated),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to respond corrective action.'), origin);
    }
  }

  async function handleReview(req, res, origin, caseId) {
    try {
      const existing = await getEntryByCaseId(caseId);
      if (!existing) throw createError('找不到矯正單。', 404);
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ACTIONS.REVIEW);
      const payload = normalizeReviewPayload(envelope.payload);
      validateReviewPayload(payload);
      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const actor = actorLabel(payload);
      let nextStatus = '';
      let reviewResult = '';
      if (payload.decision === REVIEW_DECISIONS.START_REVIEW) {
        if (existing.item.status !== STATUSES.PROPOSED) throw createError('只有已提案案件可進入審核。', 409);
        nextStatus = STATUSES.REVIEWING;
        reviewResult = '進入審核';
      } else {
        if (existing.item.status !== STATUSES.REVIEWING) throw createError('只有審核中案件可執行審核決定。', 409);
        if (payload.decision === REVIEW_DECISIONS.CLOSE) {
          nextStatus = STATUSES.CLOSED;
          reviewResult = '同意結案';
        } else if (payload.decision === REVIEW_DECISIONS.TRACKING) {
          nextStatus = STATUSES.TRACKING;
          reviewResult = '轉為追蹤';
        } else if (payload.decision === REVIEW_DECISIONS.RETURN) {
          nextStatus = STATUSES.PENDING;
          reviewResult = '退回重填';
        }
      }
      const history = appendHistory(existing.item.history, `狀態變更為「${nextStatus}」`, actor, now);
      const nextItem = {
        ...existing.item,
        status: nextStatus,
        reviewResult,
        reviewer: actor,
        reviewDate: today,
        updatedAt: now,
        closedDate: nextStatus === STATUSES.CLOSED ? now : '',
        pendingTracking: nextStatus === STATUSES.PENDING ? null : existing.item.pendingTracking,
        history
      };
      const updated = await updateCaseRecord(existing, nextItem);
      await createAuditRow({
        eventType: 'corrective_action.reviewed',
        recordId: updated.id,
        unitCode: cleanText(updated.handlerUnitCode),
        occurredAt: now,
        payloadJson: JSON.stringify({
          decision: payload.decision,
          nextStatus
        })
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        item: mapCaseForClient(updated),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to review corrective action.'), origin);
    }
  }

  async function handleTrackingSubmit(req, res, origin, caseId) {
    try {
      const existing = await getEntryByCaseId(caseId);
      if (!existing) throw createError('找不到矯正單。', 404);
      if (existing.item.status !== STATUSES.TRACKING) throw createError('只有追蹤中案件可送出追蹤提報。', 409);
      if (existing.item.pendingTracking) throw createError('目前已有待審核的追蹤提報。', 409);
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ACTIONS.TRACKING_SUBMIT);
      const payload = normalizeTrackingSubmitPayload(envelope.payload);
      validateTrackingSubmitPayload(payload);
      const now = new Date().toISOString();
      const actor = actorLabel(payload, existing.item.handlerName || '系統');
      const round = Array.isArray(existing.item.trackings) ? existing.item.trackings.length + 1 : 1;
      const pendingTracking = {
        round,
        tracker: payload.tracker,
        trackDate: payload.trackDate,
        execution: payload.execution,
        trackNote: payload.trackNote,
        result: payload.result,
        nextTrackDate: payload.result === TRACKING_RESULTS.CONTINUE ? payload.nextTrackDate : '',
        evidence: payload.evidence,
        submittedAt: now
      };
      const nextHistory = appendHistory(existing.item.history, `送出第 ${round} 次追蹤提報`, actor, now);
      nextHistory.push({ time: now, action: `追蹤建議：${payload.result}`, user: actor });
      if (pendingTracking.nextTrackDate) {
        nextHistory.push({ time: now, action: `建議下次追蹤日期：${pendingTracking.nextTrackDate}`, user: actor });
      }
      if (payload.evidence.length) {
        nextHistory.push({ time: now, action: `上傳 ${payload.evidence.length} 筆追蹤佐證附件`, user: actor });
      }
      const nextItem = {
        ...existing.item,
        pendingTracking,
        updatedAt: now,
        history: nextHistory
      };
      const updated = await updateCaseRecord(existing, nextItem);
      await createAuditRow({
        eventType: 'corrective_action.tracking_submitted',
        recordId: updated.id,
        unitCode: cleanText(updated.handlerUnitCode),
        occurredAt: now,
        payloadJson: JSON.stringify({
          round,
          result: payload.result
        })
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        item: mapCaseForClient(updated),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to submit tracking review.'), origin);
    }
  }

  async function handleTrackingReview(req, res, origin, caseId) {
    try {
      const existing = await getEntryByCaseId(caseId);
      if (!existing) throw createError('找不到矯正單。', 404);
      if (existing.item.status !== STATUSES.TRACKING || !existing.item.pendingTracking) {
        throw createError('目前沒有可審核的追蹤提報。', 409);
      }
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ACTIONS.TRACKING_REVIEW);
      const payload = normalizeTrackingReviewPayload(envelope.payload);
      validateTrackingReviewPayload(payload);
      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const actor = actorLabel(payload);
      const pending = existing.item.pendingTracking;
      const shouldClose = payload.decision === TRACKING_REVIEW_DECISIONS.CLOSE;
      const finalResult = shouldClose ? '同意結案' : '同意繼續追蹤';
      const approvedTracking = {
        ...pending,
        requestedResult: pending.result,
        result: finalResult,
        decision: finalResult,
        reviewer: actor,
        reviewDate: today,
        reviewedAt: now
      };
      const nextHistory = appendHistory(existing.item.history, `審核第 ${pending.round || ((existing.item.trackings || []).length + 1)} 次追蹤提報`, actor, now);
      nextHistory.push({ time: now, action: finalResult, user: actor });
      if (!shouldClose && pending.nextTrackDate) {
        nextHistory.push({ time: now, action: `下次追蹤日期：${pending.nextTrackDate}`, user: actor });
      }
      const nextItem = {
        ...existing.item,
        trackings: (existing.item.trackings || []).concat([approvedTracking]),
        pendingTracking: null,
        status: shouldClose ? STATUSES.CLOSED : STATUSES.TRACKING,
        reviewResult: finalResult,
        reviewNextDate: shouldClose ? '' : cleanText(pending.nextTrackDate),
        reviewer: actor,
        reviewDate: today,
        updatedAt: now,
        closedDate: shouldClose ? now : '',
        evidence: (existing.item.evidence || []).concat(Array.isArray(pending.evidence) ? pending.evidence : []),
        history: nextHistory
      };
      const updated = await updateCaseRecord(existing, nextItem);
      await createAuditRow({
        eventType: 'corrective_action.tracking_reviewed',
        recordId: updated.id,
        unitCode: cleanText(updated.handlerUnitCode),
        occurredAt: now,
        payloadJson: JSON.stringify({
          decision: payload.decision,
          finalResult
        })
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        item: mapCaseForClient(updated),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to review tracking submission.'), origin);
    }
  }

  async function tryHandle(req, res, origin, url) {
    const pathname = cleanText(url && url.pathname);
    if (pathname === '/api/corrective-actions/health') {
      await handleHealth(req, res, origin);
      return true;
    }
    if (pathname === '/api/corrective-actions' && req.method === 'GET') {
      await handleList(req, res, origin, url);
      return true;
    }
    if (pathname === '/api/corrective-actions' && req.method === 'POST') {
      await handleCreate(req, res, origin);
      return true;
    }

    const detailMatch = pathname.match(/^\/api\/corrective-actions\/([^/]+)$/);
    if (detailMatch && req.method === 'GET') {
      await handleDetail(req, res, origin, routeCaseId(detailMatch[1]));
      return true;
    }

    const respondMatch = pathname.match(/^\/api\/corrective-actions\/([^/]+)\/respond$/);
    if (respondMatch && req.method === 'POST') {
      await handleRespond(req, res, origin, routeCaseId(respondMatch[1]));
      return true;
    }

    const reviewMatch = pathname.match(/^\/api\/corrective-actions\/([^/]+)\/review$/);
    if (reviewMatch && req.method === 'POST') {
      await handleReview(req, res, origin, routeCaseId(reviewMatch[1]));
      return true;
    }

    const trackingSubmitMatch = pathname.match(/^\/api\/corrective-actions\/([^/]+)\/tracking-submit$/);
    if (trackingSubmitMatch && req.method === 'POST') {
      await handleTrackingSubmit(req, res, origin, routeCaseId(trackingSubmitMatch[1]));
      return true;
    }

    const trackingReviewMatch = pathname.match(/^\/api\/corrective-actions\/([^/]+)\/tracking-review$/);
    if (trackingReviewMatch && req.method === 'POST') {
      await handleTrackingReview(req, res, origin, routeCaseId(trackingReviewMatch[1]));
      return true;
    }

    return false;
  }

  return {
    tryHandle
  };
}

module.exports = {
  createCorrectiveActionRouter
};
