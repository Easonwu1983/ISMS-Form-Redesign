// @ts-check
const CONTRACT_VERSION = '2026-04-02';

const FORM_ACTIONS = {
  LIST: 'training.form.list',
  DETAIL: 'training.form.detail',
  SAVE_DRAFT: 'training.form.save-draft',
  SUBMIT_STEP_ONE: 'training.form.submit-step-one',
  MARK_PRINTED: 'training.form.mark-printed',
  FINALIZE: 'training.form.finalize',
  RETURN: 'training.form.return',
  UNDO: 'training.form.undo',
  DELETE: 'training.form.delete'
};

const ROSTER_ACTIONS = {
  LIST: 'training.roster.list',
  UPSERT: 'training.roster.upsert',
  UPSERT_BATCH: 'training.roster.upsert-batch',
  DELETE: 'training.roster.delete',
  DELETE_BATCH: 'training.roster.delete-batch'
};

const FORM_STATUSES = {
  DRAFT: '暫存',
  PENDING_SIGNOFF: '待簽核',
  SUBMITTED: '已完成填報',
  RETURNED: '退回更正'
};

const ROSTER_SOURCES = {
  IMPORT: 'import',
  MANUAL: 'manual'
};

function cleanText(value) {
  return String(value || '').trim();
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
  return Number.isFinite(parsed) ? parsed : 0;
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

function normalizeTrainingRecord(entry) {
  const base = entry && typeof entry === 'object' ? entry : {};
  return {
    rosterId: cleanText(base.rosterId),
    unit: cleanText(base.unit),
    statsUnit: cleanText(base.statsUnit),
    l1Unit: cleanText(base.l1Unit),
    name: cleanText(base.name),
    unitName: cleanText(base.unitName),
    identity: cleanText(base.identity),
    jobTitle: cleanText(base.jobTitle),
    source: cleanText(base.source) || ROSTER_SOURCES.IMPORT,
    status: cleanText(base.status),
    completedGeneral: cleanText(base.completedGeneral),
    isInfoStaff: cleanText(base.isInfoStaff),
    completedProfessional: cleanText(base.completedProfessional),
    note: cleanText(base.note),
    hours: base.hours === '' ? '' : normalizeNumber(base.hours)
  };
}

function normalizeTrainingSummary(entry) {
  const base = entry && typeof entry === 'object' ? entry : {};
  return {
    totalPeople: normalizeNumber(base.totalPeople),
    activeCount: normalizeNumber(base.activeCount),
    totalRoster: normalizeNumber(base.totalRoster),
    inactiveCount: normalizeNumber(base.inactiveCount),
    completedCount: normalizeNumber(base.completedCount),
    readyCount: normalizeNumber(base.readyCount),
    incompleteCount: normalizeNumber(base.incompleteCount),
    completionRate: normalizeNumber(base.completionRate),
    reachRate: normalizeNumber(base.reachRate),
    reached: normalizeNumber(base.reached),
    infoStaffCount: normalizeNumber(base.infoStaffCount),
    professionalPendingCount: normalizeNumber(base.professionalPendingCount),
    missingStatusCount: normalizeNumber(base.missingStatusCount),
    missingFieldCount: normalizeNumber(base.missingFieldCount)
  };
}

function normalizeFormStatus(value) {
  const raw = cleanText(value);
  if (!raw || raw === FORM_STATUSES.DRAFT || raw.toLowerCase() === 'draft') return FORM_STATUSES.DRAFT;
  if (raw === FORM_STATUSES.PENDING_SIGNOFF || raw.toLowerCase() === 'pending_signoff') return FORM_STATUSES.PENDING_SIGNOFF;
  if (raw === FORM_STATUSES.SUBMITTED || raw.toLowerCase() === 'submitted') return FORM_STATUSES.SUBMITTED;
  if (raw === FORM_STATUSES.RETURNED || raw.toLowerCase() === 'returned') return FORM_STATUSES.RETURNED;
  return raw;
}

function normalizeRosterSource(value) {
  const raw = cleanText(value).toLowerCase();
  if (raw === ROSTER_SOURCES.MANUAL) return ROSTER_SOURCES.MANUAL;
  return ROSTER_SOURCES.IMPORT;
}

function parseTrainingFormId(value) {
  const match = cleanText(value).toUpperCase().match(/^(TRN-\d{3}-([A-Z0-9]+))-(\d+)$/);
  if (!match) return null;
  return {
    documentNo: match[1],
    unitCode: match[2],
    sequence: Number(match[3]),
    sequenceText: match[3]
  };
}

function normalizeStoredTrainingForm(entry) {
  const base = entry && typeof entry === 'object' ? entry : {};
  const parsedId = parseTrainingFormId(base.id);
  const records = Array.isArray(base.records)
    ? base.records.map(normalizeTrainingRecord)
    : normalizeJsonField(base.records, () => []).map(normalizeTrainingRecord);
  return {
    id: cleanText(base.id),
    documentNo: cleanText(base.documentNo) || (parsedId ? parsedId.documentNo : ''),
    formSeq: Number.isFinite(Number(base.formSeq)) ? Number(base.formSeq) : (parsedId ? parsedId.sequence : null),
    unit: cleanText(base.unit),
    unitCode: cleanText(base.unitCode) || (parsedId ? parsedId.unitCode : ''),
    statsUnit: cleanText(base.statsUnit),
    fillerName: cleanText(base.fillerName),
    fillerUsername: cleanText(base.fillerUsername),
    submitterPhone: cleanText(base.submitterPhone),
    submitterEmail: cleanText(base.submitterEmail),
    fillDate: cleanText(base.fillDate),
    trainingYear: cleanText(base.trainingYear),
    status: normalizeFormStatus(base.status),
    records,
    summary: normalizeTrainingSummary(base.summary),
    signedFiles: Array.isArray(base.signedFiles)
      ? base.signedFiles.map(normalizeAttachment).filter((item) => item.attachmentId || item.name)
      : normalizeJsonField(base.signedFiles, () => []).map(normalizeAttachment).filter((item) => item.attachmentId || item.name),
    returnReason: cleanText(base.returnReason),
    createdAt: cleanText(base.createdAt),
    updatedAt: cleanText(base.updatedAt),
    stepOneSubmittedAt: cleanText(base.stepOneSubmittedAt),
    printedAt: cleanText(base.printedAt),
    signoffUploadedAt: cleanText(base.signoffUploadedAt),
    submittedAt: cleanText(base.submittedAt),
    history: Array.isArray(base.history)
      ? base.history.map(normalizeHistoryEntry).filter((item) => item.time || item.action || item.user)
      : normalizeJsonField(base.history, () => []).map(normalizeHistoryEntry).filter((item) => item.time || item.action || item.user),
    backendMode: cleanText(base.backendMode) || 'a3-campus-backend',
    recordSource: cleanText(base.recordSource) || 'frontend'
  };
}

function normalizeStoredTrainingRoster(entry) {
  const base = entry && typeof entry === 'object' ? entry : {};
  return {
    id: cleanText(base.id),
    unit: cleanText(base.unit),
    statsUnit: cleanText(base.statsUnit),
    l1Unit: cleanText(base.l1Unit),
    name: cleanText(base.name),
    unitName: cleanText(base.unitName),
    identity: cleanText(base.identity),
    jobTitle: cleanText(base.jobTitle),
    source: normalizeRosterSource(base.source),
    createdBy: cleanText(base.createdBy),
    createdByUsername: cleanText(base.createdByUsername),
    createdAt: cleanText(base.createdAt),
    updatedAt: cleanText(base.updatedAt),
    backendMode: cleanText(base.backendMode) || 'a3-campus-backend',
    recordSource: cleanText(base.recordSource) || 'frontend'
  };
}

function mapTrainingFormForClient(entry) {
  return normalizeStoredTrainingForm(entry);
}

function mapTrainingRosterForClient(entry) {
  return normalizeStoredTrainingRoster(entry);
}

function mapTrainingFormToGraphFields(entry) {
  const item = normalizeStoredTrainingForm(entry);
  return {
    Title: item.id,
    FormId: item.id,
    DocumentNo: item.documentNo,
    FormSeq: item.formSeq,
    Unit: item.unit,
    UnitCode: item.unitCode,
    StatsUnit: item.statsUnit,
    FillerName: item.fillerName,
    FillerUsername: item.fillerUsername,
    SubmitterPhone: item.submitterPhone,
    SubmitterEmail: item.submitterEmail,
    FillDate: item.fillDate || null,
    TrainingYear: item.trainingYear,
    Status: item.status,
    RecordsJson: JSON.stringify(item.records || []),
    SummaryJson: JSON.stringify(item.summary || {}),
    ActiveCount: item.summary.activeCount,
    CompletedCount: item.summary.completedCount,
    IncompleteCount: item.summary.incompleteCount,
    CompletionRate: item.summary.completionRate,
    SignedFilesJson: JSON.stringify(item.signedFiles || []),
    ReturnReason: item.returnReason,
    CreatedAt: item.createdAt || null,
    UpdatedAt: item.updatedAt || null,
    StepOneSubmittedAt: item.stepOneSubmittedAt || null,
    PrintedAt: item.printedAt || null,
    SignoffUploadedAt: item.signoffUploadedAt || null,
    SubmittedAt: item.submittedAt || null,
    HistoryJson: JSON.stringify(item.history || []),
    BackendMode: item.backendMode,
    RecordSource: item.recordSource
  };
}

function mapGraphFieldsToTrainingForm(fields) {
  return normalizeStoredTrainingForm({
    id: fields.FormId || fields.Title,
    documentNo: fields.DocumentNo,
    formSeq: fields.FormSeq,
    unit: fields.Unit,
    unitCode: fields.UnitCode,
    statsUnit: fields.StatsUnit,
    fillerName: fields.FillerName,
    fillerUsername: fields.FillerUsername,
    submitterPhone: fields.SubmitterPhone,
    submitterEmail: fields.SubmitterEmail,
    fillDate: fields.FillDate,
    trainingYear: fields.TrainingYear,
    status: fields.Status,
    records: normalizeJsonField(fields.RecordsJson, () => []),
    summary: normalizeJsonField(fields.SummaryJson, () => ({
      activeCount: fields.ActiveCount,
      completedCount: fields.CompletedCount,
      incompleteCount: fields.IncompleteCount,
      completionRate: fields.CompletionRate
    })),
    signedFiles: normalizeJsonField(fields.SignedFilesJson, () => []),
    returnReason: fields.ReturnReason,
    createdAt: fields.CreatedAt,
    updatedAt: fields.UpdatedAt,
    stepOneSubmittedAt: fields.StepOneSubmittedAt,
    printedAt: fields.PrintedAt,
    signoffUploadedAt: fields.SignoffUploadedAt,
    submittedAt: fields.SubmittedAt,
    history: normalizeJsonField(fields.HistoryJson, () => []),
    backendMode: fields.BackendMode,
    recordSource: fields.RecordSource
  });
}

function mapTrainingRosterToGraphFields(entry) {
  const item = normalizeStoredTrainingRoster(entry);
  return {
    Title: item.name || item.id,
    RosterId: item.id,
    Unit: item.unit,
    StatsUnit: item.statsUnit,
    L1Unit: item.l1Unit,
    Name: item.name,
    UnitName: item.unitName,
    Identity: item.identity,
    JobTitle: item.jobTitle,
    Source: item.source,
    CreatedBy: item.createdBy,
    CreatedByUsername: item.createdByUsername,
    CreatedAt: item.createdAt || null,
    UpdatedAt: item.updatedAt || null,
    BackendMode: item.backendMode,
    RecordSource: item.recordSource
  };
}

function mapGraphFieldsToTrainingRoster(fields) {
  return normalizeStoredTrainingRoster({
    id: fields.RosterId || fields.Title,
    unit: fields.Unit,
    statsUnit: fields.StatsUnit,
    l1Unit: fields.L1Unit,
    name: fields.Name || fields.Title,
    unitName: fields.UnitName,
    identity: fields.Identity,
    jobTitle: fields.JobTitle,
    source: fields.Source,
    createdBy: fields.CreatedBy,
    createdByUsername: fields.CreatedByUsername,
    createdAt: fields.CreatedAt,
    updatedAt: fields.UpdatedAt,
    backendMode: fields.BackendMode,
    recordSource: fields.RecordSource
  });
}

function normalizeTrainingFormPayload(payload) {
  const base = payload && typeof payload === 'object' ? payload : {};
  return {
    id: cleanText(base.id),
    unit: cleanText(base.unit),
    statsUnit: cleanText(base.statsUnit),
    fillerName: cleanText(base.fillerName),
    fillerUsername: cleanText(base.fillerUsername),
    submitterPhone: cleanText(base.submitterPhone),
    submitterEmail: cleanText(base.submitterEmail),
    fillDate: cleanText(base.fillDate),
    trainingYear: cleanText(base.trainingYear),
    status: normalizeFormStatus(base.status),
    records: Array.isArray(base.records) ? base.records.map(normalizeTrainingRecord) : [],
    summary: normalizeTrainingSummary(base.summary),
    signedFiles: Array.isArray(base.signedFiles) ? base.signedFiles.map(normalizeAttachment) : [],
    returnReason: cleanText(base.returnReason),
    createdAt: cleanText(base.createdAt),
    updatedAt: cleanText(base.updatedAt),
    stepOneSubmittedAt: cleanText(base.stepOneSubmittedAt),
    printedAt: cleanText(base.printedAt),
    signoffUploadedAt: cleanText(base.signoffUploadedAt),
    submittedAt: cleanText(base.submittedAt),
    history: Array.isArray(base.history) ? base.history.map(normalizeHistoryEntry) : [],
    actorName: cleanText(base.actorName),
    actorUsername: cleanText(base.actorUsername),
    backendMode: cleanText(base.backendMode) || 'a3-campus-backend',
    recordSource: cleanText(base.recordSource) || 'frontend'
  };
}

function normalizeTrainingRosterPayload(payload) {
  const base = payload && typeof payload === 'object' ? payload : {};
  return {
    id: cleanText(base.id),
    unit: cleanText(base.unit),
    statsUnit: cleanText(base.statsUnit),
    l1Unit: cleanText(base.l1Unit || base.statsUnit),
    name: cleanText(base.name),
    unitName: cleanText(base.unitName),
    identity: cleanText(base.identity),
    jobTitle: cleanText(base.jobTitle),
    source: normalizeRosterSource(base.source),
    createdBy: cleanText(base.createdBy),
    createdByUsername: cleanText(base.createdByUsername),
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
    throw createError('無效的 request envelope。', 400);
  }
  const action = cleanText(envelope.action);
  if (!action) throw createError('缺少 action。', 400);
  if (expectedAction && action !== expectedAction) {
    throw createError('action 與 API 路由不相符。', 400);
  }
}

function validateTrainingFormPayload(payload, options) {
  const opts = options || {};
  if (!cleanText(payload.id)) throw createError('缺少教育訓練統計編號。', 400);
  if (!cleanText(payload.unit)) throw createError('缺少填報單位。', 400);
  if (!cleanText(payload.fillerName)) throw createError('缺少填報人姓名。', 400);
  if (!cleanText(payload.fillDate)) throw createError('缺少填報日期。', 400);
  if (!cleanText(payload.trainingYear)) throw createError('缺少統計年度。', 400);
  if (opts.requireRecords && (!Array.isArray(payload.records) || payload.records.length === 0)) {
    throw createError('教育訓練統計至少要有一筆人員資料。', 400);
  }
  if (opts.requireSignedFiles && (!Array.isArray(payload.signedFiles) || payload.signedFiles.length === 0)) {
    throw createError('完成正式繳交前，必須上傳簽核掃描檔。', 400);
  }
  if (opts.requireReturnReason && !cleanText(payload.returnReason)) {
    throw createError('退回更正時必須提供原因。', 400);
  }
}

function validateTrainingRosterPayload(payload) {
  if (!cleanText(payload.unit)) throw createError('缺少名單所屬單位。', 400);
  if (!cleanText(payload.name)) throw createError('缺少名單姓名。', 400);
}

function createTrainingFormRecord(payload, status, now) {
  const base = normalizeTrainingFormPayload(payload);
  return normalizeStoredTrainingForm({
    ...base,
    status: normalizeFormStatus(status || base.status),
    createdAt: cleanText(base.createdAt) || cleanText(now) || new Date().toISOString(),
    updatedAt: cleanText(base.updatedAt) || cleanText(now) || new Date().toISOString()
  });
}

function createTrainingRosterRecord(payload, now) {
  const base = normalizeTrainingRosterPayload(payload);
  return normalizeStoredTrainingRoster({
    ...base,
    createdAt: cleanText(base.createdAt) || cleanText(now) || new Date().toISOString(),
    updatedAt: cleanText(base.updatedAt) || cleanText(now) || new Date().toISOString()
  });
}

function buildJsonResponse(status, jsonBody, headers) {
  return {
    status,
    jsonBody,
    headers
  };
}

function buildErrorResponse(error, fallbackMessage, status) {
  const code = Number(error && (error.statusCode || error.status || status)) || 500;
  return {
    status: code,
    jsonBody: {
      ok: false,
      error: cleanText(error && error.message) || fallbackMessage || 'Unexpected error'
    }
  };
}

module.exports = {
  CONTRACT_VERSION,
  FORM_ACTIONS,
  ROSTER_ACTIONS,
  FORM_STATUSES,
  ROSTER_SOURCES,
  buildErrorResponse,
  buildJsonResponse,
  cleanText,
  createError,
  createTrainingFormRecord,
  createTrainingRosterRecord,
  mapGraphFieldsToTrainingForm,
  mapGraphFieldsToTrainingRoster,
  mapTrainingFormForClient,
  mapTrainingFormToGraphFields,
  mapTrainingRosterForClient,
  mapTrainingRosterToGraphFields,
  normalizeTrainingFormPayload,
  normalizeTrainingRosterPayload,
  normalizeStoredTrainingForm,
  normalizeStoredTrainingRoster,
  parseTrainingFormId,
  validateActionEnvelope,
  validateTrainingFormPayload,
  validateTrainingRosterPayload
};
