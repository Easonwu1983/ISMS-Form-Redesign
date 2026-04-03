// @ts-check
'use strict';

const {
  CONTRACT_VERSION,
  buildErrorResponse,
  buildJsonResponse,
  cleanText,
  createError,
  summarizeAuditEntries
} = require('../azure-function/audit-trail-api/src/shared/contract');
const db = require('./db.cjs');

function mapRowToAuditEntry(row) {
  if (!row) return null;
  const eventType = cleanText(row.event_type);
  const actorEmail = cleanText(row.actor_email);
  const targetEmail = cleanText(row.target_email);
  const unitCode = cleanText(row.unit_code);
  const recordId = cleanText(row.record_id);
  const occurredAt = row.occurred_at ? new Date(row.occurred_at).toISOString() : '';
  let payload = null;
  try {
    payload = row.payload_json && typeof row.payload_json === 'string'
      ? JSON.parse(row.payload_json)
      : (row.payload_json || null);
  } catch (_) { /* ignore */ }
  return {
    listItemId: String(row.id || ''),
    title: cleanText(row.title),
    eventType,
    eventTypeKey: eventType,
    actorEmail,
    actorEmailKey: actorEmail,
    targetEmail,
    targetEmailKey: targetEmail,
    unitCode,
    unitCodeKey: unitCode,
    recordId,
    recordIdKey: recordId,
    occurredAt,
    payload,
    searchText: [eventType, actorEmail, targetEmail, unitCode, recordId, cleanText(row.title)].join(' ')
  };
}

function createAuditTrailRouter(deps) {
  const { writeJson, requestAuthz } = deps;

  function logAuditTrail(message, details) {
    const suffix = details && typeof details === 'object'
      ? Object.entries(details).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(' ')
      : '';
    console.log(`[audit-trail] ${message}${suffix ? ` ${suffix}` : ''}`);
  }

  function getRequestId(req) {
    return cleanText(req && req.__ismsRequestId) || cleanText(req && req.headers && req.headers['x-request-id']);
  }

  function buildPageMeta(total, limit, offset, returnedCount) {
    const safeTotal = Math.max(0, Math.floor(Number(total) || 0));
    const safeLimit = Math.max(1, Math.min(Math.floor(Number(limit) || 100), 200));
    const maxOffset = safeTotal > 0 ? Math.max(0, Math.floor((safeTotal - 1) / safeLimit) * safeLimit) : 0;
    const safeOffset = Math.min(Math.max(0, Math.floor(Number(offset) || 0)), maxOffset);
    const pageCount = safeTotal > 0 ? Math.max(1, Math.ceil(safeTotal / safeLimit)) : 0;
    const currentPage = safeTotal > 0 ? Math.floor(safeOffset / safeLimit) + 1 : 0;
    const hasPrev = safeOffset > 0;
    const hasNext = safeOffset + safeLimit < safeTotal;
    const safeCount = Math.max(0, Number(returnedCount) || 0);
    return {
      offset: safeOffset, limit: safeLimit, total: safeTotal,
      pageCount, currentPage, hasPrev, hasNext,
      prevOffset: hasPrev ? Math.max(0, safeOffset - safeLimit) : 0,
      nextOffset: hasNext ? safeOffset + safeLimit : safeOffset,
      pageStart: safeCount ? safeOffset + 1 : 0,
      pageEnd: safeCount ? safeOffset + safeCount : 0
    };
  }

  function parseFilters(url) {
    const sp = url && url.searchParams ? url.searchParams : new URLSearchParams();
    const rawLimit = Number(sp.get('limit') || 100);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 100;
    const rawOffset = Number(sp.get('offset') || 0);
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
    return {
      keyword: cleanText(sp.get('keyword')).toLowerCase(),
      eventType: cleanText(sp.get('eventType')),
      occurredFrom: cleanText(sp.get('occurredFrom')),
      occurredTo: cleanText(sp.get('occurredTo')),
      actorEmail: cleanText(sp.get('actorEmail')).toLowerCase(),
      targetEmail: cleanText(sp.get('targetEmail')).toLowerCase(),
      unitCode: cleanText(sp.get('unitCode')),
      recordId: cleanText(sp.get('recordId')),
      summaryOnly: cleanText(sp.get('summaryOnly')) === '1',
      limit,
      offset
    };
  }

  async function queryAuditEntries(filters) {
    const conditions = [];
    const params = [];
    let paramIndex = 0;

    if (filters.eventType) {
      paramIndex++; conditions.push(`event_type = $${paramIndex}`); params.push(filters.eventType);
    }
    if (filters.actorEmail) {
      paramIndex++; conditions.push(`LOWER(actor_email) = $${paramIndex}`); params.push(filters.actorEmail);
    }
    if (filters.targetEmail) {
      paramIndex++; conditions.push(`LOWER(target_email) = $${paramIndex}`); params.push(filters.targetEmail);
    }
    if (filters.unitCode) {
      paramIndex++; conditions.push(`unit_code = $${paramIndex}`); params.push(filters.unitCode);
    }
    if (filters.recordId) {
      paramIndex++; conditions.push(`record_id = $${paramIndex}`); params.push(filters.recordId);
    }
    if (filters.occurredFrom) {
      paramIndex++; conditions.push(`occurred_at >= $${paramIndex}::date`); params.push(filters.occurredFrom);
    }
    if (filters.occurredTo) {
      paramIndex++; conditions.push(`occurred_at < ($${paramIndex}::date + interval '1 day')`); params.push(filters.occurredTo);
    }
    if (filters.keyword) {
      paramIndex++;
      conditions.push(`(
        LOWER(title) LIKE $${paramIndex} OR LOWER(event_type) LIKE $${paramIndex}
        OR LOWER(actor_email) LIKE $${paramIndex} OR LOWER(target_email) LIKE $${paramIndex}
        OR LOWER(unit_code) LIKE $${paramIndex} OR LOWER(record_id) LIKE $${paramIndex}
      )`);
      params.push(`%${filters.keyword}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await db.queryOne(`SELECT COUNT(*)::int AS total FROM ops_audit ${where}`, params);
    const total = countResult ? countResult.total : 0;

    // Get items for current page
    paramIndex++;
    params.push(filters.limit);
    paramIndex++;
    params.push(filters.offset);
    const rows = await db.queryAll(`
      SELECT id, title, event_type, actor_email, target_email, unit_code,
             record_id, occurred_at, payload_json
      FROM ops_audit ${where}
      ORDER BY occurred_at DESC, id DESC
      LIMIT $${paramIndex - 1} OFFSET $${paramIndex}
    `, params);

    const items = rows.map(mapRowToAuditEntry);

    // Compute summary via SQL aggregation (avoids loading all rows)
    const summaryParams = params.slice(0, params.length - 2);
    const summaryMeta = await db.queryOne(`
      SELECT COUNT(*)::int AS total,
             COUNT(DISTINCT actor_email)::int AS actor_count,
             MAX(occurred_at) AS latest_occurred_at
      FROM ops_audit ${where}`, summaryParams);
    const eventTypeRows = await db.queryAll(`
      SELECT event_type, COUNT(*)::int AS cnt
      FROM ops_audit ${where}
      GROUP BY event_type ORDER BY cnt DESC, event_type`, summaryParams);
    const summary = {
      total: summaryMeta ? summaryMeta.total : 0,
      actorCount: summaryMeta ? summaryMeta.actor_count : 0,
      latestOccurredAt: summaryMeta && summaryMeta.latest_occurred_at
        ? new Date(summaryMeta.latest_occurred_at).toISOString() : '',
      eventTypes: eventTypeRows.map((r) => ({ eventType: r.event_type || 'unknown', count: r.cnt }))
    };

    return { items, total, summary };
  }

  async function buildHealth() {
    const dbHealth = await db.healthCheck();
    return {
      ok: dbHealth.ok,
      ready: dbHealth.ok,
      contractVersion: CONTRACT_VERSION,
      repository: 'postgresql',
      database: { ok: dbHealth.ok, latencyMs: dbHealth.latencyMs }
    };
  }

  async function handleHealth(req, res, origin) {
    try {
      const requestId = getRequestId(req);
      if (requestId) logAuditTrail('health requested', { requestId });
      await writeJson(res, buildJsonResponse(200, await buildHealth()), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to read audit trail backend health.', 500), origin);
    }
  }

  async function handleList(req, res, origin, url) {
    const startedAt = Date.now();
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      requestAuthz.requireAdmin(authz, 'Only admin can view audit trail');
      const filters = parseFilters(url);
      const requestId = getRequestId(req);
      logAuditTrail('list requested', { requestId, username: authz.username });

      const result = await queryAuditEntries(filters);
      const page = buildPageMeta(result.total, filters.limit, filters.offset, result.items.length);

      logAuditTrail('list completed', {
        requestId, total: result.total,
        offset: page.offset, limit: page.limit,
        durationMs: Date.now() - startedAt
      });

      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        items: filters.summaryOnly ? [] : result.items,
        total: result.total,
        page: filters.summaryOnly
          ? { ...page, returned: 0, pageStart: 0, pageEnd: 0 }
          : page,
        summary: result.summary,
        cache: { query: 'direct-sql', summaryOnly: filters.summaryOnly },
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to list audit trail.', 500), origin);
    }
  }

  async function tryHandle(req, res, origin, url) {
    const pathname = cleanText(url && url.pathname);
    if (pathname === '/api/audit-trail/health' && req.method === 'GET') {
      await handleHealth(req, res, origin);
      return true;
    }
    if (pathname === '/api/audit-trail' && req.method === 'GET') {
      await handleList(req, res, origin, url);
      return true;
    }
    return false;
  }

  return { tryHandle };
}

module.exports = { createAuditTrailRouter };
