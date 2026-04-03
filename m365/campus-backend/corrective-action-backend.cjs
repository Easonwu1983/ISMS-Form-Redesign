// @ts-check
'use strict';

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
const {
  buildHtmlDocument
} = require('./graph-mailer.cjs');
const db = require('./db.cjs');

function parseJsonField(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return null; }
}

function mapRowToCase(row) {
  if (!row) return null;
  return {
    id: row.case_id || '',
    documentNo: row.document_no || '',
    caseSeq: row.case_seq || 0,
    proposerUnit: row.proposer_unit || '',
    proposerUnitCode: row.proposer_unit_code || '',
    proposerName: row.proposer_name || '',
    proposerUsername: row.proposer_username || '',
    proposerDate: row.proposer_date ? new Date(row.proposer_date).toISOString() : '',
    handlerUnit: row.handler_unit || '',
    handlerUnitCode: row.handler_unit_code || '',
    handlerName: row.handler_name || '',
    handlerUsername: row.handler_username || '',
    handlerEmail: row.handler_email || '',
    handlerDate: row.handler_date ? new Date(row.handler_date).toISOString() : '',
    deficiencyType: row.deficiency_type || '',
    source: row.source || '',
    category: parseJsonField(row.category_json) || [],
    clause: row.clause || '',
    problemDesc: row.problem_description || '',
    occurrence: row.occurrence || '',
    correctiveAction: row.corrective_action || '',
    correctiveDueDate: row.corrective_due_date ? new Date(row.corrective_due_date).toISOString() : '',
    rootCause: row.root_cause || '',
    riskDesc: row.risk_description || '',
    riskAcceptor: row.risk_acceptor || '',
    riskAcceptDate: row.risk_accept_date ? new Date(row.risk_accept_date).toISOString() : '',
    riskAssessDate: row.risk_assess_date ? new Date(row.risk_assess_date).toISOString() : '',
    rootElimination: row.root_elimination || '',
    rootElimDueDate: row.root_elimination_due_date ? new Date(row.root_elimination_due_date).toISOString() : '',
    reviewResult: row.review_result || '',
    reviewNextDate: row.review_next_date ? new Date(row.review_next_date).toISOString() : '',
    reviewer: row.reviewer || '',
    reviewDate: row.review_date ? new Date(row.review_date).toISOString() : '',
    pendingTracking: parseJsonField(row.pending_tracking_json),
    trackings: parseJsonField(row.trackings_json) || [],
    status: row.status || '',
    evidence: parseJsonField(row.evidence_json) || [],
    history: parseJsonField(row.history_json) || [],
    closedDate: row.closed_date ? new Date(row.closed_date).toISOString() : '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
    backendMode: row.backend_mode || '',
    recordSource: row.record_source || ''
  };
}

const CASE_SELECT = `
  SELECT id, case_id, document_no, case_seq, proposer_unit, proposer_unit_code,
         proposer_name, proposer_username, proposer_date, handler_unit, handler_unit_code,
         handler_name, handler_username, handler_email, handler_date,
         deficiency_type, source, category_json, clause, problem_description, occurrence,
         corrective_action, corrective_due_date, root_cause, risk_description,
         risk_acceptor, risk_accept_date, risk_assess_date,
         root_elimination, root_elimination_due_date,
         review_result, review_next_date, reviewer, review_date,
         pending_tracking_json, trackings_json, status,
         evidence_json, history_json, closed_date,
         backend_mode, record_source, created_at, updated_at
  FROM corrective_actions
`;

function createCorrectiveActionRouter(deps) {
  const { parseJsonBody, writeJson, requestAuthz, sendGraphMail } = deps;
  const graphRequest = deps.graphRequest;
  const getDelegatedToken = deps.getDelegatedToken;

  function routeCaseId(value) { return decodeURIComponent(String(value || '').trim()); }

  function actorLabel(payload, fallback) {
    return cleanText(payload && (payload.actorName || payload.actorUsername)) || fallback || 'system';
  }

  function appendHistory(history, action, user, time) {
    return (Array.isArray(history) ? history : []).concat([{
      time: cleanText(time) || new Date().toISOString(),
      action: cleanText(action), user: cleanText(user) || 'system'
    }]);
  }

  function buildActor(authz, payload, fallback) {
    const actorMeta = requestAuthz.buildActorDetails(authz);
    return {
      actorMeta,
      actorLabel: actorLabel(payload, actorMeta.actorName || actorMeta.actorUsername || fallback || 'system')
    };
  }

  function buildStatusHistory(status) { return `狀態變更為「${status}」`; }

  function buildCaseSnapshot(item) {
    if (!item) return null;
    return {
      id: cleanText(item.id), proposerUnit: cleanText(item.proposerUnit),
      handlerUnit: cleanText(item.handlerUnit), handlerUsername: cleanText(item.handlerUsername),
      deficiencyType: cleanText(item.deficiencyType), status: cleanText(item.status),
      evidence: summarizeAttachments(item.evidence),
      trackingsCount: Array.isArray(item.trackings) ? item.trackings.length : 0
    };
  }

  function buildCaseChanges(beforeItem, afterItem) {
    const beforeEvidence = summarizeAttachments(beforeItem && beforeItem.evidence);
    const afterEvidence = summarizeAttachments(afterItem && afterItem.evidence);
    return buildFieldChanges(beforeItem, afterItem, [
      'proposerUnit', 'proposerName', 'handlerUnit', 'handlerName', 'handlerUsername',
      'handlerEmail', 'deficiencyType', 'source', { key: 'category', kind: 'array' },
      'clause', 'problemDesc', 'occurrence', 'correctiveAction', 'correctiveDueDate',
      'rootCause', 'riskDesc', 'riskAcceptor', 'riskAcceptDate', 'riskAssessDate',
      'rootElimination', 'rootElimDueDate', 'reviewResult', 'reviewNextDate',
      'reviewer', 'reviewDate', 'status', 'closedDate',
      { label: 'evidenceCount', kind: 'number', get: (item) => item === beforeItem ? beforeEvidence.count : afterEvidence.count },
      { label: 'trackingCount', kind: 'number', get: (item) => Array.isArray(item && item.trackings) ? item.trackings.length : 0 },
      { label: 'pendingTrackingResult', get: (item) => item && item.pendingTracking && item.pendingTracking.result },
      { label: 'pendingTrackingNextDate', get: (item) => item && item.pendingTracking && item.pendingTracking.nextTrackDate }
    ]);
  }

  function buildStatusChangeMail(item, oldStatus, newStatus, actorLabel) {
    const portalUrl = cleanText(process.env.ISMS_PORTAL_URL) || 'https://isms-campus-portal.pages.dev/';
    const statusLabels = {
      '待矯正': '等待您提交矯正措施',
      '已提案': '處理人已提交矯正措施，等待管理者審核',
      '審核中': '管理者正在審核',
      '追蹤中': '審核通過，需要追蹤成效',
      '結案': '矯正單已結案',
      '退回': '已退回，請重新修改矯正措施'
    };
    const actionHint = statusLabels[newStatus] || '狀態已更新';
    return {
      subject: 'ISMS 矯正單狀態更新：' + cleanText(item && item.id) + ' → ' + newStatus,
      html: buildHtmlDocument([
        '您好，',
        '您相關的矯正單狀態已更新：',
        '單號：' + cleanText(item && item.id),
        '所屬單位：' + cleanText(item && item.handlerUnit),
        '狀態：' + oldStatus + ' → ' + newStatus,
        '說明：' + actionHint,
        '操作者：' + (actorLabel || '系統'),
        '直接查看：' + portalUrl + '#detail/' + cleanText(item && item.id),
        '系統入口：' + portalUrl
      ])
    };
  }

  async function trySendStatusChangeMail(item, oldStatus, newStatus, actorLabel, recipientEmail) {
    if (!recipientEmail) {
      console.warn('[corrective-actions] status change mail skipped: no recipient for ' + cleanText(item && item.id) + ' (' + oldStatus + ' → ' + newStatus + ')');
      return { sent: false, reason: 'no-recipient' };
    }
    try {
      if (typeof graphRequest !== 'function' || typeof getDelegatedToken !== 'function') {
        console.warn('[corrective-actions] Graph mail not available, logging status change: ' + cleanText(item && item.id) + ' ' + oldStatus + ' → ' + newStatus + ' → ' + recipientEmail);
        return { sent: false, reason: 'graph-mail-unavailable' };
      }
      return await sendGraphMail({
        graphRequest, getDelegatedToken,
        to: recipientEmail,
        ...buildStatusChangeMail(item, oldStatus, newStatus, actorLabel)
      });
    } catch (err) {
      console.warn('[corrective-actions] status change mail failed for ' + cleanText(item && item.id) + ':', String(err && err.message || err));
      return { sent: false, reason: 'send-failed', error: String(err && err.message || err) };
    }
  }

  function buildAssignmentMail(item) {
    const portalUrl = cleanText(process.env.ISMS_PORTAL_URL) || 'https://isms-campus-portal.pages.dev/';
    return {
      subject: `ISMS 矯正單指派通知：${cleanText(item && item.id)}`,
      html: buildHtmlDocument([
        `您好，${cleanText(item && item.handlerName) || cleanText(item && item.handlerUsername)}：`,
        '您有一筆新的矯正單指派待處理。',
        `單號：${cleanText(item && item.id)}`, `所屬單位：${cleanText(item && item.handlerUnit)}`,
        `缺失類型：${cleanText(item && item.deficiencyType)}`, `問題說明：${cleanText(item && item.problemDesc)}`,
        `預定完成日：${cleanText(item && item.correctiveDueDate)}`,
        `直接處理：${portalUrl}#detail/${cleanText(item && item.id)}`,
        `系統入口：${portalUrl}`
      ])
    };
  }

  async function createAuditRow(input) {
    try {
      await db.query(`
        INSERT INTO ops_audit (title, event_type, actor_email, target_email, unit_code, record_id, occurred_at, payload_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [
        cleanText(input.recordId || input.eventType || 'audit'), cleanText(input.eventType),
        cleanText(input.actorEmail), cleanText(input.targetEmail), cleanText(input.unitCode),
        cleanText(input.recordId), cleanText(input.occurredAt) || new Date().toISOString(),
        cleanText(input.payloadJson)
      ]);
    } catch (error) {
      console.error('[corrective-actions] audit row failed', String(error && error.message || error));
    }
  }

  async function getEntryByCaseId(caseId) {
    const target = cleanText(caseId);
    if (!target) throw createError('Missing corrective-action id.', 400);
    const row = await db.queryOne(CASE_SELECT + ` WHERE case_id = $1`, [target]);
    if (!row) return null;
    return { listItemId: String(row.id), item: mapRowToCase(row) };
  }

  async function updateCaseRecord(existingEntry, nextItem) {
    const normalized = normalizeStoredCase(nextItem);
    const now = normalized.updatedAt || new Date().toISOString();
    await db.query(`
      UPDATE corrective_actions SET
        corrective_action = $2, corrective_due_date = $3, root_cause = $4,
        risk_description = $5, risk_acceptor = $6, risk_accept_date = $7, risk_assess_date = $8,
        root_elimination = $9, root_elimination_due_date = $10,
        review_result = $11, review_next_date = $12, reviewer = $13, review_date = $14,
        pending_tracking_json = $15, trackings_json = $16,
        status = $17, evidence_json = $18, history_json = $19,
        closed_date = $20, updated_at = $21
      WHERE id = $1
    `, [
      Number(existingEntry.listItemId),
      cleanText(normalized.correctiveAction), normalized.correctiveDueDate || null,
      cleanText(normalized.rootCause), cleanText(normalized.riskDesc),
      cleanText(normalized.riskAcceptor), normalized.riskAcceptDate || null,
      normalized.riskAssessDate || null, cleanText(normalized.rootElimination),
      normalized.rootElimDueDate || null, cleanText(normalized.reviewResult),
      normalized.reviewNextDate || null, cleanText(normalized.reviewer),
      normalized.reviewDate || null,
      JSON.stringify(normalized.pendingTracking || null),
      JSON.stringify(normalized.trackings || []),
      cleanText(normalized.status), JSON.stringify(normalized.evidence || []),
      JSON.stringify(normalized.history || []),
      normalized.closedDate || null, now
    ]);
    return normalized;
  }

  async function createCaseInDb(item) {
    const now = item.createdAt || new Date().toISOString();
    await db.query(`
      INSERT INTO corrective_actions (
        case_id, document_no, case_seq, proposer_unit, proposer_unit_code,
        proposer_name, proposer_username, proposer_date, handler_unit, handler_unit_code,
        handler_name, handler_username, handler_email, handler_date,
        deficiency_type, source, category_json, clause, problem_description, occurrence,
        corrective_action, corrective_due_date, root_cause, risk_description,
        risk_acceptor, risk_accept_date, risk_assess_date,
        root_elimination, root_elimination_due_date,
        review_result, review_next_date, reviewer, review_date,
        pending_tracking_json, trackings_json, status,
        evidence_json, history_json, closed_date,
        backend_mode, record_source, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42)
    `, [
      cleanText(item.id), cleanText(item.documentNo), item.caseSeq || 0,
      cleanText(item.proposerUnit), cleanText(item.proposerUnitCode),
      cleanText(item.proposerName), cleanText(item.proposerUsername),
      item.proposerDate || now,
      cleanText(item.handlerUnit), cleanText(item.handlerUnitCode),
      cleanText(item.handlerName), cleanText(item.handlerUsername),
      cleanText(item.handlerEmail), item.handlerDate || null,
      cleanText(item.deficiencyType), cleanText(item.source),
      JSON.stringify(item.category || []), cleanText(item.clause),
      cleanText(item.problemDesc), cleanText(item.occurrence),
      cleanText(item.correctiveAction), item.correctiveDueDate || null,
      cleanText(item.rootCause), cleanText(item.riskDesc),
      cleanText(item.riskAcceptor), item.riskAcceptDate || null,
      item.riskAssessDate || null, cleanText(item.rootElimination),
      item.rootElimDueDate || null,
      cleanText(item.reviewResult), item.reviewNextDate || null,
      cleanText(item.reviewer), item.reviewDate || null,
      JSON.stringify(item.pendingTracking || null),
      JSON.stringify(item.trackings || []),
      cleanText(item.status),
      JSON.stringify(item.evidence || []),
      JSON.stringify(item.history || []),
      item.closedDate || null,
      'pg-campus-backend', 'frontend', now, now
    ]);
  }

  // ── Handlers ──────────────────────────────────────────────

  async function buildHealth() {
    const dbHealth = await db.healthCheck();
    return { ok: dbHealth.ok, ready: dbHealth.ok, contractVersion: CONTRACT_VERSION, repository: 'postgresql', database: dbHealth };
  }

  async function handleHealth(_req, res, origin) {
    try { await writeJson(res, buildJsonResponse(200, await buildHealth()), origin); }
    catch (error) { await writeJson(res, buildErrorResponse(error, 'Failed to read corrective-action backend health.', 500), origin); }
  }

  async function handleList(req, res, origin, url) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      // Push filters to SQL to avoid full table scan
      const conditions = [];
      const params = [];
      let idx = 0;

      // Authorization filter (push to SQL when possible)
      if (!requestAuthz.isAdmin(authz)) {
        const accessUnits = requestAuthz.getAccessUnits ? requestAuthz.getAccessUnits(authz) : [];
        const username = authz.username || '';
        const orClauses = [];
        if (username) {
          idx++; orClauses.push(`handler_username = $${idx}`); params.push(username);
          idx++; orClauses.push(`proposer_username = $${idx}`); params.push(username);
        }
        if (accessUnits.length > 0) {
          idx++; orClauses.push(`handler_unit = ANY($${idx})`); params.push(accessUnits);
        }
        if (orClauses.length > 0) {
          conditions.push(`(${orClauses.join(' OR ')})`);
        }
      }

      // User-supplied filters
      const status = cleanText(url.searchParams.get('status'));
      const handlerUnit = cleanText(url.searchParams.get('handlerUnit'));
      const handlerUsername = cleanText(url.searchParams.get('handlerUsername'));
      const query = cleanText(url.searchParams.get('q')).toLowerCase();

      if (status) { idx++; conditions.push(`status = $${idx}`); params.push(status); }
      if (handlerUnit) { idx++; conditions.push(`handler_unit = $${idx}`); params.push(handlerUnit); }
      if (handlerUsername) { idx++; conditions.push(`handler_username = $${idx}`); params.push(handlerUsername); }
      if (query) {
        idx++;
        conditions.push(`(
          LOWER(case_id) LIKE $${idx} OR LOWER(proposer_name) LIKE $${idx}
          OR LOWER(handler_name) LIKE $${idx} OR LOWER(problem_description) LIKE $${idx}
          OR LOWER(deficiency_type) LIKE $${idx} OR LOWER(source) LIKE $${idx}
        )`);
        params.push(`%${query}%`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = await db.queryAll(CASE_SELECT + ` ${where} ORDER BY updated_at DESC`, params);
      const items = rows.map(mapRowToCase);
      await writeJson(res, buildJsonResponse(200, { ok: true, items: items.map(mapCaseForClient), contractVersion: CONTRACT_VERSION }), origin);
    } catch (error) { await writeJson(res, buildErrorResponse(error, 'Failed to list corrective actions.', 500), origin); }
  }

  async function handleDetail(req, res, origin, caseId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getEntryByCaseId(caseId);
      if (!existing) throw createError('Corrective action not found.', 404);
      if (!requestAuthz.canAccessCorrectiveAction(authz, existing.item)) throw requestAuthz.createHttpError('Forbidden', 403);
      await writeJson(res, buildJsonResponse(200, { ok: true, item: mapCaseForClient(existing.item), contractVersion: CONTRACT_VERSION }), origin);
    } catch (error) { await writeJson(res, buildErrorResponse(error, 'Failed to read corrective action detail.', 500), origin); }
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
      if (existing) throw createError('Corrective action already exists.', 409);
      const now = new Date().toISOString();
      const actor = buildActor(authz, payload, payload.proposerName);
      const item = createCaseRecord({
        ...payload,
        history: [
          { time: now, action: '開立矯正單', user: actor.actorLabel },
          { time: now, action: buildStatusHistory(STATUSES.PENDING), user: actor.actorLabel }
        ]
      }, now);
      await createCaseInDb(item);
      await createAuditRow({
        eventType: 'corrective_action.created', actorEmail: actor.actorMeta.actorEmail,
        targetEmail: cleanText(item.handlerEmail), unitCode: cleanText(item.handlerUnitCode),
        recordId: item.id, occurredAt: now,
        payloadJson: JSON.stringify({ actorName: actor.actorMeta.actorName, actorUsername: actor.actorMeta.actorUsername, snapshot: buildCaseSnapshot(item), changes: buildCaseChanges(null, item) })
      });
      const shouldNotify = envelope && envelope.payload && envelope.payload.notifyHandler !== false;
      const notification = shouldNotify && item.handlerEmail
        ? await sendGraphMail({ graphRequest, getDelegatedToken, to: item.handlerEmail, ...buildAssignmentMail(item) })
        : { sent: false, channel: 'graph-mail', reason: shouldNotify ? 'missing-recipient' : 'disabled' };
      if (shouldNotify) {
        await createAuditRow({
          eventType: notification.sent ? 'corrective_action.notification_sent' : 'corrective_action.notification_failed',
          actorEmail: actor.actorMeta.actorEmail, targetEmail: cleanText(item.handlerEmail),
          unitCode: cleanText(item.handlerUnitCode), recordId: item.id, occurredAt: now,
          payloadJson: JSON.stringify({ actorName: actor.actorMeta.actorName, actorUsername: actor.actorMeta.actorUsername, notification })
        });
      }
      await writeJson(res, buildJsonResponse(201, { ok: true, item: mapCaseForClient(item), notification, contractVersion: CONTRACT_VERSION }), origin);
    } catch (error) { await writeJson(res, buildErrorResponse(error, 'Failed to create corrective action.'), origin); }
  }

  async function handleRespond(req, res, origin, caseId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getEntryByCaseId(caseId);
      if (!existing) throw createError('Corrective action not found.', 404);
      if (!requestAuthz.canRespondCorrectiveAction(authz, existing.item)) throw requestAuthz.createHttpError('Forbidden', 403);
      if (existing.item.status !== STATUSES.PENDING) throw createError('Not in pending status.', 409);
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ACTIONS.RESPOND);
      const payload = normalizeRespondPayload(envelope.payload);
      validateRespondPayload(payload);
      const now = new Date().toISOString();
      const actor = buildActor(authz, payload, existing.item.handlerName || authz.username);
      let history = appendHistory(existing.item.history, `${actor.actorLabel} 提交矯正措施提案`, actor.actorLabel, now);
      history = appendHistory(history, buildStatusHistory(STATUSES.PROPOSED), actor.actorLabel, now);
      if (payload.evidence.length) history = history.concat([{ time: now, action: `已上傳 ${payload.evidence.length} 份佐證`, user: actor.actorLabel }]);
      const nextItem = {
        ...existing.item, correctiveAction: payload.correctiveAction,
        correctiveDueDate: payload.correctiveDueDate || existing.item.correctiveDueDate,
        rootCause: payload.rootCause, rootElimination: payload.rootElimination,
        rootElimDueDate: payload.rootElimDueDate, riskDesc: payload.riskDesc,
        riskAcceptor: payload.riskAcceptor, riskAcceptDate: payload.riskAcceptDate,
        riskAssessDate: payload.riskAssessDate,
        evidence: (existing.item.evidence || []).concat(payload.evidence || []),
        status: STATUSES.PROPOSED, updatedAt: now, history
      };
      const updated = await updateCaseRecord(existing, nextItem);
      await createAuditRow({ eventType: 'corrective_action.responded', actorEmail: actor.actorMeta.actorEmail, targetEmail: cleanText(updated.handlerEmail), unitCode: cleanText(updated.handlerUnitCode), recordId: updated.id, occurredAt: now, payloadJson: JSON.stringify({ actorName: actor.actorMeta.actorName, actorUsername: actor.actorMeta.actorUsername, changes: buildCaseChanges(existing.item, updated) }) });
      // Notify admin that handler has responded
      trySendStatusChangeMail(updated, STATUSES.PENDING, STATUSES.PROPOSED, actor.actorLabel, cleanText(process.env.ISMS_ADMIN_EMAIL));
      await writeJson(res, buildJsonResponse(200, { ok: true, item: mapCaseForClient(updated), contractVersion: CONTRACT_VERSION }), origin);
    } catch (error) { await writeJson(res, buildErrorResponse(error, 'Failed to respond corrective action.'), origin); }
  }

  async function handleReview(req, res, origin, caseId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getEntryByCaseId(caseId);
      if (!existing) throw createError('Corrective action not found.', 404);
      if (!requestAuthz.canReviewCorrectiveAction(authz, existing.item)) throw requestAuthz.createHttpError('Forbidden', 403);
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ACTIONS.REVIEW);
      const payload = normalizeReviewPayload(envelope.payload);
      validateReviewPayload(payload);
      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const actor = buildActor(authz, payload, authz.username);
      let nextStatus = '', reviewResult = '';
      if (payload.decision === REVIEW_DECISIONS.START_REVIEW) {
        if (existing.item.status !== STATUSES.PROPOSED) throw createError('Must be proposed first.', 409);
        nextStatus = STATUSES.REVIEWING; reviewResult = '開始審核';
      } else {
        if (existing.item.status !== STATUSES.REVIEWING) throw createError('Not in reviewing status.', 409);
        if (payload.decision === REVIEW_DECISIONS.CLOSE) { nextStatus = STATUSES.CLOSED; reviewResult = '同意結案'; }
        else if (payload.decision === REVIEW_DECISIONS.TRACKING) { nextStatus = STATUSES.TRACKING; reviewResult = '轉持續追蹤'; }
        else if (payload.decision === REVIEW_DECISIONS.RETURN) { nextStatus = STATUSES.PENDING; reviewResult = '退回更正'; }
      }
      const history = appendHistory(existing.item.history, buildStatusHistory(nextStatus), actor.actorLabel, now);
      const nextItem = { ...existing.item, status: nextStatus, reviewResult, reviewer: actor.actorLabel, reviewDate: today, updatedAt: now, closedDate: nextStatus === STATUSES.CLOSED ? now : '', pendingTracking: nextStatus === STATUSES.PENDING ? null : existing.item.pendingTracking, history };
      const updated = await updateCaseRecord(existing, nextItem);
      await createAuditRow({ eventType: 'corrective_action.reviewed', actorEmail: actor.actorMeta.actorEmail, targetEmail: cleanText(updated.handlerEmail), recordId: updated.id, unitCode: cleanText(updated.handlerUnitCode), occurredAt: now, payloadJson: JSON.stringify({ actorName: actor.actorMeta.actorName, actorUsername: actor.actorMeta.actorUsername, decision: payload.decision, changes: buildCaseChanges(existing.item, updated) }) });
      // Notify handler about review result
      trySendStatusChangeMail(updated, existing.item.status, nextStatus, actor.actorLabel, cleanText(updated.handlerEmail));
      await writeJson(res, buildJsonResponse(200, { ok: true, item: mapCaseForClient(updated), contractVersion: CONTRACT_VERSION }), origin);
    } catch (error) { await writeJson(res, buildErrorResponse(error, 'Failed to review corrective action.'), origin); }
  }

  async function handleTrackingSubmit(req, res, origin, caseId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getEntryByCaseId(caseId);
      if (!existing) throw createError('Corrective action not found.', 404);
      if (!requestAuthz.canRespondCorrectiveAction(authz, existing.item)) throw requestAuthz.createHttpError('Forbidden', 403);
      if (existing.item.status !== STATUSES.TRACKING) throw createError('Not in tracking status.', 409);
      if (existing.item.pendingTracking) throw createError('Already has pending tracking.', 409);
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ACTIONS.TRACKING_SUBMIT);
      const payload = normalizeTrackingSubmitPayload(envelope.payload);
      validateTrackingSubmitPayload(payload);
      const now = new Date().toISOString();
      const actor = buildActor(authz, payload, existing.item.handlerName || authz.username);
      const round = Array.isArray(existing.item.trackings) ? existing.item.trackings.length + 1 : 1;
      const pendingTracking = { round, tracker: payload.tracker, trackDate: payload.trackDate, execution: payload.execution, trackNote: payload.trackNote, result: payload.result, nextTrackDate: payload.result === TRACKING_RESULTS.CONTINUE ? payload.nextTrackDate : '', evidence: payload.evidence, submittedAt: now };
      let history = appendHistory(existing.item.history, `提交第 ${round} 次追蹤`, actor.actorLabel, now);
      history = history.concat([{ time: now, action: `追蹤提報：${payload.result}`, user: actor.actorLabel }]);
      if (pendingTracking.nextTrackDate) history = history.concat([{ time: now, action: `下次追蹤日期：${pendingTracking.nextTrackDate}`, user: actor.actorLabel }]);
      if (payload.evidence.length) history = history.concat([{ time: now, action: `已上傳 ${payload.evidence.length} 份追蹤佐證`, user: actor.actorLabel }]);
      const nextItem = { ...existing.item, pendingTracking, updatedAt: now, history };
      const updated = await updateCaseRecord(existing, nextItem);
      await createAuditRow({ eventType: 'corrective_action.tracking_submitted', actorEmail: actor.actorMeta.actorEmail, targetEmail: cleanText(updated.handlerEmail), recordId: updated.id, unitCode: cleanText(updated.handlerUnitCode), occurredAt: now, payloadJson: JSON.stringify({ actorName: actor.actorMeta.actorName, actorUsername: actor.actorMeta.actorUsername, round, result: payload.result, changes: buildCaseChanges(existing.item, updated) }) });
      // Notify admin that tracking has been submitted
      trySendStatusChangeMail(updated, STATUSES.TRACKING, '追蹤中（已提交追蹤報告）', actor.actorLabel, cleanText(process.env.ISMS_ADMIN_EMAIL));
      await writeJson(res, buildJsonResponse(200, { ok: true, item: mapCaseForClient(updated), contractVersion: CONTRACT_VERSION }), origin);
    } catch (error) { await writeJson(res, buildErrorResponse(error, 'Failed to submit tracking.'), origin); }
  }

  async function handleTrackingReview(req, res, origin, caseId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getEntryByCaseId(caseId);
      if (!existing) throw createError('Corrective action not found.', 404);
      if (!requestAuthz.canReviewCorrectiveAction(authz, existing.item)) throw requestAuthz.createHttpError('Forbidden', 403);
      if (existing.item.status !== STATUSES.TRACKING || !existing.item.pendingTracking) throw createError('No pending tracking to review.', 409);
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ACTIONS.TRACKING_REVIEW);
      const payload = normalizeTrackingReviewPayload(envelope.payload);
      validateTrackingReviewPayload(payload);
      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const actor = buildActor(authz, payload, authz.username);
      const pending = existing.item.pendingTracking;
      const shouldClose = payload.decision === TRACKING_REVIEW_DECISIONS.CLOSE;
      const finalResult = shouldClose ? '同意結案' : '同意繼續追蹤';
      const approvedTracking = { ...pending, requestedResult: pending.result, result: finalResult, decision: finalResult, reviewer: actor.actorLabel, reviewDate: today, reviewedAt: now };
      const nextRound = pending.round || ((existing.item.trackings || []).length + 1);
      let history = appendHistory(existing.item.history, `審核第 ${nextRound} 次追蹤`, actor.actorLabel, now);
      history = history.concat([{ time: now, action: finalResult, user: actor.actorLabel }]);
      if (!shouldClose && pending.nextTrackDate) history = history.concat([{ time: now, action: `下次追蹤日期：${pending.nextTrackDate}`, user: actor.actorLabel }]);
      const nextItem = {
        ...existing.item, trackings: (existing.item.trackings || []).concat([approvedTracking]),
        pendingTracking: null, status: shouldClose ? STATUSES.CLOSED : STATUSES.TRACKING,
        reviewResult: finalResult, reviewNextDate: shouldClose ? '' : cleanText(pending.nextTrackDate),
        reviewer: actor.actorLabel, reviewDate: today, updatedAt: now,
        closedDate: shouldClose ? now : '', evidence: (existing.item.evidence || []).concat(Array.isArray(pending.evidence) ? pending.evidence : []),
        history
      };
      const updated = await updateCaseRecord(existing, nextItem);
      await createAuditRow({ eventType: 'corrective_action.tracking_reviewed', actorEmail: actor.actorMeta.actorEmail, targetEmail: cleanText(updated.handlerEmail), recordId: updated.id, unitCode: cleanText(updated.handlerUnitCode), occurredAt: now, payloadJson: JSON.stringify({ actorName: actor.actorMeta.actorName, actorUsername: actor.actorMeta.actorUsername, decision: payload.decision, finalResult, changes: buildCaseChanges(existing.item, updated) }) });
      // Notify handler about tracking review result
      trySendStatusChangeMail(updated, STATUSES.TRACKING, shouldClose ? STATUSES.CLOSED : STATUSES.TRACKING, actor.actorLabel, cleanText(updated.handlerEmail));
      await writeJson(res, buildJsonResponse(200, { ok: true, item: mapCaseForClient(updated), contractVersion: CONTRACT_VERSION }), origin);
    } catch (error) { await writeJson(res, buildErrorResponse(error, 'Failed to review tracking submission.'), origin); }
  }

  async function handleDelete(req, res, origin, caseId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      requestAuthz.requireAdmin(authz, 'Only administrators can delete corrective actions.');
      const existing = await getEntryByCaseId(caseId);
      if (!existing) throw createError('Corrective action not found.', 404);
      await db.query('DELETE FROM corrective_actions WHERE case_id = $1', [caseId]);
      const now = new Date().toISOString();
      await createAuditRow({
        eventType: 'corrective_action.deleted', actorEmail: cleanText(authz && authz.user && authz.user.email),
        targetEmail: '', unitCode: cleanText(existing.item && existing.item.handlerUnitCode),
        recordId: caseId, occurredAt: now,
        payloadJson: JSON.stringify({ snapshot: buildCaseSnapshot(existing.item) })
      });
      await writeJson(res, buildJsonResponse(200, { ok: true, deletedId: caseId, contractVersion: CONTRACT_VERSION }), origin);
    } catch (error) { await writeJson(res, buildErrorResponse(error, 'Failed to delete corrective action.'), origin); }
  }

  async function tryHandle(req, res, origin, url) {
    const pathname = cleanText(url && url.pathname);
    if (pathname === '/api/corrective-actions/health') { await handleHealth(req, res, origin); return true; }
    if (pathname === '/api/corrective-actions' && req.method === 'GET') { await handleList(req, res, origin, url); return true; }
    if (pathname === '/api/corrective-actions' && req.method === 'POST') { await handleCreate(req, res, origin); return true; }
    const detailMatch = pathname.match(/^\/api\/corrective-actions\/([^/]+)$/);
    if (detailMatch && req.method === 'GET') { await handleDetail(req, res, origin, routeCaseId(detailMatch[1])); return true; }
    const deleteMatch = pathname.match(/^\/api\/corrective-actions\/([^/]+)\/delete$/);
    if (deleteMatch && req.method === 'POST') { await handleDelete(req, res, origin, routeCaseId(deleteMatch[1])); return true; }
    const respondMatch = pathname.match(/^\/api\/corrective-actions\/([^/]+)\/respond$/);
    if (respondMatch && req.method === 'POST') { await handleRespond(req, res, origin, routeCaseId(respondMatch[1])); return true; }
    const reviewMatch = pathname.match(/^\/api\/corrective-actions\/([^/]+)\/review$/);
    if (reviewMatch && req.method === 'POST') { await handleReview(req, res, origin, routeCaseId(reviewMatch[1])); return true; }
    const trackingSubmitMatch = pathname.match(/^\/api\/corrective-actions\/([^/]+)\/tracking-submit$/);
    if (trackingSubmitMatch && req.method === 'POST') { await handleTrackingSubmit(req, res, origin, routeCaseId(trackingSubmitMatch[1])); return true; }
    const trackingReviewMatch = pathname.match(/^\/api\/corrective-actions\/([^/]+)\/tracking-review$/);
    if (trackingReviewMatch && req.method === 'POST') { await handleTrackingReview(req, res, origin, routeCaseId(trackingReviewMatch[1])); return true; }
    return false;
  }

  // ── Overdue check (can be called by cron or API) ──
  async function checkOverdueAndNotify() {
    try {
      const rows = await db.queryAll(`
        SELECT case_id, handler_name, handler_email, handler_unit, corrective_due_date, status
        FROM corrective_actions
        WHERE status NOT IN ('結案')
          AND corrective_due_date < NOW()
          AND corrective_due_date IS NOT NULL
        ORDER BY corrective_due_date
      `);
      if (!rows || !rows.length) { console.log('[overdue-check] No overdue items.'); return { checked: 0, notified: 0 }; }
      console.log('[overdue-check] Found ' + rows.length + ' overdue items.');
      let notified = 0;
      for (const row of rows) {
        const email = cleanText(row.handler_email);
        if (!email) continue;
        const result = await trySendStatusChangeMail(
          { id: row.case_id, handlerUnit: row.handler_unit, handlerName: row.handler_name },
          row.status, '已逾期', '系統自動提醒', email
        );
        if (result && result.sent) notified++;
      }
      // Also notify admin
      const adminEmail = cleanText(process.env.ISMS_ADMIN_EMAIL);
      if (adminEmail && rows.length > 0) {
        await sendGraphMail({
          graphRequest, getDelegatedToken, to: adminEmail,
          subject: 'ISMS 逾期提醒：' + rows.length + ' 筆矯正單已逾期',
          html: buildHtmlDocument([
            '您好，', '目前有 ' + rows.length + ' 筆矯正單已超過預定完成日：',
            ...rows.slice(0, 10).map(function (r) { return r.case_id + '（' + cleanText(r.handler_unit) + ' ' + cleanText(r.handler_name) + '）'; }),
            rows.length > 10 ? '...及其他 ' + (rows.length - 10) + ' 筆' : '',
            '請登入系統查看並追蹤。'
          ])
        }).catch(function () {});
      }
      console.log('[overdue-check] Notified: ' + notified + '/' + rows.length);
      return { checked: rows.length, notified };
    } catch (error) {
      console.error('[overdue-check] Failed:', String(error && error.message || error));
      return { checked: 0, notified: 0, error: String(error && error.message || error) };
    }
  }

  return { tryHandle, checkOverdueAndNotify };
}

module.exports = { createCorrectiveActionRouter };
