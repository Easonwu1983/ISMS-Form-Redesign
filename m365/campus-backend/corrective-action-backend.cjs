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
const {
  buildFieldChanges,
  summarizeAttachments
} = require('./audit-diff.cjs');

function createCorrectiveActionRouter(deps) {
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

  function routeCaseId(value) {
    return decodeURIComponent(String(value || '').trim());
  }

  function actorLabel(payload, fallback) {
    return cleanText(payload && (payload.actorName || payload.actorUsername)) || fallback || 'system';
  }

  function appendHistory(history, action, user, time) {
    return (Array.isArray(history) ? history : []).concat([{
      time: cleanText(time) || new Date().toISOString(),
      action: cleanText(action),
      user: cleanText(user) || 'system'
    }]);
  }

  function buildActor(authz, payload, fallback) {
    const actorMeta = requestAuthz.buildActorDetails(authz);
    return {
      actorMeta,
      actorLabel: actorLabel(payload, actorMeta.actorName || actorMeta.actorUsername || fallback || 'system')
    };
  }

  function buildStatusHistory(status) {
    return `\u72c0\u614b\u8b8a\u66f4\u70ba\u300c${status}\u300d`;
  }

  function buildCaseSnapshot(item) {
    if (!item) return null;
    return {
      id: cleanText(item.id),
      proposerUnit: cleanText(item.proposerUnit),
      handlerUnit: cleanText(item.handlerUnit),
      handlerUsername: cleanText(item.handlerUsername),
      deficiencyType: cleanText(item.deficiencyType),
      status: cleanText(item.status),
      evidence: summarizeAttachments(item.evidence),
      trackingsCount: Array.isArray(item.trackings) ? item.trackings.length : 0
    };
  }

  function buildCaseChanges(beforeItem, afterItem) {
    const beforeEvidence = summarizeAttachments(beforeItem && beforeItem.evidence);
    const afterEvidence = summarizeAttachments(afterItem && afterItem.evidence);
    return buildFieldChanges(beforeItem, afterItem, [
      'proposerUnit',
      'proposerName',
      'handlerUnit',
      'handlerName',
      'handlerUsername',
      'handlerEmail',
      'deficiencyType',
      'source',
      { key: 'category', kind: 'array' },
      'clause',
      'problemDesc',
      'occurrence',
      'correctiveAction',
      'correctiveDueDate',
      'rootCause',
      'riskDesc',
      'riskAcceptor',
      'riskAcceptDate',
      'riskAssessDate',
      'rootElimination',
      'rootElimDueDate',
      'reviewResult',
      'reviewNextDate',
      'reviewer',
      'reviewDate',
      'status',
      'closedDate',
      { label: 'evidenceCount', kind: 'number', get: function (item) { return item === beforeItem ? beforeEvidence.count : afterEvidence.count; } },
      { label: 'trackingCount', kind: 'number', get: function (item) { return Array.isArray(item && item.trackings) ? item.trackings.length : 0; } },
      { label: 'pendingTrackingResult', get: function (item) { return item && item.pendingTracking && item.pendingTracking.result; } },
      { label: 'pendingTrackingNextDate', get: function (item) { return item && item.pendingTracking && item.pendingTracking.nextTrackDate; } }
    ]);
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
    if (!target) throw createError('Missing corrective-action id.', 400);
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

  async function handleList(req, res, origin, url) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const rows = await listAllEntries();
      const items = filterItems(rows.map((entry) => entry.item), url)
        .filter((entry) => requestAuthz.canAccessCorrectiveAction(authz, entry));
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        items: items.map(mapCaseForClient),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to list corrective actions.', 500), origin);
    }
  }

  async function handleDetail(req, res, origin, caseId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getEntryByCaseId(caseId);
      if (!existing) {
        throw createError('Corrective action not found.', 404);
      }
      if (!requestAuthz.canAccessCorrectiveAction(authz, existing.item)) {
        throw requestAuthz.createHttpError('You do not have access to this corrective action.', 403);
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
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      requestAuthz.requireAdmin(authz, 'Only administrators can create corrective actions.');
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ACTIONS.CREATE);
      const payload = normalizeCreatePayload(envelope.payload);
      validateCreatePayload(payload);
      const existing = await getEntryByCaseId(payload.id);
      if (existing) {
        throw createError('Corrective action already exists.', 409);
      }
      const now = new Date().toISOString();
      const actor = buildActor(authz, payload, payload.proposerName);
      const item = createCaseRecord({
        ...payload,
        history: [
          { time: now, action: '\u958b\u7acb\u77ef\u6b63\u55ae', user: actor.actorLabel },
          { time: now, action: buildStatusHistory(STATUSES.PENDING), user: actor.actorLabel }
        ]
      }, now);
      const siteId = await resolveSiteId();
      const list = await resolveCorrectiveActionsList();
      await graphRequest('POST', `/sites/${siteId}/lists/${list.id}/items`, {
        fields: mapCaseToGraphFields(item)
      });
      await createAuditRow({
        eventType: 'corrective_action.created',
        actorEmail: actor.actorMeta.actorEmail,
        targetEmail: cleanText(item.handlerEmail),
        unitCode: cleanText(item.handlerUnitCode),
        recordId: item.id,
        occurredAt: now,
        payloadJson: JSON.stringify({
          actorName: actor.actorMeta.actorName,
          actorUsername: actor.actorMeta.actorUsername,
          snapshot: buildCaseSnapshot(item),
          changes: buildCaseChanges(null, item)
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
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getEntryByCaseId(caseId);
      if (!existing) throw createError('Corrective action not found.', 404);
      if (!requestAuthz.canRespondCorrectiveAction(authz, existing.item)) {
        throw requestAuthz.createHttpError('You do not have permission to respond to this corrective action.', 403);
      }
      if (existing.item.status !== STATUSES.PENDING) {
        throw createError('Corrective action is not in pending status.', 409);
      }
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ACTIONS.RESPOND);
      const payload = normalizeRespondPayload(envelope.payload);
      validateRespondPayload(payload);
      const now = new Date().toISOString();
      const actor = buildActor(authz, payload, existing.item.handlerName || authz.username);
      const history = appendHistory(existing.item.history, `${actor.actorLabel} \u63d0\u4ea4\u77ef\u6b63\u63aa\u65bd\u63d0\u6848`, actor.actorLabel, now);
      let nextHistory = appendHistory(history, buildStatusHistory(STATUSES.PROPOSED), actor.actorLabel, now);
      if (payload.evidence.length) {
        nextHistory = nextHistory.concat([{
          time: now,
          action: `\u5df2\u4e0a\u50b3 ${payload.evidence.length} \u4efd\u4f50\u8b49`,
          user: actor.actorLabel
        }]);
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
        actorEmail: actor.actorMeta.actorEmail,
        targetEmail: cleanText(updated.handlerEmail),
        unitCode: cleanText(updated.handlerUnitCode),
        recordId: updated.id,
        occurredAt: now,
        payloadJson: JSON.stringify({
          actorName: actor.actorMeta.actorName,
          actorUsername: actor.actorMeta.actorUsername,
          changes: buildCaseChanges(existing.item, updated)
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
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getEntryByCaseId(caseId);
      if (!existing) throw createError('Corrective action not found.', 404);
      if (!requestAuthz.canReviewCorrectiveAction(authz, existing.item)) {
        throw requestAuthz.createHttpError('You do not have permission to review this corrective action.', 403);
      }
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ACTIONS.REVIEW);
      const payload = normalizeReviewPayload(envelope.payload);
      validateReviewPayload(payload);
      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const actor = buildActor(authz, payload, authz.username);
      let nextStatus = '';
      let reviewResult = '';
      if (payload.decision === REVIEW_DECISIONS.START_REVIEW) {
        if (existing.item.status !== STATUSES.PROPOSED) {
          throw createError('Corrective action must be proposed before review starts.', 409);
        }
        nextStatus = STATUSES.REVIEWING;
        reviewResult = '\u958b\u59cb\u5be9\u6838';
      } else {
        if (existing.item.status !== STATUSES.REVIEWING) {
          throw createError('Corrective action is not in reviewing status.', 409);
        }
        if (payload.decision === REVIEW_DECISIONS.CLOSE) {
          nextStatus = STATUSES.CLOSED;
          reviewResult = '\u540c\u610f\u7d50\u6848';
        } else if (payload.decision === REVIEW_DECISIONS.TRACKING) {
          nextStatus = STATUSES.TRACKING;
          reviewResult = '\u8f49\u6301\u7e8c\u8ffd\u8e64';
        } else if (payload.decision === REVIEW_DECISIONS.RETURN) {
          nextStatus = STATUSES.PENDING;
          reviewResult = '\u9000\u56de\u66f4\u6b63';
        }
      }
      const history = appendHistory(existing.item.history, buildStatusHistory(nextStatus), actor.actorLabel, now);
      const nextItem = {
        ...existing.item,
        status: nextStatus,
        reviewResult,
        reviewer: actor.actorLabel,
        reviewDate: today,
        updatedAt: now,
        closedDate: nextStatus === STATUSES.CLOSED ? now : '',
        pendingTracking: nextStatus === STATUSES.PENDING ? null : existing.item.pendingTracking,
        history
      };
      const updated = await updateCaseRecord(existing, nextItem);
      await createAuditRow({
        eventType: 'corrective_action.reviewed',
        actorEmail: actor.actorMeta.actorEmail,
        targetEmail: cleanText(updated.handlerEmail),
        recordId: updated.id,
        unitCode: cleanText(updated.handlerUnitCode),
        occurredAt: now,
        payloadJson: JSON.stringify({
          actorName: actor.actorMeta.actorName,
          actorUsername: actor.actorMeta.actorUsername,
          decision: payload.decision,
          changes: buildCaseChanges(existing.item, updated)
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
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getEntryByCaseId(caseId);
      if (!existing) throw createError('Corrective action not found.', 404);
      if (!requestAuthz.canRespondCorrectiveAction(authz, existing.item)) {
        throw requestAuthz.createHttpError('You do not have permission to submit tracking for this corrective action.', 403);
      }
      if (existing.item.status !== STATUSES.TRACKING) {
        throw createError('Corrective action is not in tracking status.', 409);
      }
      if (existing.item.pendingTracking) {
        throw createError('There is already a pending tracking submission.', 409);
      }
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ACTIONS.TRACKING_SUBMIT);
      const payload = normalizeTrackingSubmitPayload(envelope.payload);
      validateTrackingSubmitPayload(payload);
      const now = new Date().toISOString();
      const actor = buildActor(authz, payload, existing.item.handlerName || authz.username);
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
      let nextHistory = appendHistory(existing.item.history, `\u63d0\u4ea4\u7b2c ${round} \u6b21\u8ffd\u8e64`, actor.actorLabel, now);
      nextHistory = nextHistory.concat([{
        time: now,
        action: `\u8ffd\u8e64\u63d0\u5831\uff1a${payload.result}`,
        user: actor.actorLabel
      }]);
      if (pendingTracking.nextTrackDate) {
        nextHistory = nextHistory.concat([{
          time: now,
          action: `\u4e0b\u6b21\u8ffd\u8e64\u65e5\u671f\uff1a${pendingTracking.nextTrackDate}`,
          user: actor.actorLabel
        }]);
      }
      if (payload.evidence.length) {
        nextHistory = nextHistory.concat([{
          time: now,
          action: `\u5df2\u4e0a\u50b3 ${payload.evidence.length} \u4efd\u8ffd\u8e64\u4f50\u8b49`,
          user: actor.actorLabel
        }]);
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
        actorEmail: actor.actorMeta.actorEmail,
        targetEmail: cleanText(updated.handlerEmail),
        recordId: updated.id,
        unitCode: cleanText(updated.handlerUnitCode),
        occurredAt: now,
        payloadJson: JSON.stringify({
          actorName: actor.actorMeta.actorName,
          actorUsername: actor.actorMeta.actorUsername,
          round,
          result: payload.result,
          changes: buildCaseChanges(existing.item, updated)
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
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getEntryByCaseId(caseId);
      if (!existing) throw createError('Corrective action not found.', 404);
      if (!requestAuthz.canReviewCorrectiveAction(authz, existing.item)) {
        throw requestAuthz.createHttpError('You do not have permission to review tracking for this corrective action.', 403);
      }
      if (existing.item.status !== STATUSES.TRACKING || !existing.item.pendingTracking) {
        throw createError('There is no pending tracking submission to review.', 409);
      }
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ACTIONS.TRACKING_REVIEW);
      const payload = normalizeTrackingReviewPayload(envelope.payload);
      validateTrackingReviewPayload(payload);
      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const actor = buildActor(authz, payload, authz.username);
      const pending = existing.item.pendingTracking;
      const shouldClose = payload.decision === TRACKING_REVIEW_DECISIONS.CLOSE;
      const finalResult = shouldClose ? '\u540c\u610f\u7d50\u6848' : '\u540c\u610f\u7e7c\u7e8c\u8ffd\u8e64';
      const approvedTracking = {
        ...pending,
        requestedResult: pending.result,
        result: finalResult,
        decision: finalResult,
        reviewer: actor.actorLabel,
        reviewDate: today,
        reviewedAt: now
      };
      const nextRound = pending.round || ((existing.item.trackings || []).length + 1);
      let nextHistory = appendHistory(existing.item.history, `\u5be9\u6838\u7b2c ${nextRound} \u6b21\u8ffd\u8e64`, actor.actorLabel, now);
      nextHistory = nextHistory.concat([{
        time: now,
        action: finalResult,
        user: actor.actorLabel
      }]);
      if (!shouldClose && pending.nextTrackDate) {
        nextHistory = nextHistory.concat([{
          time: now,
          action: `\u4e0b\u6b21\u8ffd\u8e64\u65e5\u671f\uff1a${pending.nextTrackDate}`,
          user: actor.actorLabel
        }]);
      }
      const nextItem = {
        ...existing.item,
        trackings: (existing.item.trackings || []).concat([approvedTracking]),
        pendingTracking: null,
        status: shouldClose ? STATUSES.CLOSED : STATUSES.TRACKING,
        reviewResult: finalResult,
        reviewNextDate: shouldClose ? '' : cleanText(pending.nextTrackDate),
        reviewer: actor.actorLabel,
        reviewDate: today,
        updatedAt: now,
        closedDate: shouldClose ? now : '',
        evidence: (existing.item.evidence || []).concat(Array.isArray(pending.evidence) ? pending.evidence : []),
        history: nextHistory
      };
      const updated = await updateCaseRecord(existing, nextItem);
      await createAuditRow({
        eventType: 'corrective_action.tracking_reviewed',
        actorEmail: actor.actorMeta.actorEmail,
        targetEmail: cleanText(updated.handlerEmail),
        recordId: updated.id,
        unitCode: cleanText(updated.handlerUnitCode),
        occurredAt: now,
        payloadJson: JSON.stringify({
          actorName: actor.actorMeta.actorName,
          actorUsername: actor.actorMeta.actorUsername,
          decision: payload.decision,
          finalResult,
          changes: buildCaseChanges(existing.item, updated)
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
