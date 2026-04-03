// @ts-check
'use strict';

const {
  ACTIONS,
  CONTRACT_VERSION,
  STATUSES,
  buildErrorResponse,
  buildJsonResponse,
  cleanText,
  createError,
  mapChecklistForClient,
  normalizeChecklistPayload,
  validateActionEnvelope,
  validateChecklistPayload
} = require('../azure-function/checklist-api/src/shared/contract');
const db = require('./db.cjs');

function summarizeChecklists(items) {
  const summary = { total: 0, draft: 0, submitted: 0 };
  (Array.isArray(items) ? items : []).forEach((item) => {
    const status = String(item && item.status || '').trim();
    summary.total += 1;
    if (status === STATUSES.DRAFT) summary.draft += 1;
    else if (status === STATUSES.SUBMITTED) summary.submitted += 1;
  });
  return summary;
}

function mapRowToChecklist(row) {
  if (!row) return null;
  let results = {};
  try {
    results = row.results_json && typeof row.results_json === 'string'
      ? JSON.parse(row.results_json)
      : (row.results_json || {});
  } catch (_) { /* ignore */ }
  const answeredCount = results && typeof results === 'object'
    ? Object.keys(results).filter((k) => {
        const val = results[k];
        return val && (val.compliance || val.execution || val.evidence);
      }).length
    : 0;
  return {
    id: row.checklist_id || '',
    documentNo: row.document_no || '',
    checklistSeq: row.checklist_seq || 0,
    unit: row.unit || '',
    unitCode: row.unit_code || '',
    fillerName: row.filler_name || '',
    fillerUsername: row.filler_username || '',
    fillDate: row.fill_date ? new Date(row.fill_date).toISOString() : '',
    auditYear: row.audit_year || '',
    supervisorName: row.supervisor_name || '',
    supervisorTitle: row.supervisor_title || '',
    signStatus: row.sign_status || '待簽核',
    signDate: row.sign_date ? new Date(row.sign_date).toISOString() : '',
    supervisorNote: row.supervisor_note || '',
    results,
    summary: {
      total: Number(row.summary_total) || 0,
      conform: Number(row.summary_conform) || 0,
      partial: Number(row.summary_partial) || 0,
      nonConform: Number(row.summary_non_conform) || 0,
      na: Number(row.summary_na) || 0
    },
    answeredCount,
    status: row.status || '草稿',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
    backendMode: row.backend_mode || '',
    recordSource: row.record_source || ''
  };
}

const CHECKLIST_SELECT = `
  SELECT id, checklist_id, document_no, checklist_seq, unit, unit_code,
         filler_name, filler_username, fill_date, audit_year,
         supervisor_name, supervisor_title, sign_status, sign_date,
         supervisor_note, results_json,
         summary_total, summary_conform, summary_partial, summary_non_conform, summary_na,
         status, backend_mode, record_source, created_at, updated_at
  FROM checklists
`;

function createChecklistRouter(deps) {
  const { parseJsonBody, writeJson, requestAuthz } = deps;

  async function createAuditRow(input) {
    try {
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
    } catch (error) {
      console.error('[checklists] failed to create audit row', String(error && error.message || error));
    }
  }

  function readFilters(url) {
    const sp = url && url.searchParams ? url.searchParams : new URLSearchParams();
    const limit = Math.max(1, Math.min(200, Number(sp.get('limit')) || 50));
    const offset = Math.max(0, Number(sp.get('offset')) || 0);
    return {
      status: cleanText(sp.get('status')),
      unit: cleanText(sp.get('unit')),
      auditYear: cleanText(sp.get('auditYear')),
      keyword: cleanText(sp.get('keyword')).toLowerCase(),
      summaryOnly: cleanText(sp.get('summaryOnly')) === '1',
      limit,
      offset
    };
  }

  function buildPage(total, limit, offset, returnedCount) {
    const safeTotal = Math.max(0, Number(total) || 0);
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    const pageCount = safeTotal > 0 ? Math.max(1, Math.ceil(safeTotal / safeLimit)) : 0;
    const safeOffset = safeTotal > 0
      ? Math.min(Math.max(0, Number(offset) || 0), Math.max(0, (pageCount - 1) * safeLimit))
      : 0;
    const currentPage = safeTotal > 0 ? Math.floor(safeOffset / safeLimit) + 1 : 0;
    const hasPrev = safeOffset > 0;
    const hasNext = safeTotal > 0 && (safeOffset + safeLimit) < safeTotal;
    return {
      offset: safeOffset, limit: safeLimit, total: safeTotal, pageCount, currentPage,
      hasPrev, hasNext,
      prevOffset: hasPrev ? Math.max(0, safeOffset - safeLimit) : 0,
      nextOffset: hasNext ? safeOffset + safeLimit : safeOffset,
      pageStart: returnedCount ? safeOffset + 1 : 0,
      pageEnd: returnedCount ? safeOffset + returnedCount : 0
    };
  }

  async function queryChecklists(filters, authz) {
    const isAdmin = requestAuthz.isAdmin(authz);
    const conditions = [];
    const params = [];
    let idx = 0;

    if (!isAdmin) {
      const userUnits = Array.isArray(authz.authorizedUnits) ? authz.authorizedUnits : [];
      const username = cleanText(authz.username).toLowerCase();
      if (userUnits.length) {
        idx++; params.push(userUnits);
        idx++; params.push(username);
        conditions.push(`(unit = ANY($${idx - 1}) OR LOWER(filler_username) = $${idx})`);
      } else {
        idx++; conditions.push(`LOWER(filler_username) = $${idx}`); params.push(username);
      }
    }
    if (filters.status) { idx++; conditions.push(`status = $${idx}`); params.push(filters.status); }
    if (filters.unit) { idx++; conditions.push(`unit = $${idx}`); params.push(filters.unit); }
    if (filters.auditYear) { idx++; conditions.push(`audit_year = $${idx}`); params.push(filters.auditYear); }
    if (filters.keyword) {
      idx++;
      conditions.push(`(LOWER(filler_name) LIKE $${idx} OR LOWER(unit) LIKE $${idx} OR LOWER(checklist_id) LIKE $${idx})`);
      params.push(`%${filters.keyword}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const summaryResult = await db.queryOne(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = '草稿')::int AS draft,
             COUNT(*) FILTER (WHERE status = '已送出')::int AS submitted
      FROM checklists ${where}`, params);
    const total = summaryResult ? summaryResult.total : 0;
    const dbSummary = { total, draft: summaryResult ? summaryResult.draft : 0, submitted: summaryResult ? summaryResult.submitted : 0 };

    const pageParams = [...params];
    idx++; pageParams.push(filters.limit);
    idx++; pageParams.push(filters.offset);
    const rows = await db.queryAll(
      CHECKLIST_SELECT + ` ${where} ORDER BY fill_date DESC, id DESC LIMIT $${idx - 1} OFFSET $${idx}`,
      pageParams
    );
    return { items: rows.map(mapRowToChecklist), total, summary: dbSummary };
  }

  async function buildHealth() {
    const dbHealth = await db.healthCheck();
    return {
      ok: dbHealth.ok, ready: dbHealth.ok,
      contractVersion: CONTRACT_VERSION,
      repository: 'postgresql',
      database: { ok: dbHealth.ok, latencyMs: dbHealth.latencyMs }
    };
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
      const filters = readFilters(url);
      const result = await queryChecklists(filters, authz);
      const summary = result.summary || summarizeChecklists(result.items);
      const page = buildPage(result.total, filters.limit, filters.offset, result.items.length);

      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        items: filters.summaryOnly ? [] : result.items.map(mapChecklistForClient),
        total: result.total, summary,
        page: filters.summaryOnly
          ? { ...page, returned: 0, pageStart: 0, pageEnd: 0 }
          : page,
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to list checklists.', 500), origin);
    }
  }

  async function handleDetail(req, res, origin, checklistId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const row = await db.queryOne(CHECKLIST_SELECT + ` WHERE checklist_id = $1`, [checklistId]);
      if (!row) throw createError('Checklist not found', 404);
      const item = mapRowToChecklist(row);
      if (!requestAuthz.canAccessChecklist(authz, item)) throw createError('Forbidden', 403);
      await writeJson(res, buildJsonResponse(200, {
        ok: true, item: mapChecklistForClient(item), contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to read checklist detail.', 500), origin);
    }
  }

  async function writeChecklist(req, res, origin, checklistId, action) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, action);
      const incoming = normalizeChecklistPayload(envelope.payload);
      const existing = await db.queryOne(CHECKLIST_SELECT + ` WHERE checklist_id = $1`, [checklistId]);
      const existingItem = existing ? mapRowToChecklist(existing) : null;

      if (existingItem && !requestAuthz.canEditChecklist(authz, existingItem)) {
        throw createError('Forbidden', 403);
      }
      // New checklist: verify user has access to the target unit
      if (!existingItem && !requestAuthz.isAdmin(authz)) {
        const targetUnit = cleanText(incoming.unit);
        if (targetUnit && !requestAuthz.hasUnitAccess(authz, targetUnit)) {
          throw createError('You do not have access to create a checklist for this unit', 403);
        }
      }

      const now = new Date().toISOString();
      const isSubmit = action === (ACTIONS.SUBMIT || 'SUBMIT');
      const status = isSubmit ? (STATUSES.SUBMITTED || '已送出') : (STATUSES.DRAFT || '草稿');
      const resultsJson = JSON.stringify(incoming.results || {});
      const summary = incoming.summary || { total: 0, conform: 0, partial: 0, nonConform: 0, na: 0 };

      // 送出時強制驗證全部題目已作答
      if (isSubmit) {
        const answeredCount = Object.values(incoming.results || {}).filter(function (r) { return r && cleanText(r.compliance); }).length;
        if (summary.total > 0 && answeredCount < summary.total) {
          throw createError('檢核表仍有 ' + (summary.total - answeredCount) + ' 題未作答，無法正式送出。', 400);
        }
      }

      if (existing) {
        await db.query(`
          UPDATE checklists SET
            unit = $2, unit_code = $3, filler_name = $4, filler_username = $5,
            fill_date = $6, audit_year = $7, supervisor_name = $8, supervisor_title = $9,
            sign_status = $10, sign_date = $11, supervisor_note = $12,
            results_json = $13, summary_total = $14, summary_conform = $15,
            summary_partial = $16, summary_non_conform = $17, summary_na = $18,
            status = $19, backend_mode = $20, record_source = $21, updated_at = $22
          WHERE checklist_id = $1
        `, [
          checklistId,
          cleanText(incoming.unit), cleanText(incoming.unitCode),
          cleanText(incoming.fillerName), cleanText(incoming.fillerUsername),
          incoming.fillDate || now, cleanText(incoming.auditYear),
          cleanText(incoming.supervisorName), cleanText(incoming.supervisorTitle),
          cleanText(incoming.signStatus) || '待簽核', incoming.signDate || null,
          cleanText(incoming.supervisorNote),
          resultsJson, summary.total || 0, summary.conform || 0,
          summary.partial || 0, summary.nonConform || 0, summary.na || 0,
          status, 'pg-campus-backend', 'frontend', now
        ]);
      } else {
        await db.query(`
          INSERT INTO checklists (
            checklist_id, unit, unit_code, filler_name, filler_username,
            fill_date, audit_year, supervisor_name, supervisor_title,
            sign_status, sign_date, supervisor_note,
            results_json, summary_total, summary_conform,
            summary_partial, summary_non_conform, summary_na,
            status, backend_mode, record_source, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
        `, [
          checklistId,
          cleanText(incoming.unit), cleanText(incoming.unitCode),
          cleanText(incoming.fillerName), cleanText(incoming.fillerUsername),
          incoming.fillDate || now, cleanText(incoming.auditYear),
          cleanText(incoming.supervisorName), cleanText(incoming.supervisorTitle),
          cleanText(incoming.signStatus) || '待簽核', incoming.signDate || null,
          cleanText(incoming.supervisorNote),
          resultsJson, summary.total || 0, summary.conform || 0,
          summary.partial || 0, summary.nonConform || 0, summary.na || 0,
          status, 'pg-campus-backend', 'frontend', now, now
        ]);
      }

      const savedRow = await db.queryOne(CHECKLIST_SELECT + ` WHERE checklist_id = $1`, [checklistId]);
      const savedItem = mapRowToChecklist(savedRow);

      const actor = requestAuthz.buildActorDetails(authz);
      await createAuditRow({
        eventType: existing ? `checklist.${action}` : 'checklist.created',
        actorEmail: actor.actorEmail, targetEmail: '',
        unitCode: cleanText(incoming.unitCode), recordId: checklistId,
        occurredAt: now, payloadJson: JSON.stringify({
          action, actorName: actor.actorName, actorUsername: actor.actorUsername
        })
      });

      // 清除 dashboard 快取，確保即時反映最新狀態
      try { require('./api-cache.cjs').clear(); } catch (_) {}

      await writeJson(res, buildJsonResponse(existing ? 200 : 201, {
        ok: true, item: mapChecklistForClient(savedItem), contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, `Failed to ${action} checklist.`, 500), origin);
    }
  }

  async function handleDeleteYear(req, res, origin, auditYear) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      requestAuthz.requireAdmin(authz, 'Only admin can delete checklists by year');
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ACTIONS.DELETE_YEAR || 'DELETE_YEAR');

      const result = await db.query(
        `DELETE FROM checklists WHERE audit_year = $1 RETURNING checklist_id`,
        [cleanText(auditYear)]
      );
      const deletedCount = result.rowCount || 0;
      const deletedIds = result.rows.map((r) => r.checklist_id);

      const now = new Date().toISOString();
      const actor = requestAuthz.buildActorDetails(authz);
      await createAuditRow({
        eventType: 'checklist.delete-year',
        actorEmail: actor.actorEmail, targetEmail: '',
        unitCode: '', recordId: auditYear,
        occurredAt: now, payloadJson: JSON.stringify({
          action: 'DELETE_YEAR', auditYear, deletedCount, deletedIds,
          actorName: actor.actorName, actorUsername: actor.actorUsername
        })
      });

      await writeJson(res, buildJsonResponse(200, {
        ok: true, auditYear, deletedCount, contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to delete checklists by year.', 500), origin);
    }
  }

  function tryHandle(req, res, origin, url) {
    const detailMatch = url.pathname.match(/^\/api\/checklists\/([^/]+)\/?$/);
    const saveDraftMatch = url.pathname.match(/^\/api\/checklists\/([^/]+)\/save-draft\/?$/);
    const submitMatch = url.pathname.match(/^\/api\/checklists\/([^/]+)\/submit\/?$/);
    const deleteYearMatch = url.pathname.match(/^\/api\/checklists\/year\/([^/]+)\/?$/);

    if (url.pathname === '/api/checklists/health' && req.method === 'GET') {
      return handleHealth(req, res, origin).then(() => true);
    }
    if (url.pathname === '/api/checklists' && req.method === 'GET') {
      return handleList(req, res, origin, url).then(() => true);
    }
    if (saveDraftMatch && req.method === 'POST') {
      return writeChecklist(req, res, origin, decodeURIComponent(saveDraftMatch[1]), ACTIONS.SAVE_DRAFT || 'SAVE_DRAFT').then(() => true);
    }
    if (submitMatch && req.method === 'POST') {
      return writeChecklist(req, res, origin, decodeURIComponent(submitMatch[1]), ACTIONS.SUBMIT || 'SUBMIT').then(() => true);
    }
    if (deleteYearMatch && req.method === 'POST') {
      return handleDeleteYear(req, res, origin, decodeURIComponent(deleteYearMatch[1])).then(() => true);
    }
    if (detailMatch && req.method === 'GET' && !detailMatch[1].includes('/')) {
      return handleDetail(req, res, origin, decodeURIComponent(detailMatch[1])).then(() => true);
    }
    return Promise.resolve(false);
  }

  return { tryHandle };
}

module.exports = { createChecklistRouter };
