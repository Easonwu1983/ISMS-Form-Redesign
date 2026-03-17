const CONTRACT_VERSION = '2026-03-11';

const ACTIONS = {
  APPLY: 'unit-contact.apply',
  LOOKUP: 'unit-contact.lookup',
  LIST: 'unit-contact.list',
  REVIEW: 'unit-contact.review',
  ACTIVATE: 'unit-contact.activate'
};

const STATUSES = {
  PENDING_REVIEW: 'pending_review',
  RETURNED: 'returned',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ACTIVATION_PENDING: 'activation_pending',
  ACTIVE: 'active'
};

const STATUS_META = {
  [STATUSES.PENDING_REVIEW]: {
    label: '\u5f85\u5be9\u6838',
    detail: '\u7533\u8acb\u5df2\u9001\u51fa\uff0c\u8acb\u7b49\u5f85\u7ba1\u7406\u8005\u5be9\u6838\u3002\u5be9\u6838\u901a\u904e\u5f8c\u6703\u76f4\u63a5\u555f\u7528\u5e33\u865f\u4e26\u5bc4\u9001\u767b\u5165\u8cc7\u8a0a\u3002',
    tone: 'pending'
  },
  [STATUSES.RETURNED]: {
    label: '\u9000\u56de\u88dc\u4ef6',
    detail: '\u7533\u8acb\u8cc7\u6599\u9700\u8981\u88dc\u5145\uff0c\u8acb\u4f9d\u9000\u56de\u610f\u898b\u4fee\u6b63\u5f8c\u91cd\u65b0\u9001\u51fa\u3002',
    tone: 'attention'
  },
  [STATUSES.APPROVED]: {
    label: '\u5be9\u6838\u901a\u904e',
    detail: '\u7533\u8acb\u5df2\u901a\u904e\u5be9\u6838\uff0c\u7cfb\u7d71\u6b63\u5728\u81ea\u52d5\u5efa\u5e33\u4e26\u5bc4\u9001\u767b\u5165\u8cc7\u8a0a\u3002',
    tone: 'approved'
  },
  [STATUSES.REJECTED]: {
    label: '\u672a\u6838\u51c6',
    detail: '\u7533\u8acb\u672a\u901a\u904e\u5be9\u6838\uff0c\u8acb\u806f\u7e6b\u7cfb\u7d71\u7ba1\u7406\u8005\u78ba\u8a8d\u539f\u56e0\u3002',
    tone: 'danger'
  },
  [STATUSES.ACTIVATION_PENDING]: {
    label: '\u5f85\u5efa\u5e33',
    detail: '\u7cfb\u7d71\u5df2\u958b\u59cb\u5efa\u7acb\u5e33\u865f\uff0c\u767b\u5165\u5e33\u865f\u6703\u4f7f\u7528\u7533\u8acb\u6642\u7684\u96fb\u5b50\u90f5\u4ef6\u3002',
    tone: 'approved'
  },
  [STATUSES.ACTIVE]: {
    label: '\u5df2\u555f\u7528',
    detail: '\u5e33\u865f\u5df2\u555f\u7528\uff0c\u8acb\u4f7f\u7528\u7533\u8acb\u6642\u7684\u96fb\u5b50\u90f5\u4ef6\u8207\u521d\u59cb\u5bc6\u78bc\u767b\u5165\u7cfb\u7d71\u3002',
    tone: 'live'
  }
};

const ACTIVE_DUPLICATE_STATUSES = new Set([
  STATUSES.PENDING_REVIEW,
  STATUSES.APPROVED,
  STATUSES.ACTIVATION_PENDING,
  STATUSES.ACTIVE
]);
const NOTE_META_MARKER = '\n[ISMS_META]';

function cleanText(value) {
  return String(value || '').trim();
}

function cleanEmail(value) {
  return cleanText(value).toLowerCase();
}

function isValidNtuEmail(value) {
  return /^[^@\s]+@ntu\.edu\.tw$/i.test(cleanEmail(value));
}

function isStrongPassword(value) {
  const text = cleanText(value);
  return text.length >= 8
    && /[A-Z]/.test(text)
    && /[a-z]/.test(text)
    && /\d/.test(text);
}

function isPlaceholderText(value) {
  const text = cleanText(value);
  return !!text && /^[?\uFFFD\s]+$/.test(text);
}

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode || 400;
  return error;
}

async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch (_) {
    throw createError('\u8acb\u6c42\u5167\u5bb9\u4e0d\u662f\u6709\u6548\u7684 JSON\u3002', 400);
  }
}

function validateActionEnvelope(envelope, expectedAction) {
  if (!envelope || typeof envelope !== 'object') {
    throw createError('\u7f3a\u5c11 request envelope\u3002', 400);
  }
  const action = cleanText(envelope.action);
  if (!action) throw createError('\u7f3a\u5c11 action\u3002', 400);
  if (expectedAction && action !== expectedAction) {
    throw createError('action \u8207\u9810\u671f\u4e0d\u4e00\u81f4\u3002', 400);
  }
}

function normalizeApplyPayload(payload) {
  return {
    applicantName: cleanText(payload && payload.applicantName),
    applicantEmail: cleanEmail(payload && payload.applicantEmail),
    extensionNumber: cleanText(payload && payload.extensionNumber),
    unitCategory: cleanText(payload && payload.unitCategory),
    primaryUnit: cleanText(payload && payload.primaryUnit),
    secondaryUnit: cleanText(payload && payload.secondaryUnit),
    unitValue: cleanText(payload && payload.unitValue),
    unitCode: cleanText(payload && payload.unitCode),
    contactType: cleanText(payload && payload.contactType) || 'primary',
    note: cleanText(payload && payload.note)
  };
}

function validateApplyPayload(payload) {
  if (!payload.unitValue) throw createError('\u7f3a\u5c11\u7533\u8acb\u55ae\u4f4d\u3002', 400);
  if (!payload.applicantName) throw createError('\u7f3a\u5c11\u7533\u8acb\u4eba\u59d3\u540d\u3002', 400);
  if (!payload.extensionNumber) throw createError('\u7f3a\u5c11\u5206\u6a5f\u3002', 400);
  if (!payload.applicantEmail) throw createError('\u7f3a\u5c11\u7533\u8acb\u4fe1\u7bb1\u3002', 400);
  if (!isValidNtuEmail(payload.applicantEmail)) throw createError('\u7533\u8acb\u4fe1\u7bb1\u5fc5\u9808\u70ba @ntu.edu.tw\u3002', 400);
  if (!payload.unitCode) throw createError('\u7f3a\u5c11\u55ae\u4f4d\u4ee3\u78bc\uff0c\u8acb\u91cd\u65b0\u9078\u64c7\u7533\u8acb\u55ae\u4f4d\u3002', 400);
}

function normalizeLookupEmail(email) {
  const value = cleanEmail(email);
  if (!value) throw createError('\u8acb\u8f38\u5165\u7533\u8acb\u4fe1\u7bb1\u3002', 400);
  return value;
}

function normalizeReviewPayload(payload) {
  return {
    id: cleanText(payload && payload.id),
    status: cleanText(payload && payload.status),
    reviewComment: cleanText(payload && payload.reviewComment),
    reviewedBy: cleanText(payload && payload.reviewedBy),
    externalUserId: cleanText(payload && payload.externalUserId)
  };
}

function validateReviewPayload(payload) {
  if (!cleanText(payload && payload.id)) throw createError('\u7f3a\u5c11\u7533\u8acb\u7de8\u865f\u3002', 400);
  const status = cleanText(payload && payload.status);
  if (![
    STATUSES.APPROVED,
    STATUSES.RETURNED,
    STATUSES.REJECTED
  ].includes(status)) {
    throw createError('\u4e0d\u652f\u63f4\u7684\u5be9\u6838\u72c0\u614b\u3002', 400);
  }
}

function normalizeActivationPayload(payload) {
  return {
    id: cleanText(payload && payload.id),
    externalUserId: cleanText(payload && payload.externalUserId),
    initialPassword: cleanText(payload && payload.initialPassword),
    reviewComment: cleanText(payload && payload.reviewComment),
    reviewedBy: cleanText(payload && payload.reviewedBy)
  };
}

function validateActivationPayload(payload) {
  if (!cleanText(payload && payload.id)) throw createError('\u7f3a\u5c11\u7533\u8acb\u7de8\u865f\u3002', 400);
}

function buildApplicationId(sequence, date) {
  const sourceDate = date instanceof Date ? date : new Date();
  const year = sourceDate.getFullYear();
  return 'UCA-' + year + '-' + String(sequence).padStart(4, '0');
}

function splitNoteMeta(note) {
  const raw = String(note || '');
  const markerIndex = raw.lastIndexOf(NOTE_META_MARKER);
  if (markerIndex < 0) return { note: cleanText(raw), meta: {} };
  const visible = cleanText(raw.slice(0, markerIndex));
  const metaRaw = cleanText(raw.slice(markerIndex + NOTE_META_MARKER.length));
  if (!metaRaw) return { note: visible, meta: {} };
  try {
    const parsed = JSON.parse(metaRaw);
    return { note: visible, meta: parsed && typeof parsed === 'object' ? parsed : {} };
  } catch (_) {
    return { note: cleanText(raw), meta: {} };
  }
}

function composeNoteWithMeta(note, meta) {
  const visible = cleanText(note);
  const input = meta && typeof meta === 'object' ? meta : {};
  const filtered = Object.entries(input).reduce((result, [key, value]) => {
    const text = cleanText(value);
    if (text) result[key] = text;
    return result;
  }, {});
  if (!Object.keys(filtered).length) return visible;
  return [visible, NOTE_META_MARKER + JSON.stringify(filtered)].filter(Boolean).join('\n');
}

function resolveStatusCopy(value, fallback) {
  const text = cleanText(value);
  return text && !isPlaceholderText(text) ? text : fallback;
}

function resolveMeaningfulText(value, fallback) {
  const text = cleanText(value);
  if (text && !isPlaceholderText(text)) return text;
  return cleanText(fallback);
}

function deriveApplicantNameFallback(email) {
  const normalizedEmail = cleanEmail(email);
  if (!normalizedEmail) return '未提供姓名';
  const localPart = normalizedEmail.split('@')[0] || '';
  return cleanText(localPart) || '未提供姓名';
}

function decorateStatus(application) {
  const meta = STATUS_META[application.status] || STATUS_META[STATUSES.PENDING_REVIEW];
  return {
    ...application,
    statusLabel: resolveStatusCopy(application.statusLabel, meta.label),
    statusDetail: resolveStatusCopy(application.statusDetail, meta.detail),
    statusTone: cleanText(application.statusTone) || meta.tone
  };
}

function createApplicationRecord(payload, sequence, now) {
  const createdAt = now instanceof Date ? now : new Date();
  return decorateStatus({
    id: buildApplicationId(sequence, createdAt),
    applicantName: payload.applicantName,
    applicantEmail: payload.applicantEmail,
    extensionNumber: payload.extensionNumber,
    unitCategory: payload.unitCategory,
    primaryUnit: payload.primaryUnit,
    secondaryUnit: payload.secondaryUnit,
    unitValue: payload.unitValue,
    unitCode: payload.unitCode,
    contactType: payload.contactType || 'primary',
    note: payload.note || '',
    status: STATUSES.PENDING_REVIEW,
    source: 'm365-api',
    backendMode: 'm365-api',
    submittedAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
    reviewedAt: null,
    reviewedBy: '',
    reviewComment: '',
    activationSentAt: null,
    activatedAt: null,
    externalUserId: ''
  });
}

function normalizeStoredApplication(application) {
  const applicantEmail = cleanEmail(application.applicantEmail);
  const noteMeta = splitNoteMeta(application.note);
  const primaryUnit = resolveMeaningfulText(application.primaryUnit);
  const secondaryUnit = resolveMeaningfulText(application.secondaryUnit);
  const composedUnitValue = primaryUnit && secondaryUnit
    ? `${primaryUnit}／${secondaryUnit}`
    : (primaryUnit || secondaryUnit || '');
  return decorateStatus({
    id: cleanText(application.id),
    applicantName: resolveMeaningfulText(application.applicantName, deriveApplicantNameFallback(applicantEmail)),
    applicantEmail,
    extensionNumber: cleanText(application.extensionNumber),
    unitCategory: resolveMeaningfulText(application.unitCategory),
    primaryUnit,
    secondaryUnit,
    unitValue: resolveMeaningfulText(application.unitValue, composedUnitValue),
    unitCode: cleanText(application.unitCode),
    contactType: cleanText(application.contactType) || 'primary',
    note: noteMeta.note,
    status: cleanText(application.status) || STATUSES.PENDING_REVIEW,
    statusLabel: cleanText(application.statusLabel),
    statusDetail: cleanText(application.statusDetail),
    statusTone: cleanText(application.statusTone),
    source: cleanText(application.source) || 'm365-api',
    backendMode: cleanText(application.backendMode) || 'm365-api',
    submittedAt: cleanText(application.submittedAt) || new Date().toISOString(),
    updatedAt: cleanText(application.updatedAt) || new Date().toISOString(),
    reviewedAt: cleanText(application.reviewedAt),
    reviewedBy: cleanText(application.reviewedBy),
    reviewComment: cleanText(application.reviewComment),
    activationSentAt: cleanText(application.activationSentAt),
    activatedAt: cleanText(application.activatedAt),
    externalUserId: cleanText(application.externalUserId || noteMeta.meta.externalUserId || noteMeta.meta.requestedUsername)
  });
}

function mapApplicationForClient(application) {
  const normalized = normalizeStoredApplication(application);
  return {
    id: normalized.id,
    applicantName: normalized.applicantName,
    applicantEmail: normalized.applicantEmail,
    extensionNumber: normalized.extensionNumber,
    unitCategory: normalized.unitCategory,
    primaryUnit: normalized.primaryUnit,
    secondaryUnit: normalized.secondaryUnit,
    unitValue: normalized.unitValue,
    unitCode: normalized.unitCode,
    contactType: normalized.contactType,
    note: normalized.note,
    status: normalized.status,
    statusLabel: normalized.statusLabel,
    statusDetail: normalized.statusDetail,
    statusTone: normalized.statusTone,
    source: normalized.source,
    backendMode: normalized.backendMode,
    submittedAt: normalized.submittedAt,
    updatedAt: normalized.updatedAt,
    reviewedAt: normalized.reviewedAt || null,
    reviewedBy: normalized.reviewedBy || '',
    reviewComment: normalized.reviewComment || '',
    activationSentAt: normalized.activationSentAt || null,
    activatedAt: normalized.activatedAt || null,
    externalUserId: normalized.externalUserId || ''
  };
}

function mapApplicationToGraphFields(application) {
  const normalized = normalizeStoredApplication(application);
  return {
    Title: normalized.id,
    ApplicationId: normalized.id,
    ApplicantName: normalized.applicantName,
    ApplicantEmail: normalized.applicantEmail,
    ExtensionNumber: normalized.extensionNumber,
    UnitCategory: normalized.unitCategory,
    PrimaryUnitName: normalized.primaryUnit,
    SecondaryUnitName: normalized.secondaryUnit,
    UnitValue: normalized.unitValue,
    UnitCode: normalized.unitCode,
    ContactType: normalized.contactType,
    Note: composeNoteWithMeta(normalized.note, {
      externalUserId: normalized.externalUserId
    }),
    Status: normalized.status,
    StatusLabel: normalized.statusLabel,
    StatusDetail: normalized.statusDetail,
    Source: normalized.source,
    BackendMode: normalized.backendMode,
    SubmittedAt: normalized.submittedAt,
    UpdatedAt: normalized.updatedAt,
    ReviewedAt: normalized.reviewedAt || null,
    ReviewedBy: normalized.reviewedBy || '',
    ReviewComment: normalized.reviewComment || '',
    ActivationSentAt: normalized.activationSentAt || null,
    ActivatedAt: normalized.activatedAt || null,
    ExternalUserId: normalized.externalUserId || ''
  };
}

function mapGraphFieldsToApplication(fields) {
  return normalizeStoredApplication({
    id: fields.ApplicationId || fields.Title,
    applicantName: fields.ApplicantName,
    applicantEmail: fields.ApplicantEmail,
    extensionNumber: fields.ExtensionNumber,
    unitCategory: fields.UnitCategory,
    primaryUnit: fields.PrimaryUnitName,
    secondaryUnit: fields.SecondaryUnitName,
    unitValue: fields.UnitValue,
    unitCode: fields.UnitCode,
    contactType: fields.ContactType,
    note: fields.Note,
    status: fields.Status,
    statusLabel: fields.StatusLabel,
    statusDetail: fields.StatusDetail || fields.ReviewComment,
    source: fields.Source,
    backendMode: fields.BackendMode,
    submittedAt: fields.SubmittedAt || fields.Created || fields.createdDateTime,
    updatedAt: fields.UpdatedAt || fields.Modified || fields.lastModifiedDateTime,
    reviewedAt: fields.ReviewedAt,
    reviewedBy: fields.ReviewedBy,
    reviewComment: fields.ReviewComment,
    activationSentAt: fields.ActivationSentAt,
    activatedAt: fields.ActivatedAt,
    externalUserId: fields.ExternalUserId
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
  const message = cleanText(error && error.message) || fallbackMessage || '\u8655\u7406\u55ae\u4f4d\u806f\u7d61\u4eba\u7533\u8acb\u6642\u767c\u751f\u932f\u8aa4\u3002';
  const status = Number((error && error.statusCode) || fallbackStatus || 400);
  return buildJsonResponse(status, {
    ok: false,
    message
  });
}

module.exports = {
  ACTIONS,
  ACTIVE_DUPLICATE_STATUSES,
  CONTRACT_VERSION,
  STATUSES,
  buildApplicationId,
  buildErrorResponse,
  buildJsonResponse,
  cleanEmail,
  createApplicationRecord,
  createError,
  mapApplicationForClient,
  mapApplicationToGraphFields,
  mapGraphFieldsToApplication,
  isStrongPassword,
  isValidNtuEmail,
  normalizeApplyPayload,
  normalizeLookupEmail,
  normalizeReviewPayload,
  validateReviewPayload,
  normalizeActivationPayload,
  validateActivationPayload,
  normalizeStoredApplication,
  parseJsonBody,
  validateActionEnvelope,
  validateApplyPayload
};
