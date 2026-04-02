'use strict';

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
  mapTrainingFormForClient,
  mapTrainingRosterForClient,
  normalizeTrainingFormPayload,
  normalizeTrainingRosterPayload,
  validateActionEnvelope,
  validateTrainingFormPayload,
  validateTrainingRosterPayload
} = require('../azure-function/training-api/src/shared/contract');

const {
  buildFieldChanges,
  summarizeAttachments
} = require('./audit-diff.cjs');
const db = require('./db.cjs');

/* ------------------------------------------------------------------ */
/*  Row → domain mappers                                               */
/* ------------------------------------------------------------------ */

function parseJsonField(value, fallback) {
  if (value === null || value === undefined) return fallback !== undefined ? fallback : null;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (_) { return fallback !== undefined ? fallback : null; }
  }
  return value;
}

function mapRowToForm(row) {
  if (!row) return null;
  const records = parseJsonField(row.records_json, []);
  const summary = parseJsonField(row.summary_json, {});
  const signedFiles = parseJsonField(row.signed_files_json, []);
  const history = parseJsonField(row.history_json, []);
  return {
    id: row.form_id || '',
    documentNo: row.document_no || '',
    formSeq: row.form_seq != null ? Number(row.form_seq) : null,
    unit: row.unit || '',
    unitCode: row.unit_code || '',
    statsUnit: row.stats_unit || '',
    fillerName: row.filler_name || '',
    fillerUsername: row.filler_username || '',
    submitterPhone: row.submitter_phone || '',
    submitterEmail: row.submitter_email || '',
    fillDate: row.fill_date || '',
    trainingYear: row.training_year || '',
    status: row.status || '',
    records,
    summary,
    signedFiles,
    returnReason: row.return_reason || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
    stepOneSubmittedAt: row.step_one_submitted_at ? new Date(row.step_one_submitted_at).toISOString() : '',
    printedAt: row.printed_at ? new Date(row.printed_at).toISOString() : '',
    signoffUploadedAt: row.signoff_uploaded_at ? new Date(row.signoff_uploaded_at).toISOString() : '',
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : '',
    history,
    backendMode: row.backend_mode || 'pg-campus-backend',
    recordSource: row.record_source || 'frontend'
  };
}

function mapRowToRoster(row) {
  if (!row) return null;
  return {
    id: row.roster_id || '',
    unit: row.unit || '',
    statsUnit: row.stats_unit || '',
    l1Unit: row.l1_unit || '',
    name: row.name || '',
    unitName: row.unit_name || '',
    identity: row.identity || '',
    jobTitle: row.job_title || '',
    source: row.source || 'import',
    createdBy: row.created_by || '',
    createdByUsername: row.created_by_username || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
    backendMode: row.backend_mode || 'pg-campus-backend',
    recordSource: row.record_source || 'frontend'
  };
}

/* ------------------------------------------------------------------ */
/*  Router factory                                                     */
/* ------------------------------------------------------------------ */

function createTrainingRouter(deps) {
  const { parseJsonBody, writeJson, requestAuthz } = deps;

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

  /* ---------- snapshots / diffs for audit ---------- */

  function buildTrainingFormSnapshot(item) {
    if (!item) return null;
    return {
      id: cleanText(item.id),
      unit: cleanText(item.unit),
      trainingYear: cleanText(item.trainingYear),
      fillerUsername: cleanText(item.fillerUsername),
      status: cleanText(item.status),
      recordsCount: Array.isArray(item.records) ? item.records.length : 0,
      signedFiles: summarizeAttachments(item.signedFiles)
    };
  }

  function buildTrainingFormChanges(beforeItem, afterItem) {
    const beforeSigned = summarizeAttachments(beforeItem && beforeItem.signedFiles);
    const afterSigned = summarizeAttachments(afterItem && afterItem.signedFiles);
    return buildFieldChanges(beforeItem, afterItem, [
      'unit', 'trainingYear', 'fillerName', 'fillerUsername',
      'submitterPhone', 'submitterEmail', 'fillDate', 'status',
      'returnReason', 'stepOneSubmittedAt', 'printedAt',
      'signoffUploadedAt', 'submittedAt',
      { label: 'recordsCount', kind: 'number', get: (item) => Array.isArray(item && item.records) ? item.records.length : 0 },
      { label: 'activeCount', kind: 'number', get: (item) => item && item.summary && item.summary.activeCount },
      { label: 'completedCount', kind: 'number', get: (item) => item && item.summary && item.summary.completedCount },
      { label: 'incompleteCount', kind: 'number', get: (item) => item && item.summary && item.summary.incompleteCount },
      { label: 'signedFileCount', kind: 'number', get: (item) => item === beforeItem ? beforeSigned.count : afterSigned.count }
    ]);
  }

  function buildTrainingRosterSnapshot(item) {
    if (!item) return null;
    return {
      id: cleanText(item.id),
      unit: cleanText(item.unit),
      name: cleanText(item.name),
      identity: cleanText(item.identity),
      jobTitle: cleanText(item.jobTitle),
      source: cleanText(item.source)
    };
  }

  function buildTrainingRosterChanges(beforeItem, afterItem) {
    return buildFieldChanges(beforeItem, afterItem, [
      'unit', 'statsUnit', 'l1Unit', 'name', 'unitName',
      'identity', 'jobTitle', 'source', 'createdBy', 'createdByUsername'
    ]);
  }

  /* ---------- logging ---------- */

  function logTraining(tag, message, details) {
    const suffix = details && typeof details === 'object'
      ? Object.entries(details).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')
      : '';
    console.log(`[${tag}] ${message}${suffix ? ` ${suffix}` : ''}`);
  }

  /* ---------- audit helper ---------- */

  async function createAuditRow(input) {
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
  }

  function queueAuditRow(input, label) {
    void createAuditRow(input).catch((error) => {
      console.warn('[training-backend] audit row write failed' + (label ? ` for ${label}` : ''), error && error.message ? error.message : error);
    });
  }

  /* ---------- forms: summary helpers ---------- */

  function summarizeTrainingForms(items) {
    const summary = { total: 0, draft: 0, pending: 0, submitted: 0, returned: 0 };
    (Array.isArray(items) ? items : []).forEach((item) => {
      const status = cleanText(item && item.status);
      summary.total += 1;
      if (status === FORM_STATUSES.DRAFT) summary.draft += 1;
      if (status === FORM_STATUSES.PENDING_SIGNOFF) summary.pending += 1;
      if (status === FORM_STATUSES.SUBMITTED) summary.submitted += 1;
      if (status === FORM_STATUSES.RETURNED) summary.returned += 1;
    });
    return summary;
  }

  /* ---------- forms: query ---------- */

  const FORM_SELECT = `
    SELECT id, form_id, document_no, form_seq, unit, unit_code, stats_unit,
           filler_name, filler_username, submitter_phone, submitter_email,
           fill_date, training_year, status, records_json, summary_json,
           signed_files_json, return_reason, created_at, updated_at,
           step_one_submitted_at, printed_at, signoff_uploaded_at,
           submitted_at, history_json, backend_mode, record_source
    FROM training_forms
  `;

  async function queryForms(filters, authz) {
    const conditions = [];
    const params = [];
    let idx = 0;

    if (filters.status) { idx++; conditions.push(`status = $${idx}`); params.push(filters.status); }
    if (filters.unit) { idx++; conditions.push(`unit = $${idx}`); params.push(filters.unit); }
    if (filters.statsUnit) { idx++; conditions.push(`stats_unit = $${idx}`); params.push(filters.statsUnit); }
    if (filters.trainingYear) { idx++; conditions.push(`training_year = $${idx}`); params.push(filters.trainingYear); }
    if (filters.fillerUsername) { idx++; conditions.push(`LOWER(filler_username) = $${idx}`); params.push(filters.fillerUsername.toLowerCase()); }
    if (filters.q) {
      idx++;
      conditions.push(`(
        LOWER(form_id) LIKE $${idx} OR LOWER(unit) LIKE $${idx}
        OR LOWER(stats_unit) LIKE $${idx} OR LOWER(filler_name) LIKE $${idx}
        OR LOWER(filler_username) LIKE $${idx} OR LOWER(training_year) LIKE $${idx}
      )`);
      params.push(`%${filters.q.toLowerCase()}%`);
    }

    // Non-admin authorization filter
    if (!requestAuthz.isAdmin(authz)) {
      const unitList = Array.isArray(authz.authorizedUnits) ? authz.authorizedUnits.filter(Boolean) : [];
      const username = cleanText(authz.username).toLowerCase();
      if (unitList.length > 0) {
        idx++;
        conditions.push(`(unit = ANY($${idx}) OR LOWER(filler_username) = $${idx + 1})`);
        params.push(unitList);
        idx++;
        params.push(username);
      } else {
        idx++;
        conditions.push(`LOWER(filler_username) = $${idx}`);
        params.push(username);
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await db.queryAll(`${FORM_SELECT} ${where} ORDER BY updated_at DESC, id DESC`, params);
    return rows.map(mapRowToForm);
  }

  async function getFormById(formId) {
    const target = cleanText(formId);
    if (!target) throw createError('Missing training form id', 400);
    const row = await db.queryOne(`${FORM_SELECT} WHERE form_id = $1`, [target]);
    if (!row) return null;
    return { dbId: row.id, item: mapRowToForm(row) };
  }

  async function findDuplicateForm(unit, trainingYear, excludeId) {
    const targetUnit = cleanText(unit);
    const targetYear = cleanText(trainingYear);
    const skipId = cleanText(excludeId);
    if (!targetUnit || !targetYear) return null;
    const row = await db.queryOne(
      `SELECT id, form_id FROM training_forms WHERE unit = $1 AND training_year = $2 AND form_id != $3 LIMIT 1`,
      [targetUnit, targetYear, skipId]
    );
    return row ? { dbId: row.id, item: { id: row.form_id, unit: targetUnit, trainingYear: targetYear } } : null;
  }

  async function upsertForm(existing, nextItem) {
    const now = nextItem.updatedAt || new Date().toISOString();
    const normalized = createTrainingFormRecord(nextItem, nextItem.status, now);
    if (existing) {
      await db.query(`
        UPDATE training_forms SET
          document_no=$1, form_seq=$2, unit=$3, unit_code=$4, stats_unit=$5,
          filler_name=$6, filler_username=$7, submitter_phone=$8, submitter_email=$9,
          fill_date=$10, training_year=$11, status=$12, records_json=$13, summary_json=$14,
          signed_files_json=$15, return_reason=$16, step_one_submitted_at=$17,
          printed_at=$18, signoff_uploaded_at=$19, submitted_at=$20, history_json=$21,
          backend_mode=$22, record_source=$23, updated_at=$24
        WHERE id = $25
      `, [
        normalized.documentNo, normalized.formSeq, normalized.unit, normalized.unitCode,
        normalized.statsUnit, normalized.fillerName, normalized.fillerUsername,
        normalized.submitterPhone, normalized.submitterEmail, normalized.fillDate || null,
        normalized.trainingYear, normalized.status,
        JSON.stringify(normalized.records || []), JSON.stringify(normalized.summary || {}),
        JSON.stringify(normalized.signedFiles || []), normalized.returnReason,
        normalized.stepOneSubmittedAt || null, normalized.printedAt || null,
        normalized.signoffUploadedAt || null, normalized.submittedAt || null,
        JSON.stringify(normalized.history || []),
        'pg-campus-backend', normalized.recordSource || 'frontend', now,
        existing.dbId
      ]);
      return { created: false, item: normalized };
    }
    await db.query(`
      INSERT INTO training_forms (
        form_id, document_no, form_seq, unit, unit_code, stats_unit,
        filler_name, filler_username, submitter_phone, submitter_email,
        fill_date, training_year, status, records_json, summary_json,
        signed_files_json, return_reason, step_one_submitted_at,
        printed_at, signoff_uploaded_at, submitted_at, history_json,
        backend_mode, record_source, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
    `, [
      normalized.id, normalized.documentNo, normalized.formSeq, normalized.unit,
      normalized.unitCode, normalized.statsUnit, normalized.fillerName,
      normalized.fillerUsername, normalized.submitterPhone, normalized.submitterEmail,
      normalized.fillDate || null, normalized.trainingYear, normalized.status,
      JSON.stringify(normalized.records || []), JSON.stringify(normalized.summary || {}),
      JSON.stringify(normalized.signedFiles || []), normalized.returnReason,
      normalized.stepOneSubmittedAt || null, normalized.printedAt || null,
      normalized.signoffUploadedAt || null, normalized.submittedAt || null,
      JSON.stringify(normalized.history || []),
      'pg-campus-backend', normalized.recordSource || 'frontend',
      normalized.createdAt || now, now
    ]);
    return { created: true, item: normalized };
  }

  async function deleteFormById(dbId) {
    await db.query(`DELETE FROM training_forms WHERE id = $1`, [dbId]);
  }

  /* ---------- rosters: query ---------- */

  const ROSTER_SELECT = `
    SELECT id, roster_id, unit, stats_unit, l1_unit, name, unit_name,
           identity, job_title, source::text AS source, created_by,
           created_by_username, created_at, updated_at,
           backend_mode, record_source
    FROM training_rosters
  `;

  async function queryRosters(filters, authz, pagination) {
    const conditions = [];
    const params = [];
    let idx = 0;

    if (filters.unit) { idx++; conditions.push(`unit = $${idx}`); params.push(filters.unit); }
    if (filters.statsUnit) { idx++; conditions.push(`stats_unit = $${idx}`); params.push(filters.statsUnit); }
    if (filters.source) { idx++; conditions.push(`source::text = $${idx}`); params.push(filters.source); }
    if (filters.q) {
      idx++;
      conditions.push(`(
        LOWER(roster_id) LIKE $${idx} OR LOWER(unit) LIKE $${idx}
        OR LOWER(stats_unit) LIKE $${idx} OR LOWER(name) LIKE $${idx}
        OR LOWER(unit_name) LIKE $${idx} OR LOWER(identity) LIKE $${idx}
        OR LOWER(job_title) LIKE $${idx}
      )`);
      params.push(`%${filters.q.toLowerCase()}%`);
    }

    // Non-admin authorization filter: match unit OR stats_unit so unit admins
    // can see rosters imported by the admin for their authorized scope.
    if (!requestAuthz.isAdmin(authz)) {
      const unitList = Array.isArray(authz.authorizedUnits) ? authz.authorizedUnits.filter(Boolean) : [];
      if (unitList.length > 0) {
        idx++;
        conditions.push(`(unit = ANY($${idx}) OR stats_unit = ANY($${idx}))`);
        params.push(unitList);
      } else {
        conditions.push('FALSE');
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count
    const countResult = await db.queryOne(`SELECT COUNT(*)::int AS total FROM training_rosters ${where}`, params);
    const total = countResult ? countResult.total : 0;

    // Items
    const limit = pagination.limit || total || 500;
    const offset = pagination.offset || 0;
    idx++;
    params.push(limit);
    idx++;
    params.push(offset);
    const rows = await db.queryAll(`${ROSTER_SELECT} ${where} ORDER BY unit, name, roster_id LIMIT $${idx - 1} OFFSET $${idx}`, params);
    return { items: rows.map(mapRowToRoster), total };
  }

  async function getRosterById(rosterId) {
    const target = cleanText(rosterId);
    if (!target) throw createError('Missing training roster id', 400);
    const row = await db.queryOne(`${ROSTER_SELECT} WHERE roster_id = $1`, [target]);
    if (!row) return null;
    return { dbId: row.id, item: mapRowToRoster(row) };
  }

  async function getRosterEntriesById(rosterId) {
    const target = cleanText(rosterId);
    if (!target) throw createError('Missing training roster id', 400);
    const rows = await db.queryAll(`${ROSTER_SELECT} WHERE roster_id = $1`, [target]);
    return rows.map((row) => ({ dbId: row.id, item: mapRowToRoster(row) }));
  }

  async function findDuplicateRoster(unit, name, excludeId) {
    const targetUnit = cleanText(unit);
    const targetName = cleanText(name).toLowerCase();
    const skipId = cleanText(excludeId);
    if (!targetUnit || !targetName) return null;
    const row = await db.queryOne(
      `SELECT id, roster_id FROM training_rosters WHERE unit = $1 AND LOWER(name) = $2 AND roster_id != $3 LIMIT 1`,
      [targetUnit, targetName, skipId]
    );
    return row ? { dbId: row.id, item: { id: row.roster_id, unit: targetUnit, name: targetName } } : null;
  }

  async function generateNextRosterId() {
    const result = await db.queryOne(`SELECT nextval('seq_roster_id') AS val`);
    const seq = Number(result.val);
    return `RST-${String(seq).padStart(4, '0')}`;
  }

  async function allocateNextRosterIds(count) {
    if (count <= 0) return [];
    const ids = [];
    for (let i = 0; i < count; i++) {
      ids.push(await generateNextRosterId());
    }
    return ids;
  }

  async function upsertRoster(existing, nextItem) {
    const now = nextItem.updatedAt || new Date().toISOString();
    const normalized = createTrainingRosterRecord(nextItem, now);
    if (existing) {
      await db.query(`
        UPDATE training_rosters SET
          unit=$1, stats_unit=$2, l1_unit=$3, name=$4, unit_name=$5,
          identity=$6, job_title=$7, source=$8, created_by=$9,
          created_by_username=$10, backend_mode=$11, record_source=$12, updated_at=$13
        WHERE id = $14
      `, [
        normalized.unit, normalized.statsUnit, normalized.l1Unit,
        normalized.name, normalized.unitName, normalized.identity,
        normalized.jobTitle, normalized.source, normalized.createdBy,
        normalized.createdByUsername, 'pg-campus-backend',
        normalized.recordSource || 'frontend', now,
        existing.dbId
      ]);
      return { created: false, item: normalized };
    }
    await db.query(`
      INSERT INTO training_rosters (
        roster_id, unit, stats_unit, l1_unit, name, unit_name,
        identity, job_title, source, created_by, created_by_username,
        backend_mode, record_source, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    `, [
      normalized.id, normalized.unit, normalized.statsUnit, normalized.l1Unit,
      normalized.name, normalized.unitName, normalized.identity,
      normalized.jobTitle, normalized.source, normalized.createdBy,
      normalized.createdByUsername, 'pg-campus-backend',
      normalized.recordSource || 'frontend',
      normalized.createdAt || now, now
    ]);
    return { created: true, item: normalized };
  }

  async function deleteRosterById(dbId) {
    await db.query(`DELETE FROM training_rosters WHERE id = $1`, [dbId]);
  }

  /* ---------- pagination helper ---------- */

  function buildRosterPageMeta(url, total) {
    const rawLimit = Number(url && url.searchParams && url.searchParams.get('limit'));
    const rawOffset = Number(url && url.searchParams && url.searchParams.get('offset')) || 0;
    const safeTotal = Math.max(Number(total) || 0, 0);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : safeTotal;
    const safeOffset = Math.min(Math.max(rawOffset, 0), safeTotal);
    const paged = !!(rawLimit > 0) || safeOffset > 0;
    const pageCount = rawLimit && limit > 0 ? Math.ceil(safeTotal / limit) : (safeTotal > 0 ? 1 : 0);
    const currentPage = rawLimit && limit > 0 && safeTotal > 0 ? Math.floor(safeOffset / limit) + 1 : (safeTotal > 0 ? 1 : 0);
    const returned = limit > 0 ? Math.max(Math.min(limit, safeTotal - safeOffset), 0) : 0;
    return {
      offset: safeOffset, limit, total: safeTotal, returned,
      pageCount, currentPage,
      hasPrev: safeOffset > 0,
      hasNext: rawLimit ? (safeOffset + limit) < safeTotal : false,
      prevOffset: rawLimit ? Math.max(safeOffset - limit, 0) : 0,
      nextOffset: rawLimit && (safeOffset + limit) < safeTotal ? safeOffset + limit : safeOffset,
      paged
    };
  }

  /* ---------- form filters parser ---------- */

  function readTrainingFormFilters(url) {
    const params = url && url.searchParams ? url.searchParams : new URLSearchParams();
    return {
      status: cleanText(params.get('status')),
      unit: cleanText(params.get('unit')),
      statsUnit: cleanText(params.get('statsUnit')),
      trainingYear: cleanText(params.get('trainingYear')),
      fillerUsername: cleanText(params.get('fillerUsername')),
      q: cleanText(params.get('q')).toLowerCase()
    };
  }

  function readRosterFilters(url) {
    return {
      unit: cleanText(url.searchParams.get('unit')),
      statsUnit: cleanText(url.searchParams.get('statsUnit')),
      source: cleanText(url.searchParams.get('source')),
      q: cleanText(url.searchParams.get('q')).toLowerCase()
    };
  }

  /* ---------- status assertions ---------- */

  function assertEditable(existing) {
    if (existing && existing.item.status === FORM_STATUSES.SUBMITTED) {
      throw createError('Submitted training forms cannot be edited directly.', 409);
    }
  }
  function assertCanFinalize(existing) {
    if (!existing) throw createError('Training form not found', 404);
    if (existing.item.status !== FORM_STATUSES.PENDING_SIGNOFF) throw createError('Only pending-signoff forms can be finalized.', 409);
  }
  function assertCanReturn(existing) {
    if (!existing) throw createError('Training form not found', 404);
    if (existing.item.status !== FORM_STATUSES.SUBMITTED) throw createError('Only submitted forms can be returned.', 409);
  }
  function assertCanUndo(existing) {
    if (!existing) throw createError('Training form not found', 404);
    if (existing.item.status !== FORM_STATUSES.PENDING_SIGNOFF) throw createError('Only pending-signoff forms can be undone.', 409);
  }
  function assertCanMarkPrinted(existing) {
    if (!existing) throw createError('Training form not found', 404);
    if (existing.item.status !== FORM_STATUSES.PENDING_SIGNOFF) throw createError('Only pending-signoff forms can be marked as printed.', 409);
  }

  /* ---------- health ---------- */

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
      await writeJson(res, buildErrorResponse(error, 'Failed to read training backend health.', 500), origin);
    }
  }

  /* ---------- form list ---------- */

  async function handleFormList(req, res, origin, url) {
    try {
      const startedAt = Date.now();
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const summaryOnly = String(url.searchParams.get('summaryOnly') || '').trim() === '1';
      const filters = readTrainingFormFilters(url);

      const items = await queryForms(filters, authz);
      const summary = summarizeTrainingForms(items);

      logTraining('training-forms', 'list served', {
        username: authz.username,
        total: summary.total,
        summaryOnly,
        durationMs: Date.now() - startedAt
      });

      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        items: summaryOnly ? [] : items.map(mapTrainingFormForClient),
        summary,
        total: summary.total,
        filters: { ...filters, summaryOnly: summaryOnly ? '1' : '' },
        generatedAt: new Date().toISOString(),
        cache: { query: 'direct-sql', summaryOnly },
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to list training forms.', 500), origin);
    }
  }

  /* ---------- form detail ---------- */

  async function handleFormDetail(req, res, origin, formId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getFormById(formId);
      if (!existing) throw createError('Training form not found', 404);
      if (!requestAuthz.canAccessTrainingForm(authz, existing.item)) {
        throw requestAuthz.createHttpError('You do not have access to this training form', 403);
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

  /* ---------- form generic write ---------- */

  async function writeTrainingForm(req, res, origin, formId, action, options) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getFormById(formId);
      if (typeof options.assertBefore === 'function') {
        options.assertBefore(existing);
      } else {
        assertEditable(existing);
      }
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, action);
      const payload = normalizeTrainingFormPayload(envelope.payload);
      if (cleanText(formId) !== cleanText(payload.id)) {
        throw createError('Route form id and payload id do not match', 400);
      }
      if (existing && !requestAuthz.canManageTrainingForm(authz, existing.item)) {
        throw requestAuthz.createHttpError('You do not have permission to edit this training form', 403);
      }
      if (!existing) {
        const intendedUnit = cleanText(payload.unit);
        if (!(requestAuthz.isAdmin(authz) || requestAuthz.hasUnitAccess(authz, intendedUnit) || requestAuthz.matchesUsername(authz, payload.fillerUsername))) {
          throw requestAuthz.createHttpError('You do not have permission to create a training form for this unit', 403);
        }
      }
      validateTrainingFormPayload(payload, options.validation || {});
      const duplicate = await findDuplicateForm(payload.unit, payload.trainingYear, payload.id);
      if (duplicate) throw createError('Another training form already exists for this unit and year', 409);

      const actor = actorLabel(payload, (existing && existing.item && existing.item.fillerName) || payload.fillerName);
      const actorMeta = requestAuthz.buildActorDetails(authz);
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

      queueAuditRow({
        eventType: options.eventType,
        actorEmail: actorMeta.actorEmail,
        targetEmail: nextItem.submitterEmail,
        unitCode: nextItem.unitCode,
        recordId: nextItem.id,
        occurredAt: now,
        payloadJson: JSON.stringify({
          action,
          actorName: actorMeta.actorName,
          actorUsername: actorMeta.actorUsername,
          snapshot: existingItem ? null : buildTrainingFormSnapshot(nextItem),
          changes: buildTrainingFormChanges(existingItem, nextItem)
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

  /* ---------- form delete ---------- */

  async function handleFormDelete(req, res, origin, formId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getFormById(formId);
      if (!existing) throw createError('Training form not found', 404);
      if (!requestAuthz.canManageTrainingForm(authz, existing.item)) {
        throw requestAuthz.createHttpError('You do not have permission to delete this training form', 403);
      }
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, FORM_ACTIONS.DELETE);
      const payload = envelope && envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {};
      const now = new Date().toISOString();
      await deleteFormById(existing.dbId);
      const actor = requestAuthz.buildActorDetails(authz);
      queueAuditRow({
        eventType: 'training.form_deleted',
        actorEmail: actor.actorEmail,
        targetEmail: cleanText(existing.item.submitterEmail),
        unitCode: cleanText(existing.item.unitCode),
        recordId: existing.item.id,
        occurredAt: now,
        payloadJson: JSON.stringify({
          action: FORM_ACTIONS.DELETE,
          actor: actor.actorName || actorLabel(payload, existing.item.fillerName),
          actorUsername: actor.actorUsername,
          deletedState: buildTrainingFormSnapshot(existing.item)
        })
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true, deletedId: existing.item.id, contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to delete training form.', 500), origin);
    }
  }

  /* ---------- roster list ---------- */

  async function handleRosterList(req, res, origin, url) {
    const startedAt = Date.now();
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const filters = readRosterFilters(url);
      const rawLimit = Number(url.searchParams.get('limit'));
      const rawOffset = Number(url.searchParams.get('offset')) || 0;
      const pagination = {
        limit: Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 0,
        offset: Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0
      };
      const result = await queryRosters(filters, authz, pagination);
      const page = buildRosterPageMeta(url, result.total);

      logTraining('training-rosters', 'list served', {
        username: authz.username,
        total: result.total,
        returned: result.items.length,
        durationMs: Date.now() - startedAt
      });

      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        items: result.items.map(mapTrainingRosterForClient),
        total: result.total,
        page,
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to list training rosters.', 500), origin);
    }
  }

  /* ---------- roster upsert (single) ---------- */

  async function handleRosterUpsert(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ROSTER_ACTIONS.UPSERT);
      const payload = normalizeTrainingRosterPayload(envelope.payload);
      validateTrainingRosterPayload(payload);
      const now = new Date().toISOString();
      const existingById = cleanText(payload.id) ? await getRosterById(payload.id) : null;
      const duplicateEntry = await findDuplicateRoster(payload.unit, payload.name, payload.id);
      const authorizedExistingById = existingById && requestAuthz.canManageTrainingRoster(authz, existingById.item)
        ? existingById : null;
      const existing = duplicateEntry || authorizedExistingById || null;
      const targetRoster = existing ? existing.item : payload;
      if (!requestAuthz.canManageTrainingRoster(authz, targetRoster)) {
        throw requestAuthz.createHttpError('You do not have permission to manage this training roster', 403);
      }
      const actorMeta = requestAuthz.buildActorDetails(authz);
      const nextRosterId = existing ? existing.item.id : await generateNextRosterId();
      const nextItem = createTrainingRosterRecord({
        ...(existing ? existing.item : {}),
        ...payload,
        id: nextRosterId,
        createdAt: existing ? existing.item.createdAt : (payload.createdAt || now),
        updatedAt: now
      }, now);
      const saved = await upsertRoster(existing, nextItem);
      queueAuditRow({
        eventType: 'training.roster_upserted',
        actorEmail: actorMeta.actorEmail,
        targetEmail: '',
        unitCode: '',
        recordId: nextItem.id || nextItem.name,
        occurredAt: now,
        payloadJson: JSON.stringify({
          action: ROSTER_ACTIONS.UPSERT,
          actor: actorLabel(payload, payload.createdBy || payload.name),
          actorUsername: actorMeta.actorUsername,
          snapshot: existing ? null : buildTrainingRosterSnapshot(nextItem),
          changes: buildTrainingRosterChanges(existing && existing.item, nextItem)
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

  /* ---------- roster upsert batch ---------- */

  function buildRosterLookupKey(unit, name) {
    return `${cleanText(unit)}::${cleanText(name).toLowerCase()}`;
  }

  async function handleRosterUpsertBatch(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ROSTER_ACTIONS.UPSERT_BATCH);
      const payload = envelope && envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {};
      const rawItems = Array.isArray(payload.items) ? payload.items : [];
      if (!rawItems.length) throw createError('Training roster batch is empty', 400);
      if (rawItems.length > 200) throw createError('Training roster batch exceeds the 200 item limit', 400);

      const actorMeta = requestAuthz.buildActorDetails(authz);
      const actorName = cleanText(payload.actorName) || actorMeta.actorName;
      const actorUsername = cleanText(payload.actorUsername) || actorMeta.actorUsername;
      const now = new Date().toISOString();

      // Pre-load existing rosters scoped to relevant units only
      const batchUnits = [...new Set(rawItems.map((r) => cleanText(r && r.unit)).filter(Boolean))];
      const allRosterRows = batchUnits.length
        ? await db.queryAll(`${ROSTER_SELECT} WHERE unit = ANY($1) ORDER BY unit, name`, [batchUnits])
        : [];
      const rosterById = new Map();
      const rosterByKey = new Map();
      allRosterRows.forEach((row) => {
        const entry = { dbId: row.id, item: mapRowToRoster(row) };
        const rosterId = cleanText(entry.item.id);
        const key = buildRosterLookupKey(entry.item.unit, entry.item.name);
        if (rosterId && !rosterById.has(rosterId)) rosterById.set(rosterId, entry);
        if (key && !rosterByKey.has(key)) rosterByKey.set(key, entry);
      });

      const plans = [];
      const summary = { added: 0, updated: 0, skipped: 0, failed: 0 };
      const errors = [];
      const requestKeys = new Set();

      rawItems.forEach((rawItem, index) => {
        try {
          const normalized = normalizeTrainingRosterPayload({
            ...(rawItem && typeof rawItem === 'object' ? rawItem : {}),
            actorName, actorUsername
          });
          validateTrainingRosterPayload(normalized);
          const key = buildRosterLookupKey(normalized.unit, normalized.name);
          if (requestKeys.has(key)) { summary.skipped += 1; return; }
          requestKeys.add(key);
          const explicitId = cleanText(normalized.id);
          const existing = (explicitId && rosterById.get(explicitId)) || rosterByKey.get(key) || null;
          const target = existing ? existing.item : normalized;
          if (!requestAuthz.canManageTrainingRoster(authz, target)) {
            summary.failed += 1;
            errors.push(`第 ${index + 1} 筆資料沒有權限管理對應名單`);
            return;
          }
          plans.push({ existing, item: normalized, key });
        } catch (error) {
          summary.failed += 1;
          errors.push(cleanText(error && error.message) || `第 ${index + 1} 筆資料處理失敗`);
        }
      });

      const newIds = await allocateNextRosterIds(plans.filter((p) => !p.existing).length);
      let newIndex = 0;
      plans.forEach((plan) => {
        plan.nextRosterId = plan.existing ? plan.existing.item.id : newIds[newIndex++];
      });

      const items = [];
      await db.transaction(async (client) => {
        for (const plan of plans) {
          try {
            const existing = plan.existing;
            const nextRosterId = plan.nextRosterId;
            const nextItem = createTrainingRosterRecord({
              ...(existing ? existing.item : {}),
              ...plan.item,
              id: nextRosterId,
              createdBy: cleanText(plan.item.createdBy) || (existing && existing.item.createdBy) || actorName,
              createdByUsername: cleanText(plan.item.createdByUsername) || (existing && existing.item.createdByUsername) || actorUsername,
              createdAt: existing ? existing.item.createdAt : (plan.item.createdAt || now),
              updatedAt: now
            }, now);

            if (existing) {
              await client.query(`
                UPDATE training_rosters SET
                  unit=$1, stats_unit=$2, l1_unit=$3, name=$4, unit_name=$5,
                  identity=$6, job_title=$7, source=$8, created_by=$9,
                  created_by_username=$10, backend_mode=$11, record_source=$12, updated_at=$13
                WHERE id = $14
              `, [
                nextItem.unit, nextItem.statsUnit, nextItem.l1Unit,
                nextItem.name, nextItem.unitName, nextItem.identity,
                nextItem.jobTitle, nextItem.source, nextItem.createdBy,
                nextItem.createdByUsername, 'pg-campus-backend',
                nextItem.recordSource || 'frontend', now,
                existing.dbId
              ]);
              summary.updated += 1;
            } else {
              await client.query(`
                INSERT INTO training_rosters (
                  roster_id, unit, stats_unit, l1_unit, name, unit_name,
                  identity, job_title, source, created_by, created_by_username,
                  backend_mode, record_source, created_at, updated_at
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
              `, [
                nextItem.id, nextItem.unit, nextItem.statsUnit, nextItem.l1Unit,
                nextItem.name, nextItem.unitName, nextItem.identity,
                nextItem.jobTitle, nextItem.source, nextItem.createdBy,
                nextItem.createdByUsername, 'pg-campus-backend',
                nextItem.recordSource || 'frontend',
                nextItem.createdAt || now, now
              ]);
              summary.added += 1;
            }
            items.push(mapTrainingRosterForClient(nextItem));

            queueAuditRow({
              eventType: 'training.roster_upserted',
              actorEmail: actorMeta.actorEmail,
              targetEmail: '',
              unitCode: '',
              recordId: nextItem.id || nextItem.name,
              occurredAt: now,
              payloadJson: JSON.stringify({
                action: ROSTER_ACTIONS.UPSERT_BATCH,
                actor: actorName || actorLabel(plan.item, plan.item.createdBy || plan.item.name),
                actorUsername,
                snapshot: existing ? null : buildTrainingRosterSnapshot(nextItem),
                changes: buildTrainingRosterChanges(existing && existing.item, nextItem)
              })
            });
          } catch (error) {
            summary.failed += 1;
            errors.push(cleanText(error && error.message) || `處理 ${cleanText(plan.item.name) || '名單'} 失敗`);
          }
        }
      });

      await writeJson(res, buildJsonResponse(200, {
        ok: true, items, summary, errors, contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to batch upsert training rosters.', 500), origin);
    }
  }

  /* ---------- roster delete ---------- */

  async function handleRosterDelete(req, res, origin, rosterId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existingEntries = await getRosterEntriesById(rosterId);
      const existing = existingEntries[0] || null;
      if (!existing) throw createError('Training roster not found', 404);
      if (existingEntries.some((entry) => !requestAuthz.canManageTrainingRoster(authz, entry.item))) {
        throw requestAuthz.createHttpError('You do not have permission to delete this training roster', 403);
      }
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ROSTER_ACTIONS.DELETE);
      const payload = envelope && envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {};
      const now = new Date().toISOString();
      for (const entry of existingEntries) {
        await deleteRosterById(entry.dbId);
      }
      const actor = requestAuthz.buildActorDetails(authz);
      queueAuditRow({
        eventType: 'training.roster_deleted',
        actorEmail: actor.actorEmail,
        targetEmail: '',
        unitCode: '',
        recordId: existing.item.id,
        occurredAt: now,
        payloadJson: JSON.stringify({
          action: ROSTER_ACTIONS.DELETE,
          actor: actor.actorName || actorLabel(payload, existing.item.name),
          actorUsername: actor.actorUsername,
          deletedState: existingEntries.map((entry) => buildTrainingRosterSnapshot(entry.item)),
          deletedCount: existingEntries.length
        })
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true, deletedId: existing.item.id, deletedCount: existingEntries.length, contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to delete training roster.', 500), origin);
    }
  }

  /* ---------- roster delete batch ---------- */

  async function handleRosterDeleteBatch(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ROSTER_ACTIONS.DELETE_BATCH);
      const payload = envelope && envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {};
      const rawIds = Array.isArray(payload.ids) ? payload.ids : (Array.isArray(payload.rosterIds) ? payload.rosterIds : []);
      const ids = Array.from(new Set(rawIds.map((v) => cleanText(v)).filter(Boolean)));
      if (!ids.length) throw createError('Training roster ids are required', 400);
      if (ids.length > 200) throw createError('Training roster batch exceeds the 200 item limit', 400);

      const matchedEntries = [];
      const skippedIds = [];
      for (const rid of ids) {
        const entries = await getRosterEntriesById(rid);
        if (!entries.length) { skippedIds.push(rid); continue; }
        if (entries.some((entry) => !requestAuthz.canManageTrainingRoster(authz, entry.item))) {
          throw requestAuthz.createHttpError('You do not have permission to delete this training roster', 403);
        }
        matchedEntries.push(...entries);
      }

      const uniqueEntries = [];
      const seenDbIds = new Set();
      matchedEntries.forEach((entry) => {
        if (seenDbIds.has(entry.dbId)) return;
        seenDbIds.add(entry.dbId);
        uniqueEntries.push(entry);
      });

      const now = new Date().toISOString();
      await db.transaction(async (client) => {
        for (const entry of uniqueEntries) {
          await client.query(`DELETE FROM training_rosters WHERE id = $1`, [entry.dbId]);
        }
      });

      const actor = requestAuthz.buildActorDetails(authz);
      queueAuditRow({
        eventType: 'training.roster_deleted',
        actorEmail: actor.actorEmail,
        targetEmail: '',
        unitCode: '',
        recordId: uniqueEntries.length ? cleanText(uniqueEntries[0].item.id) : ids.join(','),
        occurredAt: now,
        payloadJson: JSON.stringify({
          action: ROSTER_ACTIONS.DELETE_BATCH,
          actor: actor.actorName || actorLabel(payload, ids.join(', ')),
          actorUsername: actor.actorUsername,
          deletedState: uniqueEntries.map((entry) => buildTrainingRosterSnapshot(entry.item)),
          deletedCount: uniqueEntries.length,
          deletedIds: ids,
          skippedIds
        })
      });

      await writeJson(res, buildJsonResponse(200, {
        ok: true, deletedIds: ids, deletedCount: uniqueEntries.length, skippedIds, contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to delete training rosters.', 500), origin);
    }
  }

  /* ---------- draft history helper ---------- */

  function buildDraftHistory(existingItem, actor, now) {
    if (existingItem && existingItem.status === FORM_STATUSES.RETURNED) {
      return appendHistory(existingItem.history, 'Returned form saved as draft again', actor, now);
    }
    return appendHistory(existingItem && existingItem.history, existingItem ? 'Training form draft updated' : 'Training form draft created', actor, now);
  }

  /* ---------- route dispatcher ---------- */

  function tryHandle(req, res, origin, url) {
    const formCollectionMatch = url.pathname.match(/^\/api\/training\/forms\/?$/);
    const formDetailMatch = url.pathname.match(/^\/api\/training\/forms\/([^/]+)\/?$/);
    const formActionMatch = url.pathname.match(/^\/api\/training\/forms\/([^/]+)\/(save-draft|submit-step-one|mark-printed|finalize|return|undo|delete)\/?$/);
    const rosterCollectionMatch = url.pathname.match(/^\/api\/training\/rosters\/?$/);
    const rosterBatchUpsertMatch = url.pathname.match(/^\/api\/training\/rosters\/upsert-batch\/?$/);
    const rosterUpsertMatch = url.pathname.match(/^\/api\/training\/rosters\/upsert\/?$/);
    const rosterDeleteBatchMatch = url.pathname.match(/^\/api\/training\/rosters\/delete-batch\/?$/);
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
          resolveStatus: (existing) => existing && existing.item.status === FORM_STATUSES.RETURNED ? FORM_STATUSES.RETURNED : FORM_STATUSES.DRAFT,
          transformItem: (item, existingItem) => {
            if (existingItem && existingItem.status === FORM_STATUSES.RETURNED) {
              return { ...item, returnReason: item.returnReason || existingItem.returnReason || '' };
            }
            return item;
          },
          buildHistory: (existingItem, _payload, actor, now) => buildDraftHistory(existingItem, actor, now),
          eventType: 'training.form_saved'
        }).then(() => true);
      }
      if (actionName === 'submit-step-one') {
        return writeTrainingForm(req, res, origin, formId, FORM_ACTIONS.SUBMIT_STEP_ONE, {
          validation: { requireRecords: true },
          resolveStatus: () => FORM_STATUSES.PENDING_SIGNOFF,
          transformItem: (item, _existingItem, _payload, now) => ({ ...item, returnReason: '', stepOneSubmittedAt: now }),
          buildHistory: (existingItem, _payload, actor, now) => appendHistory(existingItem && existingItem.history, 'Training step one submitted', actor, now),
          eventType: 'training.form_step_one_submitted'
        }).then(() => true);
      }
      if (actionName === 'mark-printed') {
        return writeTrainingForm(req, res, origin, formId, FORM_ACTIONS.MARK_PRINTED, {
          assertBefore: assertCanMarkPrinted,
          validation: { requireRecords: true },
          resolveStatus: (existing) => existing && existing.item && existing.item.status ? existing.item.status : FORM_STATUSES.PENDING_SIGNOFF,
          transformItem: (item, existingItem, _payload, now) => ({ ...item, printedAt: cleanText(item.printedAt) || (existingItem && existingItem.printedAt) || now }),
          buildHistory: (existingItem, _payload, actor, now) => appendHistory(existingItem && existingItem.history, 'Training print sheet generated', actor, now),
          eventType: 'training.form_printed'
        }).then(() => true);
      }
      if (actionName === 'finalize') {
        return writeTrainingForm(req, res, origin, formId, FORM_ACTIONS.FINALIZE, {
          assertBefore: assertCanFinalize,
          validation: { requireRecords: true, requireSignedFiles: true },
          resolveStatus: () => FORM_STATUSES.SUBMITTED,
          transformItem: (item, _existingItem, _payload, now) => ({ ...item, signoffUploadedAt: now, submittedAt: now }),
          buildHistory: (existingItem, _payload, actor, now) => appendHistory(existingItem && existingItem.history, 'Training form finalized', actor, now),
          eventType: 'training.form_finalized'
        }).then(() => true);
      }
      if (actionName === 'return') {
        return writeTrainingForm(req, res, origin, formId, FORM_ACTIONS.RETURN, {
          assertBefore: assertCanReturn,
          validation: { requireRecords: true, requireReturnReason: true },
          resolveStatus: () => FORM_STATUSES.RETURNED,
          buildHistory: (existingItem, payload, actor, now) => appendHistory(existingItem && existingItem.history, 'Training form returned: ' + cleanText(payload.returnReason), actor, now),
          eventType: 'training.form_returned'
        }).then(() => true);
      }
      if (actionName === 'undo') {
        return writeTrainingForm(req, res, origin, formId, FORM_ACTIONS.UNDO, {
          assertBefore: assertCanUndo,
          validation: { requireRecords: true },
          resolveStatus: () => FORM_STATUSES.DRAFT,
          transformItem: (item) => ({ ...item, stepOneSubmittedAt: '', printedAt: '', signoffUploadedAt: '', submittedAt: '', returnReason: '' }),
          buildHistory: (existingItem, _payload, actor, now) => appendHistory(existingItem && existingItem.history, 'Training form undone back to draft', actor, now),
          eventType: 'training.form_undone'
        }).then(() => true);
      }
      if (actionName === 'delete') {
        return handleFormDelete(req, res, origin, formId).then(() => true);
      }
    }
    if (rosterCollectionMatch && req.method === 'GET') {
      return handleRosterList(req, res, origin, url).then(() => true);
    }
    if (rosterBatchUpsertMatch && req.method === 'POST') {
      return handleRosterUpsertBatch(req, res, origin).then(() => true);
    }
    if (rosterUpsertMatch && req.method === 'POST') {
      return handleRosterUpsert(req, res, origin).then(() => true);
    }
    if (rosterDeleteBatchMatch && req.method === 'POST') {
      return handleRosterDeleteBatch(req, res, origin).then(() => true);
    }
    if (rosterDeleteMatch && req.method === 'POST') {
      return handleRosterDelete(req, res, origin, routeId(rosterDeleteMatch[1])).then(() => true);
    }
    return Promise.resolve(false);
  }

  return { tryHandle };
}

module.exports = { createTrainingRouter };
