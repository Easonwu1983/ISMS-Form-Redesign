// @ts-check
const CONTRACT_VERSION = '2026-04-02';

const ACTIONS = {
  LIST: 'checklist.list',
  DETAIL: 'checklist.detail',
  SAVE_DRAFT: 'checklist.save-draft',
  SUBMIT: 'checklist.submit',
  DELETE_YEAR: 'checklist.delete-year'
};

const STATUSES = {
  DRAFT: '\u8349\u7a3f',
  SUBMITTED: '\u5df2\u9001\u51fa'
};

const SIGN_STATUSES = {
  PENDING: '\u5f85\u7c3d\u6838',
  SIGNED: '\u5df2\u7c3d\u6838'
};

function cleanText(value) {
  return String(value || '').trim();
}

function getCurrentAuditYear() {
  return Number(new Date().getFullYear() - 1911);
}

function isValidAuditYear(value, options) {
  const raw = cleanText(value);
  if (!/^\d{3}$/.test(raw)) return false;
  const year = Number(raw);
  const opts = options && typeof options === 'object' ? options : {};
  const minYear = Math.max(1, Number(opts.minYear) || 90);
  const maxYear = Math.max(minYear, Number(opts.maxYear) || (getCurrentAuditYear() + 1));
  return Number.isFinite(year) && year >= minYear && year <= maxYear;
}

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode || 400;
  return error;
}

function normalizeJsonField(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return typeof fallback === 'function' ? fallback() : fallback;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_) {
      return typeof fallback === 'function' ? fallback() : fallback;
    }
  }
  return value;
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeAttachment(entry) {
  const base = entry && typeof entry === 'object' ? entry : {};
  return {
    attachmentId: cleanText(base.attachmentId),
    driveItemId: cleanText(base.driveItemId),
    name: cleanText(base.name),
    type: cleanText(base.type || base.contentType),
    contentType: cleanText(base.contentType || base.type),
    size: Number.isFinite(Number(base.size)) ? Number(base.size) : 0,
    extension: cleanText(base.extension).toLowerCase(),
    signature: cleanText(base.signature),
    storedAt: cleanText(base.storedAt),
    uploadedAt: cleanText(base.uploadedAt || base.storedAt),
    scope: cleanText(base.scope),
    ownerId: cleanText(base.ownerId),
    recordType: cleanText(base.recordType),
    webUrl: cleanText(base.webUrl),
    downloadUrl: cleanText(base.downloadUrl),
    path: cleanText(base.path),
    storage: cleanText(base.storage) || (cleanText(base.driveItemId) || cleanText(base.downloadUrl) || cleanText(base.webUrl) ? 'm365' : '')
  };
}

function normalizeChecklistResult(entry) {
  const base = entry && typeof entry === 'object' ? entry : {};
  return {
    compliance: cleanText(base.compliance),
    execution: cleanText(base.execution),
    evidence: cleanText(base.evidence),
    evidenceFiles: Array.isArray(base.evidenceFiles)
      ? base.evidenceFiles.map(normalizeAttachment).filter((item) => item.attachmentId || item.name)
      : normalizeJsonField(base.evidenceFiles, () => []).map(normalizeAttachment).filter((item) => item.attachmentId || item.name)
  };
}

function normalizeChecklistResultsMap(value) {
  const base = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const next = {};
  Object.keys(base).forEach((key) => {
    const cleanKey = cleanText(key);
    if (!cleanKey) return;
    next[cleanKey] = normalizeChecklistResult(base[key]);
  });
  return next;
}

function normalizeChecklistSummary(value) {
  const base = value && typeof value === 'object' ? value : {};
  return {
    total: normalizeNumber(base.total),
    conform: normalizeNumber(base.conform),
    partial: normalizeNumber(base.partial),
    nonConform: normalizeNumber(base.nonConform),
    na: normalizeNumber(base.na)
  };
}

function normalizeChecklistStatus(value) {
  const raw = cleanText(value);
  if (!raw || raw === STATUSES.DRAFT || raw.toLowerCase() === 'draft') return STATUSES.DRAFT;
  if (raw === STATUSES.SUBMITTED || raw.toLowerCase() === 'submitted') return STATUSES.SUBMITTED;
  return raw;
}

function normalizeSignStatus(value) {
  const raw = cleanText(value);
  if (!raw || raw === SIGN_STATUSES.PENDING) return SIGN_STATUSES.PENDING;
  if (raw === SIGN_STATUSES.SIGNED) return SIGN_STATUSES.SIGNED;
  return raw;
}

function parseChecklistId(value) {
  const match = cleanText(value).toUpperCase().match(/^(CHK-\d{3}-([A-Z0-9]+))-(\d+)$/);
  if (!match) return null;
  return {
    documentNo: match[1],
    unitCode: match[2],
    sequence: Number(match[3]),
    sequenceText: match[3]
  };
}

function countAnsweredResults(results) {
  return Object.values(normalizeChecklistResultsMap(results)).reduce((count, item) => {
    return count + (cleanText(item.compliance) ? 1 : 0);
  }, 0);
}

function normalizeStoredChecklist(entry) {
  const base = entry && typeof entry === 'object' ? entry : {};
  const parsedId = parseChecklistId(base.id);
  const results = normalizeChecklistResultsMap(normalizeJsonField(base.results, () => ({})));
  return {
    id: cleanText(base.id),
    documentNo: cleanText(base.documentNo) || (parsedId ? parsedId.documentNo : ''),
    checklistSeq: Number.isFinite(Number(base.checklistSeq)) ? Number(base.checklistSeq) : (parsedId ? parsedId.sequence : null),
    unit: cleanText(base.unit),
    unitCode: cleanText(base.unitCode) || (parsedId ? parsedId.unitCode : ''),
    fillerName: cleanText(base.fillerName),
    fillerUsername: cleanText(base.fillerUsername),
    fillDate: cleanText(base.fillDate),
    auditYear: cleanText(base.auditYear),
    supervisorName: cleanText(base.supervisorName || base.supervisor),
    supervisorTitle: cleanText(base.supervisorTitle),
    signStatus: normalizeSignStatus(base.signStatus),
    signDate: cleanText(base.signDate),
    supervisorNote: cleanText(base.supervisorNote),
    results,
    summary: normalizeChecklistSummary(base.summary),
    answeredCount: countAnsweredResults(results),
    status: normalizeChecklistStatus(base.status),
    createdAt: cleanText(base.createdAt),
    updatedAt: cleanText(base.updatedAt),
    backendMode: cleanText(base.backendMode) || 'a3-campus-backend',
    recordSource: cleanText(base.recordSource) || 'frontend'
  };
}

function mapChecklistForClient(entry) {
  return normalizeStoredChecklist(entry);
}

function mapChecklistToGraphFields(entry) {
  const item = normalizeStoredChecklist(entry);
  return {
    Title: item.id,
    ChecklistId: item.id,
    DocumentNo: item.documentNo,
    ChecklistSeq: item.checklistSeq,
    Unit: item.unit,
    UnitCode: item.unitCode,
    FillerName: item.fillerName,
    FillerUsername: item.fillerUsername,
    FillDate: item.fillDate || null,
    AuditYear: item.auditYear,
    SupervisorName: item.supervisorName,
    SupervisorTitle: item.supervisorTitle,
    SignStatus: item.signStatus,
    SignDate: item.signDate || null,
    SupervisorNote: item.supervisorNote,
    ResultsJson: JSON.stringify(item.results || {}),
    SummaryTotal: item.summary.total,
    SummaryConform: item.summary.conform,
    SummaryPartial: item.summary.partial,
    SummaryNonConform: item.summary.nonConform,
    SummaryNa: item.summary.na,
    Status: item.status,
    CreatedAt: item.createdAt || null,
    UpdatedAt: item.updatedAt || null,
    BackendMode: item.backendMode,
    RecordSource: item.recordSource
  };
}

function mapGraphFieldsToChecklist(fields) {
  return normalizeStoredChecklist({
    id: fields.ChecklistId || fields.Title,
    documentNo: fields.DocumentNo,
    checklistSeq: fields.ChecklistSeq,
    unit: fields.Unit,
    unitCode: fields.UnitCode,
    fillerName: fields.FillerName,
    fillerUsername: fields.FillerUsername,
    fillDate: fields.FillDate,
    auditYear: fields.AuditYear,
    supervisorName: fields.SupervisorName,
    supervisorTitle: fields.SupervisorTitle,
    signStatus: fields.SignStatus,
    signDate: fields.SignDate,
    supervisorNote: fields.SupervisorNote,
    results: normalizeJsonField(fields.ResultsJson, () => ({})),
    summary: {
      total: fields.SummaryTotal,
      conform: fields.SummaryConform,
      partial: fields.SummaryPartial,
      nonConform: fields.SummaryNonConform,
      na: fields.SummaryNa
    },
    status: fields.Status,
    createdAt: fields.CreatedAt,
    updatedAt: fields.UpdatedAt,
    backendMode: fields.BackendMode,
    recordSource: fields.RecordSource
  });
}

function normalizeChecklistPayload(payload) {
  const base = payload && typeof payload === 'object' ? payload : {};
  return {
    id: cleanText(base.id),
    unit: cleanText(base.unit),
    fillerName: cleanText(base.fillerName),
    fillerUsername: cleanText(base.fillerUsername),
    fillDate: cleanText(base.fillDate),
    auditYear: cleanText(base.auditYear),
    supervisorName: cleanText(base.supervisorName || base.supervisor),
    supervisorTitle: cleanText(base.supervisorTitle),
    signStatus: normalizeSignStatus(base.signStatus),
    signDate: cleanText(base.signDate),
    supervisorNote: cleanText(base.supervisorNote),
    results: normalizeChecklistResultsMap(base.results),
    summary: normalizeChecklistSummary(base.summary),
    createdAt: cleanText(base.createdAt),
    updatedAt: cleanText(base.updatedAt),
    actorName: cleanText(base.actorName),
    actorUsername: cleanText(base.actorUsername),
    backendMode: cleanText(base.backendMode) || 'a3-campus-backend',
    recordSource: cleanText(base.recordSource) || 'frontend'
  };
}

function validateActionEnvelope(envelope, expectedAction) {
  if (!envelope || typeof envelope !== 'object') {
    throw createError('\u7121\u6548\u7684 request envelope\u3002', 400);
  }
  const action = cleanText(envelope.action);
  if (!action) throw createError('\u7f3a\u5c11 action\u3002', 400);
  if (expectedAction && action !== expectedAction) {
    throw createError('action \u8207 API \u8def\u7531\u4e0d\u76f8\u7b26\u3002', 400);
  }
}

function validateChecklistPayload(payload, options) {
  const opts = options || {};
  if (!cleanText(payload.id)) throw createError('\u7f3a\u5c11\u6aa2\u6838\u8868\u7de8\u865f\u3002', 400);
  if (!cleanText(payload.unit)) throw createError('\u7f3a\u5c11\u53d7\u7a3d\u55ae\u4f4d\u3002', 400);
  if (!cleanText(payload.fillerName)) throw createError('\u7f3a\u5c11\u586b\u5831\u4eba\u59d3\u540d\u3002', 400);
  if (!cleanText(payload.fillDate)) throw createError('\u7f3a\u5c11\u586b\u5831\u65e5\u671f\u3002', 400);
  if (!cleanText(payload.auditYear)) throw createError('\u7f3a\u5c11\u7a3d\u6838\u5e74\u5ea6\u3002', 400);
  if (!isValidAuditYear(payload.auditYear)) {
    const minYear = 90;
    const maxYear = getCurrentAuditYear() + 1;
    throw createError(`\u7a3d\u6838\u5e74\u5ea6\u683c\u5f0f\u7121\u6548\uff0c\u8acb\u586b\u5beb\u6c11\u570b ${minYear}-${maxYear} \u5e74\u3002`, 400);
  }

  const summary = normalizeChecklistSummary(payload.summary);
  if (!Number.isFinite(summary.total) || summary.total < 0) {
    throw createError('\u6aa2\u6838\u8868\u7d71\u8a08\u7e3d\u6578\u7121\u6548\u3002', 400);
  }

  if (opts.requireSubmittedState) {
    if (!cleanText(payload.supervisorName)) throw createError('\u7f3a\u5c11\u6b0a\u8cac\u4e3b\u7ba1\u59d3\u540d\u3002', 400);
    if (!cleanText(payload.supervisorTitle)) throw createError('\u7f3a\u5c11\u4e3b\u7ba1\u8077\u7a31\u3002', 400);
    if (!cleanText(payload.signStatus)) throw createError('\u7f3a\u5c11\u7c3d\u6838\u72c0\u614b\u3002', 400);
    if (!cleanText(payload.signDate)) throw createError('\u7f3a\u5c11\u7c3d\u6838\u65e5\u671f\u3002', 400);
    const answeredCount = countAnsweredResults(payload.results);
    if (summary.total <= 0) throw createError('\u6aa2\u6838\u8868\u984c\u76ee\u7e3d\u6578\u7121\u6548\u3002', 400);
    if (answeredCount < summary.total) {
      throw createError('\u6aa2\u6838\u8868\u4ecd\u6709\u672a\u4f5c\u7b54\u984c\u76ee\uff0c\u7121\u6cd5\u6b63\u5f0f\u9001\u51fa\u3002', 400);
    }
  }
}

function createChecklistRecord(payload, status, now) {
  const normalized = normalizeChecklistPayload(payload);
  const parsedId = parseChecklistId(normalized.id);
  return normalizeStoredChecklist({
    ...normalized,
    documentNo: parsedId ? parsedId.documentNo : '',
    checklistSeq: parsedId ? parsedId.sequence : null,
    unitCode: parsedId ? parsedId.unitCode : '',
    status: status || STATUSES.DRAFT,
    createdAt: cleanText(normalized.createdAt) || now,
    updatedAt: now
  });
}

function buildJsonResponse(status, jsonBody) {
  return {
    status,
    jsonBody,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-ISMS-Contract-Version': CONTRACT_VERSION
    }
  };
}

function buildErrorResponse(error, fallbackMessage, fallbackStatus) {
  const message = cleanText(error && error.message) || fallbackMessage || '\u6d41\u7a0b\u8655\u7406\u5931\u6557\u3002';
  const status = Number((error && error.statusCode) || fallbackStatus || 400);
  return buildJsonResponse(status, {
    ok: false,
    message
  });
}

module.exports = {
  ACTIONS,
  CONTRACT_VERSION,
  SIGN_STATUSES,
  STATUSES,
  buildErrorResponse,
  buildJsonResponse,
  cleanText,
  countAnsweredResults,
  createChecklistRecord,
  createError,
  mapChecklistForClient,
  mapChecklistToGraphFields,
  mapGraphFieldsToChecklist,
  normalizeChecklistPayload,
  normalizeStoredChecklist,
  parseChecklistId,
  isValidAuditYear,
  validateActionEnvelope,
  validateChecklistPayload
};
