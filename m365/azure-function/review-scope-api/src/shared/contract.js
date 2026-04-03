// @ts-check
const CONTRACT_VERSION = '2026-04-02';

const ACTIONS = {
  LIST: 'review-scope.list',
  REPLACE: 'review-scope.replace'
};

function cleanText(value) {
  return String(value || '').trim();
}

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode || 400;
  return error;
}

function buildJsonResponse(status, jsonBody) {
  return {
    status: status || 200,
    jsonBody: jsonBody && typeof jsonBody === 'object' ? jsonBody : {}
  };
}

function buildErrorResponse(error, fallbackMessage, fallbackStatus) {
  return {
    status: Number(error && error.statusCode) || fallbackStatus || 500,
    jsonBody: {
      ok: false,
      error: cleanText(error && error.message) || cleanText(fallbackMessage) || 'Unexpected error.'
    }
  };
}

function parseUnits(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((entry) => cleanText(entry)).filter(Boolean)));
  }
  if (typeof value === 'string') {
    return Array.from(new Set(value.split(/\r?\n|,|;|\|/).map((entry) => cleanText(entry)).filter(Boolean)));
  }
  return [];
}

function normalizeReplacePayload(payload) {
  const base = payload && typeof payload === 'object' ? payload : {};
  return {
    username: cleanText(base.username || base.userName || base.UserName),
    units: parseUnits(base.units || base.reviewUnits || base.reviewScopeUnits || base.UnitValue),
    actorName: cleanText(base.actorName),
    actorEmail: cleanText(base.actorEmail),
    backendMode: cleanText(base.backendMode) || 'a3-campus-backend',
    recordSource: cleanText(base.recordSource) || 'frontend'
  };
}

function validateActionEnvelope(envelope, expectedAction) {
  const action = cleanText(envelope && envelope.action);
  if (!action) throw createError('Missing action.', 400);
  if (expectedAction && action !== expectedAction) {
    throw createError(`Unexpected action: ${action}`, 400);
  }
}

function validateReplacePayload(payload) {
  const normalized = normalizeReplacePayload(payload);
  if (!normalized.username) throw createError('Missing username.', 400);
  return normalized;
}

function createReviewScopeRecord(payload, unit, now) {
  const base = normalizeReplacePayload(payload);
  const timestamp = cleanText(now) || new Date().toISOString();
  const normalizedUnit = cleanText(unit);
  return {
    id: `${base.username}::${normalizedUnit}`,
    username: base.username,
    unit: normalizedUnit,
    createdAt: timestamp,
    updatedAt: timestamp,
    backendMode: base.backendMode,
    recordSource: base.recordSource
  };
}

function mapReviewScopeToGraphFields(entry) {
  return {
    Title: cleanText(entry.id) || `${cleanText(entry.username)}::${cleanText(entry.unit)}`,
    ReviewScopeKey: cleanText(entry.id) || `${cleanText(entry.username)}::${cleanText(entry.unit)}`,
    UserName: cleanText(entry.username),
    UnitValue: cleanText(entry.unit),
    CreatedAt: cleanText(entry.createdAt) || null,
    UpdatedAt: cleanText(entry.updatedAt) || null,
    BackendMode: cleanText(entry.backendMode) || 'a3-campus-backend',
    RecordSource: cleanText(entry.recordSource) || 'frontend'
  };
}

function mapGraphFieldsToReviewScope(fields) {
  return {
    id: cleanText(fields.ReviewScopeKey || fields.ScopeId || fields.Title),
    username: cleanText(fields.UserName),
    unit: cleanText(fields.UnitValue),
    createdAt: cleanText(fields.CreatedAt),
    updatedAt: cleanText(fields.UpdatedAt),
    backendMode: cleanText(fields.BackendMode) || 'a3-campus-backend',
    recordSource: cleanText(fields.RecordSource) || 'frontend'
  };
}

module.exports = {
  CONTRACT_VERSION,
  ACTIONS,
  buildErrorResponse,
  buildJsonResponse,
  cleanText,
  createError,
  createReviewScopeRecord,
  mapGraphFieldsToReviewScope,
  mapReviewScopeToGraphFields,
  normalizeReplacePayload,
  parseUnits,
  validateActionEnvelope,
  validateReplacePayload
};
