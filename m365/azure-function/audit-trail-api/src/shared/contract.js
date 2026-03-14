const CONTRACT_VERSION = '2026-03-14';

function cleanText(value) {
  return String(value || '').trim();
}

function createError(message, statusCode) {
  const error = new Error(cleanText(message) || 'Unknown error');
  error.statusCode = statusCode || 400;
  return error;
}

function buildJsonResponse(status, jsonBody, headers) {
  return {
    status: status || 200,
    headers: headers || {},
    jsonBody: jsonBody || {}
  };
}

function buildErrorResponse(error, fallbackMessage, fallbackStatus) {
  const status = Number(error && error.statusCode) || fallbackStatus || 500;
  return buildJsonResponse(status, {
    ok: false,
    error: cleanText(error && error.message) || cleanText(fallbackMessage) || 'Unexpected error',
    contractVersion: CONTRACT_VERSION
  });
}

function tryParseJson(value) {
  const raw = cleanText(value);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function buildPayloadPreview(value) {
  const raw = cleanText(value);
  if (!raw) return '';
  return raw.length > 220 ? `${raw.slice(0, 220)}...` : raw;
}

function mapGraphFieldsToAuditEntry(fields) {
  const payloadJson = cleanText(fields && fields.PayloadJson);
  const payload = tryParseJson(payloadJson);
  return {
    title: cleanText(fields && fields.Title),
    eventType: cleanText(fields && fields.EventType),
    actorEmail: cleanText(fields && fields.ActorEmail),
    targetEmail: cleanText(fields && fields.TargetEmail),
    unitCode: cleanText(fields && fields.UnitCode),
    recordId: cleanText(fields && fields.RecordId),
    occurredAt: cleanText(fields && fields.OccurredAt),
    payloadJson,
    payload,
    payloadPreview: buildPayloadPreview(payloadJson)
  };
}

function summarizeAuditEntries(items) {
  const rows = Array.isArray(items) ? items : [];
  const eventTypeCounts = new Map();
  const actorEmails = new Set();
  let latestOccurredAt = '';

  rows.forEach((entry) => {
    const eventType = cleanText(entry && entry.eventType) || 'unknown';
    eventTypeCounts.set(eventType, (eventTypeCounts.get(eventType) || 0) + 1);
    const actorEmail = cleanText(entry && entry.actorEmail);
    if (actorEmail) actorEmails.add(actorEmail);
    const occurredAt = cleanText(entry && entry.occurredAt);
    if (occurredAt && (!latestOccurredAt || occurredAt > latestOccurredAt)) latestOccurredAt = occurredAt;
  });

  return {
    total: rows.length,
    actorCount: actorEmails.size,
    latestOccurredAt,
    eventTypes: Array.from(eventTypeCounts.entries())
      .map(([eventType, count]) => ({ eventType, count }))
      .sort((left, right) => right.count - left.count || left.eventType.localeCompare(right.eventType, 'zh-Hant'))
  };
}

module.exports = {
  CONTRACT_VERSION,
  cleanText,
  createError,
  buildJsonResponse,
  buildErrorResponse,
  mapGraphFieldsToAuditEntry,
  summarizeAuditEntries
};
