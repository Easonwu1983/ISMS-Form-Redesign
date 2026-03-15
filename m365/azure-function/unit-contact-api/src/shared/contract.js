const CONTRACT_VERSION = '2026-03-11';

const ACTIONS = {
  APPLY: 'unit-contact.apply',
  LOOKUP: 'unit-contact.lookup'
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
    label: '???',
    detail: '????????????????',
    tone: 'pending'
  },
  [STATUSES.RETURNED]: {
    label: '????',
    detail: '????????????????????',
    tone: 'attention'
  },
  [STATUSES.APPROVED]: {
    label: '????',
    detail: '???????????????????',
    tone: 'approved'
  },
  [STATUSES.REJECTED]: {
    label: '?????',
    detail: '?????????????????',
    tone: 'danger'
  },
  [STATUSES.ACTIVATION_PENDING]: {
    label: '???',
    detail: '????????????????????',
    tone: 'approved'
  },
  [STATUSES.ACTIVE]: {
    label: '???',
    detail: '???????????',
    tone: 'live'
  }
};

const ACTIVE_DUPLICATE_STATUSES = new Set([
  STATUSES.PENDING_REVIEW,
  STATUSES.APPROVED,
  STATUSES.ACTIVATION_PENDING,
  STATUSES.ACTIVE
]);

function cleanText(value) {
  return String(value || '').trim();
}

function cleanEmail(value) {
  return cleanText(value).toLowerCase();
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
    throw createError('請求內容不是合法的 JSON。', 400);
  }
}

function validateActionEnvelope(envelope, expectedAction) {
  if (!envelope || typeof envelope !== 'object') {
    throw createError('缺少 request envelope。', 400);
  }
  const action = cleanText(envelope.action);
  if (!action) throw createError('缺少 action。', 400);
  if (expectedAction && action !== expectedAction) {
    throw createError('action 不符合目前端點需求。', 400);
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
  if (!payload.unitValue) throw createError('請選擇單位。', 400);
  if (!payload.applicantName) throw createError('請輸入姓名。', 400);
  if (!payload.extensionNumber) throw createError('請輸入分機。', 400);
  if (!payload.applicantEmail) throw createError('請輸入信箱。', 400);
  if (!payload.unitCode) throw createError('系統無法辨識單位代碼，請重新選擇單位。', 400);
}

function normalizeLookupEmail(email) {
  const value = cleanEmail(email);
  if (!value) throw createError('請輸入申請信箱。', 400);
  return value;
}

function buildApplicationId(sequence, date) {
  const sourceDate = date instanceof Date ? date : new Date();
  const year = sourceDate.getFullYear();
  return 'UCA-' + year + '-' + String(sequence).padStart(4, '0');
}

function decorateStatus(application) {
  const meta = STATUS_META[application.status] || STATUS_META[STATUSES.PENDING_REVIEW];
  return {
    ...application,
    statusLabel: application.statusLabel || meta.label,
    statusDetail: application.statusDetail || meta.detail,
    statusTone: application.statusTone || meta.tone
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
  return decorateStatus({
    id: cleanText(application.id),
    applicantName: cleanText(application.applicantName),
    applicantEmail: cleanEmail(application.applicantEmail),
    extensionNumber: cleanText(application.extensionNumber),
    unitCategory: cleanText(application.unitCategory),
    primaryUnit: cleanText(application.primaryUnit),
    secondaryUnit: cleanText(application.secondaryUnit),
    unitValue: cleanText(application.unitValue),
    unitCode: cleanText(application.unitCode),
    contactType: cleanText(application.contactType) || 'primary',
    note: cleanText(application.note),
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
    externalUserId: cleanText(application.externalUserId)
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
    Note: normalized.note,
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
    submittedAt: fields.SubmittedAt,
    updatedAt: fields.UpdatedAt,
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
  const message = cleanText(error && error.message) || fallbackMessage || '系統發生錯誤。';
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
  normalizeApplyPayload,
  normalizeLookupEmail,
  normalizeStoredApplication,
  parseJsonBody,
  validateActionEnvelope,
  validateApplyPayload
};
