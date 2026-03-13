const CONTRACT_VERSION = '2026-03-12';

const ACTIONS = {
  CREATE: 'corrective-action.create',
  LIST: 'corrective-action.list',
  DETAIL: 'corrective-action.detail',
  RESPOND: 'corrective-action.respond',
  REVIEW: 'corrective-action.review',
  TRACKING_SUBMIT: 'corrective-action.tracking.submit',
  TRACKING_REVIEW: 'corrective-action.tracking.review'
};

const STATUSES = {
  CREATED: '開立',
  PENDING: '待矯正',
  PROPOSED: '已提案',
  REVIEWING: '審核中',
  TRACKING: '追蹤中',
  CLOSED: '結案'
};

const REVIEW_DECISIONS = {
  START_REVIEW: 'start_review',
  CLOSE: 'close',
  TRACKING: 'tracking',
  RETURN: 'return'
};

const TRACKING_REVIEW_DECISIONS = {
  CLOSE: 'close',
  CONTINUE: 'continue'
};

const TRACKING_RESULTS = {
  REQUEST_CLOSE: '擬請同意結案',
  CONTINUE: '建議持續追蹤'
};

function cleanText(value) {
  return String(value || '').trim();
}

function cleanTextArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => cleanText(entry)).filter(Boolean);
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

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode || 400;
  return error;
}

function validateActionEnvelope(envelope, expectedAction) {
  if (!envelope || typeof envelope !== 'object') {
    throw createError('無效的 request envelope。', 400);
  }
  const action = cleanText(envelope.action);
  if (!action) throw createError('缺少 action。', 400);
  if (expectedAction && action !== expectedAction) {
    throw createError('action 與 API 路由不相符。', 400);
  }
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

function normalizeHistoryEntry(entry) {
  const base = entry && typeof entry === 'object' ? entry : {};
  return {
    time: cleanText(base.time),
    action: cleanText(base.action),
    user: cleanText(base.user)
  };
}

function normalizeTrackingEntry(entry) {
  const base = entry && typeof entry === 'object' ? entry : {};
  return {
    round: Number.isFinite(Number(base.round)) ? Number(base.round) : null,
    tracker: cleanText(base.tracker),
    trackDate: cleanText(base.trackDate),
    execution: cleanText(base.execution),
    trackNote: cleanText(base.trackNote),
    result: cleanText(base.result),
    requestedResult: cleanText(base.requestedResult),
    decision: cleanText(base.decision),
    nextTrackDate: cleanText(base.nextTrackDate),
    reviewer: cleanText(base.reviewer),
    reviewDate: cleanText(base.reviewDate),
    reviewedAt: cleanText(base.reviewedAt),
    submittedAt: cleanText(base.submittedAt),
    evidence: Array.isArray(base.evidence)
      ? base.evidence.map(normalizeAttachment).filter((item) => item.attachmentId || item.name)
      : []
  };
}

function normalizePendingTracking(entry) {
  const normalized = normalizeTrackingEntry(entry);
  return normalized.tracker || normalized.trackDate || normalized.execution || normalized.trackNote || normalized.result || normalized.nextTrackDate || normalized.evidence.length
    ? normalized
    : null;
}

function normalizeStoredCase(entry) {
  const base = entry && typeof entry === 'object' ? entry : {};
  return {
    id: cleanText(base.id),
    documentNo: cleanText(base.documentNo),
    caseSeq: Number.isFinite(Number(base.caseSeq)) ? Number(base.caseSeq) : null,
    proposerUnit: cleanText(base.proposerUnit),
    proposerUnitCode: cleanText(base.proposerUnitCode),
    proposerName: cleanText(base.proposerName),
    proposerUsername: cleanText(base.proposerUsername),
    proposerDate: cleanText(base.proposerDate),
    handlerUnit: cleanText(base.handlerUnit),
    handlerUnitCode: cleanText(base.handlerUnitCode),
    handlerName: cleanText(base.handlerName),
    handlerUsername: cleanText(base.handlerUsername),
    handlerEmail: cleanText(base.handlerEmail),
    handlerDate: cleanText(base.handlerDate),
    deficiencyType: cleanText(base.deficiencyType),
    source: cleanText(base.source),
    category: cleanTextArray(base.category),
    clause: cleanText(base.clause),
    problemDesc: cleanText(base.problemDesc),
    occurrence: cleanText(base.occurrence),
    correctiveAction: cleanText(base.correctiveAction),
    correctiveDueDate: cleanText(base.correctiveDueDate),
    rootCause: cleanText(base.rootCause),
    riskDesc: cleanText(base.riskDesc),
    riskAcceptor: cleanText(base.riskAcceptor),
    riskAcceptDate: cleanText(base.riskAcceptDate),
    riskAssessDate: cleanText(base.riskAssessDate),
    rootElimination: cleanText(base.rootElimination),
    rootElimDueDate: cleanText(base.rootElimDueDate),
    reviewResult: cleanText(base.reviewResult),
    reviewNextDate: cleanText(base.reviewNextDate),
    reviewer: cleanText(base.reviewer),
    reviewDate: cleanText(base.reviewDate),
    pendingTracking: normalizePendingTracking(base.pendingTracking),
    trackings: Array.isArray(base.trackings) ? base.trackings.map(normalizeTrackingEntry) : [],
    status: cleanText(base.status) || STATUSES.PENDING,
    createdAt: cleanText(base.createdAt),
    updatedAt: cleanText(base.updatedAt),
    closedDate: cleanText(base.closedDate),
    evidence: Array.isArray(base.evidence) ? base.evidence.map(normalizeAttachment).filter((item) => item.attachmentId || item.name) : [],
    history: Array.isArray(base.history) ? base.history.map(normalizeHistoryEntry).filter((item) => item.time || item.action || item.user) : [],
    backendMode: cleanText(base.backendMode) || 'a3-campus-backend',
    recordSource: cleanText(base.recordSource) || 'frontend'
  };
}

function mapCaseForClient(entry) {
  return normalizeStoredCase(entry);
}

function mapCaseToGraphFields(entry) {
  const item = normalizeStoredCase(entry);
  return {
    Title: item.id,
    CaseId: item.id,
    DocumentNo: item.documentNo,
    CaseSeq: item.caseSeq,
    ProposerUnit: item.proposerUnit,
    ProposerUnitCode: item.proposerUnitCode,
    ProposerName: item.proposerName,
    ProposerUsername: item.proposerUsername,
    ProposerDate: item.proposerDate || null,
    HandlerUnit: item.handlerUnit,
    HandlerUnitCode: item.handlerUnitCode,
    HandlerName: item.handlerName,
    HandlerUsername: item.handlerUsername,
    HandlerEmail: item.handlerEmail,
    HandlerDate: item.handlerDate || null,
    DeficiencyType: item.deficiencyType,
    Source: item.source,
    CategoryJson: JSON.stringify(item.category || []),
    Clause: item.clause,
    ProblemDescription: item.problemDesc,
    Occurrence: item.occurrence,
    CorrectiveAction: item.correctiveAction,
    CorrectiveDueDate: item.correctiveDueDate || null,
    RootCause: item.rootCause,
    RiskDescription: item.riskDesc,
    RiskAcceptor: item.riskAcceptor,
    RiskAcceptDate: item.riskAcceptDate || null,
    RiskAssessDate: item.riskAssessDate || null,
    RootElimination: item.rootElimination,
    RootEliminationDueDate: item.rootElimDueDate || null,
    ReviewResult: item.reviewResult,
    ReviewNextDate: item.reviewNextDate || null,
    Reviewer: item.reviewer,
    ReviewDate: item.reviewDate || null,
    PendingTrackingJson: item.pendingTracking ? JSON.stringify(item.pendingTracking) : '',
    TrackingsJson: JSON.stringify(item.trackings || []),
    Status: item.status,
    CreatedAt: item.createdAt || null,
    UpdatedAt: item.updatedAt || null,
    ClosedDate: item.closedDate || null,
    EvidenceJson: JSON.stringify(item.evidence || []),
    HistoryJson: JSON.stringify(item.history || []),
    BackendMode: item.backendMode,
    RecordSource: item.recordSource
  };
}

function mapGraphFieldsToCase(fields) {
  return normalizeStoredCase({
    id: fields.CaseId || fields.Title,
    documentNo: fields.DocumentNo,
    caseSeq: fields.CaseSeq,
    proposerUnit: fields.ProposerUnit,
    proposerUnitCode: fields.ProposerUnitCode,
    proposerName: fields.ProposerName,
    proposerUsername: fields.ProposerUsername,
    proposerDate: fields.ProposerDate,
    handlerUnit: fields.HandlerUnit,
    handlerUnitCode: fields.HandlerUnitCode,
    handlerName: fields.HandlerName,
    handlerUsername: fields.HandlerUsername,
    handlerEmail: fields.HandlerEmail,
    handlerDate: fields.HandlerDate,
    deficiencyType: fields.DeficiencyType,
    source: fields.Source,
    category: normalizeJsonField(fields.CategoryJson, []),
    clause: fields.Clause,
    problemDesc: fields.ProblemDescription,
    occurrence: fields.Occurrence,
    correctiveAction: fields.CorrectiveAction,
    correctiveDueDate: fields.CorrectiveDueDate,
    rootCause: fields.RootCause,
    riskDesc: fields.RiskDescription,
    riskAcceptor: fields.RiskAcceptor,
    riskAcceptDate: fields.RiskAcceptDate,
    riskAssessDate: fields.RiskAssessDate,
    rootElimination: fields.RootElimination,
    rootElimDueDate: fields.RootEliminationDueDate,
    reviewResult: fields.ReviewResult,
    reviewNextDate: fields.ReviewNextDate,
    reviewer: fields.Reviewer,
    reviewDate: fields.ReviewDate,
    pendingTracking: normalizeJsonField(fields.PendingTrackingJson, null),
    trackings: normalizeJsonField(fields.TrackingsJson, []),
    status: fields.Status,
    createdAt: fields.CreatedAt,
    updatedAt: fields.UpdatedAt,
    closedDate: fields.ClosedDate,
    evidence: normalizeJsonField(fields.EvidenceJson, []),
    history: normalizeJsonField(fields.HistoryJson, []),
    backendMode: fields.BackendMode,
    recordSource: fields.RecordSource
  });
}

function createCaseRecord(payload, nowIso) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const now = cleanText(nowIso) || new Date().toISOString();
  return normalizeStoredCase({
    id: source.id,
    documentNo: source.documentNo,
    caseSeq: source.caseSeq,
    proposerUnit: source.proposerUnit,
    proposerUnitCode: source.proposerUnitCode,
    proposerName: source.proposerName,
    proposerUsername: source.proposerUsername,
    proposerDate: source.proposerDate,
    handlerUnit: source.handlerUnit,
    handlerUnitCode: source.handlerUnitCode,
    handlerName: source.handlerName,
    handlerUsername: source.handlerUsername,
    handlerEmail: source.handlerEmail,
    handlerDate: source.handlerDate,
    deficiencyType: source.deficiencyType,
    source: source.source,
    category: source.category,
    clause: source.clause,
    problemDesc: source.problemDesc,
    occurrence: source.occurrence,
    correctiveAction: '',
    correctiveDueDate: source.correctiveDueDate,
    rootCause: '',
    riskDesc: '',
    riskAcceptor: '',
    riskAcceptDate: '',
    riskAssessDate: '',
    rootElimination: '',
    rootElimDueDate: '',
    reviewResult: '',
    reviewNextDate: '',
    reviewer: '',
    reviewDate: '',
    pendingTracking: null,
    trackings: [],
    status: STATUSES.PENDING,
    createdAt: now,
    updatedAt: now,
    closedDate: '',
    evidence: [],
    history: Array.isArray(source.history) ? source.history : [],
    backendMode: source.backendMode || 'a3-campus-backend',
    recordSource: source.recordSource || 'frontend'
  });
}

function normalizeCreatePayload(payload) {
  const base = payload && typeof payload === 'object' ? payload : {};
  return {
    id: cleanText(base.id),
    documentNo: cleanText(base.documentNo),
    caseSeq: Number.isFinite(Number(base.caseSeq)) ? Number(base.caseSeq) : null,
    proposerUnit: cleanText(base.proposerUnit),
    proposerUnitCode: cleanText(base.proposerUnitCode),
    proposerName: cleanText(base.proposerName),
    proposerUsername: cleanText(base.proposerUsername),
    proposerDate: cleanText(base.proposerDate),
    handlerUnit: cleanText(base.handlerUnit),
    handlerUnitCode: cleanText(base.handlerUnitCode),
    handlerName: cleanText(base.handlerName),
    handlerUsername: cleanText(base.handlerUsername),
    handlerEmail: cleanText(base.handlerEmail),
    handlerDate: cleanText(base.handlerDate),
    deficiencyType: cleanText(base.deficiencyType),
    source: cleanText(base.source),
    category: cleanTextArray(base.category),
    clause: cleanText(base.clause),
    problemDesc: cleanText(base.problemDesc),
    occurrence: cleanText(base.occurrence),
    correctiveDueDate: cleanText(base.correctiveDueDate),
    actorName: cleanText(base.actorName),
    actorUsername: cleanText(base.actorUsername)
  };
}

function normalizeRespondPayload(payload) {
  const base = payload && typeof payload === 'object' ? payload : {};
  return {
    correctiveAction: cleanText(base.correctiveAction),
    correctiveDueDate: cleanText(base.correctiveDueDate),
    rootCause: cleanText(base.rootCause),
    rootElimination: cleanText(base.rootElimination),
    rootElimDueDate: cleanText(base.rootElimDueDate),
    riskDesc: cleanText(base.riskDesc),
    riskAcceptor: cleanText(base.riskAcceptor),
    riskAcceptDate: cleanText(base.riskAcceptDate),
    riskAssessDate: cleanText(base.riskAssessDate),
    evidence: Array.isArray(base.evidence) ? base.evidence.map(normalizeAttachment).filter((item) => item.attachmentId || item.name) : [],
    actorName: cleanText(base.actorName),
    actorUsername: cleanText(base.actorUsername)
  };
}

function normalizeReviewPayload(payload) {
  const base = payload && typeof payload === 'object' ? payload : {};
  return {
    decision: cleanText(base.decision),
    actorName: cleanText(base.actorName),
    actorUsername: cleanText(base.actorUsername)
  };
}

function normalizeTrackingSubmitPayload(payload) {
  const base = payload && typeof payload === 'object' ? payload : {};
  return {
    tracker: cleanText(base.tracker),
    trackDate: cleanText(base.trackDate),
    execution: cleanText(base.execution),
    trackNote: cleanText(base.trackNote),
    result: cleanText(base.result),
    nextTrackDate: cleanText(base.nextTrackDate),
    evidence: Array.isArray(base.evidence) ? base.evidence.map(normalizeAttachment).filter((item) => item.attachmentId || item.name) : [],
    actorName: cleanText(base.actorName),
    actorUsername: cleanText(base.actorUsername)
  };
}

function normalizeTrackingReviewPayload(payload) {
  const base = payload && typeof payload === 'object' ? payload : {};
  return {
    decision: cleanText(base.decision),
    actorName: cleanText(base.actorName),
    actorUsername: cleanText(base.actorUsername)
  };
}

function validateCreatePayload(payload) {
  if (!payload.id) throw createError('缺少矯正單編號。', 400);
  if (!payload.proposerUnit) throw createError('缺少提報單位。', 400);
  if (!payload.proposerName) throw createError('缺少提報人姓名。', 400);
  if (!payload.proposerDate) throw createError('缺少提報日期。', 400);
  if (!payload.handlerUnit) throw createError('缺少處理單位。', 400);
  if (!payload.handlerName) throw createError('缺少處理人員。', 400);
  if (!payload.deficiencyType) throw createError('缺少缺失類型。', 400);
  if (!payload.source) throw createError('缺少來源。', 400);
  if (!payload.category.length) throw createError('至少要有一個分類。', 400);
  if (!payload.problemDesc) throw createError('缺少問題描述。', 400);
  if (!payload.occurrence) throw createError('缺少缺失說明。', 400);
  if (!payload.correctiveDueDate) throw createError('缺少改善期限。', 400);
}

function validateRespondPayload(payload) {
  if (!payload.correctiveAction) throw createError('缺少改善措施。', 400);
  if (!payload.rootCause) throw createError('缺少根因分析。', 400);
  if (!payload.rootElimination) throw createError('缺少根因消除措施。', 400);
}

function validateReviewPayload(payload) {
  if (!Object.values(REVIEW_DECISIONS).includes(payload.decision)) {
    throw createError('審核決定無效。', 400);
  }
}

function validateTrackingSubmitPayload(payload) {
  if (!payload.tracker) throw createError('缺少追蹤填報人。', 400);
  if (!payload.trackDate) throw createError('缺少追蹤日期。', 400);
  if (!payload.execution) throw createError('缺少改善措施執行情形。', 400);
  if (!payload.trackNote) throw createError('缺少追蹤觀察與說明。', 400);
  if (!payload.result) throw createError('缺少追蹤建議。', 400);
  if (payload.result === TRACKING_RESULTS.CONTINUE && !payload.nextTrackDate) {
    throw createError('建議持續追蹤時，必須填寫下一次追蹤日期。', 400);
  }
  if (payload.result === TRACKING_RESULTS.REQUEST_CLOSE && !payload.evidence.length) {
    throw createError('擬請同意結案時，必須上傳佐證資料。', 400);
  }
}

function validateTrackingReviewPayload(payload) {
  if (!Object.values(TRACKING_REVIEW_DECISIONS).includes(payload.decision)) {
    throw createError('追蹤審核決定無效。', 400);
  }
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
  const message = cleanText(error && error.message) || fallbackMessage || '流程處理失敗。';
  const status = Number((error && error.statusCode) || fallbackStatus || 400);
  return buildJsonResponse(status, {
    ok: false,
    message
  });
}

module.exports = {
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
};
