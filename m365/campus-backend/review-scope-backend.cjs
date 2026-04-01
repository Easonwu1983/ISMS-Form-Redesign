'use strict';

const {
  ACTIONS,
  CONTRACT_VERSION,
  buildErrorResponse,
  buildJsonResponse,
  cleanText,
  createError,
  createReviewScopeRecord,
  normalizeReplacePayload,
  validateActionEnvelope,
  validateReplacePayload
} = require('../azure-function/review-scope-api/src/shared/contract');
const {
  buildMembershipDiff
} = require('./audit-diff.cjs');
const db = require('./db.cjs');

function mapRowToReviewScope(row) {
  if (!row) return null;
  return {
    id: row.review_scope_key || '',
    username: row.username || '',
    unit: row.unit_value || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
    backendMode: row.backend_mode || '',
    recordSource: row.record_source || ''
  };
}

function createReviewScopeRouter(deps) {
  const { parseJsonBody, writeJson, requestAuthz } = deps;

  async function listAllEntries() {
    const rows = await db.queryAll(`
      SELECT id, review_scope_key, username, unit_value,
             created_at, updated_at, backend_mode, record_source
      FROM unit_review_scopes
      ORDER BY username, unit_value
    `);
    return rows.map((row) => ({
      listItemId: String(row.id),
      item: mapRowToReviewScope(row)
    }));
  }

  async function listEntriesByUsername(username) {
    const target = cleanText(username).toLowerCase();
    const rows = await db.queryAll(`
      SELECT id, review_scope_key, username, unit_value,
             created_at, updated_at, backend_mode, record_source
      FROM unit_review_scopes
      WHERE LOWER(username) = $1
      ORDER BY unit_value
    `, [target]);
    return rows.map((row) => ({
      listItemId: String(row.id),
      item: mapRowToReviewScope(row)
    }));
  }

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

  function buildScopedItemsFromAuthz(authz) {
    const username = cleanText(authz && authz.username);
    const units = Array.isArray(authz && authz.reviewUnits) ? authz.reviewUnits : [];
    return units
      .map((unit) => cleanText(unit))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'zh-Hant'))
      .map((unit) => ({
        id: `${username}::${unit}`, username, unit,
        createdAt: '', updatedAt: '',
        backendMode: 'pg-campus-backend', recordSource: 'authz-cache'
      }));
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
      await writeJson(res, buildErrorResponse(error, 'Failed to read review scope backend health.', 500), origin);
    }
  }

  async function handleList(req, res, origin, url) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      if (!requestAuthz.isAdmin(authz)) {
        await writeJson(res, buildJsonResponse(200, {
          ok: true, items: buildScopedItemsFromAuthz(authz), contractVersion: CONTRACT_VERSION
        }), origin);
        return;
      }
      const rows = await listAllEntries();
      const items = filterItems(rows.map((entry) => entry.item), new URL(url.toString()));
      await writeJson(res, buildJsonResponse(200, {
        ok: true, items, contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to list review scopes.', 500), origin);
    }
  }

  async function handleReplace(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      requestAuthz.requireAdmin(authz, 'Only admin can replace review scopes');
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ACTIONS.REPLACE);
      const payload = validateReplacePayload(envelope.payload);
      const normalized = normalizeReplacePayload(payload);
      const existingEntries = await listEntriesByUsername(normalized.username);
      const existingUnits = new Set(existingEntries.map((entry) => cleanText(entry.item.unit)));
      const nextUnits = new Set(normalized.units);
      const now = new Date().toISOString();

      await db.transaction(async (client) => {
        // Delete removed scopes
        for (const entry of existingEntries) {
          if (!nextUnits.has(cleanText(entry.item.unit))) {
            await client.query(`DELETE FROM unit_review_scopes WHERE id = $1`, [Number(entry.listItemId)]);
          }
        }
        // Insert new scopes
        for (const unit of normalized.units) {
          if (!existingUnits.has(unit)) {
            const scopeKey = `${cleanText(normalized.username)}::${cleanText(unit)}`;
            await client.query(`
              INSERT INTO unit_review_scopes (review_scope_key, username, unit_value, backend_mode, record_source, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [scopeKey, cleanText(normalized.username), cleanText(unit), 'pg-campus-backend', 'frontend', now, now]);
          }
        }
      });

      const actor = requestAuthz.buildActorDetails(authz);
      await createAuditRow({
        eventType: ACTIONS.REPLACE,
        actorEmail: actor.actorEmail,
        targetEmail: normalized.username,
        unitCode: normalized.units.join(' | '),
        recordId: normalized.username,
        occurredAt: now,
        payloadJson: JSON.stringify({
          username: normalized.username, units: normalized.units,
          membership: buildMembershipDiff(Array.from(existingUnits), normalized.units),
          actorName: actor.actorName, actorUsername: actor.actorUsername
        })
      });

      const nextRows = await listEntriesByUsername(normalized.username);
      await writeJson(res, buildJsonResponse(200, {
        ok: true, username: normalized.username,
        items: nextRows.map((entry) => entry.item), contractVersion: CONTRACT_VERSION
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

  return { tryHandle };
}

module.exports = { createReviewScopeRouter };
