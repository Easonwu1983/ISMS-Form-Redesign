const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { URL } = require('url');

const {
  ACTIONS,
  ACTIVE_DUPLICATE_STATUSES,
  CONTRACT_VERSION,
  buildErrorResponse,
  buildJsonResponse,
  createApplicationRecord,
  mapApplicationForClient,
  mapApplicationForPublicClient,
  mapApplicationForPublicStatus,
  normalizeApplyPayload,
  normalizeActivationPayload,
  normalizeLookupEmail,
  normalizeReviewPayload,
  STATUSES,
  validateActionEnvelope,
  validateActivationPayload,
  validateApplyPayload,
  validateReviewPayload
} = require('../azure-function/unit-contact-api/src/shared/contract');
const { createChecklistRouter } = require('./checklist-backend.cjs');
const { createCorrectiveActionRouter } = require('./corrective-action-backend.cjs');
const { createAuditTrailRouter } = require('./audit-trail-backend.cjs');
const { createUnitGovernanceRouter } = require('./unit-governance-backend.cjs');
const { createReviewScopeRouter } = require('./review-scope-backend.cjs');
const { createAttachmentRouter } = require('./attachment-backend.cjs');
const { createSystemUserRouter } = require('./system-user-backend.cjs');
const { createTrainingRouter } = require('./training-backend.cjs');
const { createRequestAuthz } = require('./request-authz.cjs');
const {
  buildFieldChanges
} = require('./audit-diff.cjs');
const {
  sendGraphMail,
  buildHtmlDocument
} = require('./graph-mailer.cjs');
const {
  createPasswordSecret,
  serializePasswordSecret
} = require('./auth-security.cjs');
const {
  createSystemUserRecord,
  generatePassword,
  readStoredPasswordState,
  USER_ROLES,
  validateSystemUserPayload
} = require('../azure-function/system-user-api/src/shared/contract');
const db = require('./db.cjs');

const DEFAULT_PORT = Number(process.env.PORT || process.env.UNIT_CONTACT_BACKEND_PORT || 8787);
const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:8080',
  'http://localhost:8080'
];

const APPLY_RATE_LIMIT_WINDOW_MS = Number(process.env.UNIT_CONTACT_APPLY_WINDOW_MS || 15 * 60 * 1000);
const APPLY_RATE_LIMIT_MAX_REQUESTS = Number(process.env.UNIT_CONTACT_APPLY_MAX_REQUESTS || 5);
const MAX_JSON_BODY_BYTES = Number(process.env.UNIT_CONTACT_MAX_JSON_BODY_BYTES || 1024 * 1024);
const MAX_UPLOAD_BODY_BYTES = Number(process.env.MAX_UPLOAD_BODY_BYTES || 14 * 1024 * 1024); // ~10MB file after base64 overhead
const applyThrottle = new Map();

function cleanText(value) {
  return String(value || '').trim();
}

function getEnv(name, fallback) {
  const value = cleanText(process.env[name]);
  return value || fallback || '';
}

function getAllowedOrigins() {
  const raw = cleanText(process.env.UNIT_CONTACT_ALLOWED_ORIGINS);
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  return raw.split(',').map((entry) => cleanText(entry)).filter(Boolean);
}

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode || 400;
  return error;
}

function parseJsonBody(req, maxBytes) {
  const limit = Number(maxBytes) > 0 ? Number(maxBytes) : MAX_JSON_BODY_BYTES;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    req.on('data', (chunk) => {
      totalBytes += Buffer.byteLength(chunk);
      if (totalBytes > limit) {
        req.destroy(createHttpError('Request body too large', 413));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        reject(createHttpError('Invalid JSON body', 400));
      }
    });
    req.on('error', (error) => {
      reject(Number(error && error.statusCode) ? error : createHttpError(String(error && error.message || 'Request body read failed'), 400));
    });
  });
}

function parseUploadBody(req) {
  return parseJsonBody(req, MAX_UPLOAD_BODY_BYTES);
}

function buildCorsHeaders(origin) {
  const allowedOrigins = getAllowedOrigins();
  const headers = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-ISMS-Contract-Version, X-ISMS-Active-Unit',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function buildSecurityHeaders(pathname) {
  const p = cleanText(pathname) || '/';
  const headers = {
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), usb=(), payment=(), browsing-topics=()',
    'cache-control': p.startsWith('/api/') ? 'no-store, no-cache, must-revalidate' : 'no-store',
    'pragma': 'no-cache',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  };
  return headers;
}

const GZIP_MIN_BYTES = 1024;

function acceptsGzip(req) {
  const ae = String((req && req.headers && req.headers['accept-encoding']) || '');
  return /\bgzip\b/i.test(ae);
}

async function writeJson(res, response, origin) {
  const payload = typeof response.jsonPayload === 'string'
    ? response.jsonPayload
    : JSON.stringify(response.jsonBody || {});
  const baseHeaders = {
    ...(response.headers || {}),
    ...buildCorsHeaders(origin),
    ...buildSecurityHeaders(response.path || '/api'),
    'Content-Type': 'application/json; charset=utf-8'
  };

  const req = res && res.__ismsReq;
  const payloadBytes = Buffer.byteLength(payload);
  if (req && acceptsGzip(req) && payloadBytes >= GZIP_MIN_BYTES) {
    const compressed = await new Promise((resolve, reject) => {
      zlib.gzip(payload, (err, result) => err ? reject(err) : resolve(result));
    });
    baseHeaders['Content-Encoding'] = 'gzip';
    baseHeaders['Content-Length'] = compressed.length;
    baseHeaders['Vary'] = 'Accept-Encoding';
    res.writeHead(response.status || 200, baseHeaders);
    res.end(compressed);
  } else {
    baseHeaders['Content-Length'] = payloadBytes;
    res.writeHead(response.status || 200, baseHeaders);
    res.end(payload);
  }
}

async function writeBinary(res, response, origin) {
  const body = Buffer.isBuffer(response.body)
    ? response.body
    : Buffer.from(response.body || '');
  const headers = {
    ...(response.headers || {}),
    ...buildCorsHeaders(origin),
    ...buildSecurityHeaders(response.path || '/api'),
    'Content-Length': Buffer.byteLength(body)
  };
  res.writeHead(response.status || 200, headers);
  res.end(body);
}

/* ------------------------------------------------------------------ */
/*  Application CRUD (PostgreSQL)                                      */
/* ------------------------------------------------------------------ */

function parseJsonField(value, fallback) {
  if (value === null || value === undefined) return fallback !== undefined ? fallback : null;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (_) { return fallback !== undefined ? fallback : null; }
  }
  return value;
}

function mapRowToApplication(row) {
  if (!row) return null;
  const authorizedUnits = parseJsonField(row.authorized_units_json, []);
  const securityRoles = parseJsonField(row.security_roles_json, []);
  return {
    id: row.application_id || '',
    applicantName: row.applicant_name || '',
    applicantEmail: row.applicant_email || '',
    extensionNumber: row.extension_number || '',
    unitCategory: row.unit_category || '',
    primaryUnit: row.primary_unit || '',
    secondaryUnit: row.secondary_unit || '',
    unitValue: row.unit_value || '',
    unitCode: row.unit_code || '',
    contactType: row.contact_type || '',
    note: row.note || '',
    authorizedUnits,
    securityRoles,
    authorizationDocAttachmentId: row.authorization_doc_attachment_id || '',
    authorizationDocDriveItemId: row.authorization_doc_drive_item_id || '',
    authorizationDocFileName: row.authorization_doc_file_name || '',
    authorizationDocContentType: row.authorization_doc_content_type || '',
    authorizationDocSize: Number(row.authorization_doc_size || 0),
    authorizationDocUploadedAt: row.authorization_doc_uploaded_at ? new Date(row.authorization_doc_uploaded_at).toISOString() : '',
    status: row.status || '',
    statusLabel: row.status_label || '',
    statusDetail: row.status_detail || '',
    source: row.source || '',
    backendMode: row.backend_mode || 'pg-campus-backend',
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : '',
    reviewedBy: row.reviewed_by || '',
    reviewComment: row.review_comment || '',
    activationSentAt: row.activation_sent_at ? new Date(row.activation_sent_at).toISOString() : '',
    activatedAt: row.activated_at ? new Date(row.activated_at).toISOString() : '',
    externalUserId: row.external_user_id || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : ''
  };
}

const APPLICATION_SELECT = `
  SELECT id, application_id, applicant_name, applicant_email, extension_number,
         unit_category, primary_unit, secondary_unit, unit_value, unit_code,
         contact_type, note, authorized_units_json, security_roles_json,
         authorization_doc_attachment_id, authorization_doc_drive_item_id,
         authorization_doc_file_name, authorization_doc_content_type,
         authorization_doc_size, authorization_doc_uploaded_at,
         status, status_label, status_detail, source, backend_mode,
         submitted_at, updated_at, reviewed_at, reviewed_by, review_comment,
         activation_sent_at, activated_at, external_user_id, created_at
  FROM unit_contact_applications
`;

async function listAllApplications() {
  const rows = await db.queryAll(`${APPLICATION_SELECT} ORDER BY submitted_at DESC, id DESC`);
  return rows.map((row) => ({
    listItemId: String(row.id),
    application: mapRowToApplication(row)
  }));
}

async function listApplicationsByEmail(email) {
  const target = cleanText(email).toLowerCase();
  if (!target) return [];
  const rows = await db.queryAll(
    `${APPLICATION_SELECT} WHERE LOWER(applicant_email) = $1 ORDER BY submitted_at DESC`,
    [target]
  );
  return rows.map(mapRowToApplication);
}

async function findApplicationEntryById(id) {
  const cleanId = cleanText(id);
  if (!cleanId) return null;
  const row = await db.queryOne(`${APPLICATION_SELECT} WHERE application_id = $1`, [cleanId]);
  if (!row) return null;
  return { listItemId: String(row.id), application: mapRowToApplication(row) };
}

async function ensureNoDuplicateActiveApplication(payload) {
  const existing = await listApplicationsByEmail(payload.applicantEmail);
  const duplicated = existing.find((entry) => entry.unitValue === payload.unitValue && ACTIVE_DUPLICATE_STATUSES.has(entry.status));
  if (!duplicated) return;
  const error = new Error('An active application already exists for this unit and email.');
  error.statusCode = 409;
  error.duplicatedApplication = duplicated;
  throw error;
}

function parseSequenceFromId(id, year) {
  const prefix = `UCA-${year}-`;
  if (!String(id || '').startsWith(prefix)) return 0;
  const raw = String(id).slice(prefix.length);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getNextSequence(year) {
  const result = await db.queryOne(`SELECT nextval('seq_application_id') AS val`);
  return Number(result.val);
}

async function createApplication(payload) {
  const nextSequence = await getNextSequence(new Date().getFullYear());
  const application = createApplicationRecord(payload, nextSequence);
  application.source = 'pg-campus-backend';
  application.backendMode = 'pg-campus-backend';
  const now = new Date().toISOString();

  await db.query(`
    INSERT INTO unit_contact_applications (
      application_id, applicant_name, applicant_email, extension_number,
      unit_category, primary_unit, secondary_unit, unit_value, unit_code,
      contact_type, note, authorized_units_json, security_roles_json,
      authorization_doc_attachment_id, authorization_doc_drive_item_id,
      authorization_doc_file_name, authorization_doc_content_type,
      authorization_doc_size, authorization_doc_uploaded_at,
      status, status_label, status_detail, source, backend_mode,
      submitted_at, updated_at, reviewed_at, reviewed_by, review_comment,
      activation_sent_at, activated_at, external_user_id, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)
  `, [
    cleanText(application.id),
    cleanText(application.applicantName),
    cleanText(application.applicantEmail),
    cleanText(application.extensionNumber),
    cleanText(application.unitCategory),
    cleanText(application.primaryUnit),
    cleanText(application.secondaryUnit),
    cleanText(application.unitValue),
    cleanText(application.unitCode),
    cleanText(application.contactType),
    cleanText(application.note),
    JSON.stringify(Array.isArray(application.authorizedUnits) ? application.authorizedUnits : []),
    JSON.stringify(Array.isArray(application.securityRoles) ? application.securityRoles : []),
    cleanText(application.authorizationDocAttachmentId),
    cleanText(application.authorizationDocDriveItemId),
    cleanText(application.authorizationDocFileName),
    cleanText(application.authorizationDocContentType),
    Number(application.authorizationDocSize || 0),
    cleanText(application.authorizationDocUploadedAt) || null,
    cleanText(application.status),
    cleanText(application.statusLabel),
    cleanText(application.statusDetail),
    application.source,
    application.backendMode,
    cleanText(application.submittedAt) || now,
    now,
    cleanText(application.reviewedAt) || null,
    cleanText(application.reviewedBy),
    cleanText(application.reviewComment),
    cleanText(application.activationSentAt) || null,
    cleanText(application.activatedAt) || null,
    cleanText(application.externalUserId),
    now
  ]);

  await tryCreateAuditRow({
    eventType: 'unit_contact.application_submitted',
    actorEmail: application.applicantEmail,
    targetEmail: application.applicantEmail,
    unitCode: application.unitCode,
    recordId: application.id,
    payloadJson: JSON.stringify({
      source: application.source,
      backendMode: application.backendMode,
      snapshot: buildApplicationSnapshot(application),
      changes: buildApplicationChanges(null, application)
    })
  });

  return application;
}

async function updateApplicationRecord(applicationId, updates) {
  const entry = await findApplicationEntryById(applicationId);
  if (!entry) {
    const error = new Error('Application not found');
    error.statusCode = 404;
    throw error;
  }
  const STATUS_LABELS = {
    pending_review: '待審核', returned: '退回補件', approved: '審核通過',
    rejected: '未核准', activation_pending: '待建帳', active: '已啟用'
  };
  const STATUS_DETAILS = {
    pending_review: '申請已送出，請等待管理者審核。審核通過後會直接啟用帳號並寄送登入資訊。',
    returned: '申請資料需要補充，請依退回意見修正後重新送出。',
    approved: '申請已通過審核，系統正在自動建帳並寄送登入資訊。',
    rejected: '申請未通過審核，請聯繫系統管理者確認原因。',
    activation_pending: '系統已開始建立帳號，登入帳號會使用申請時的電子郵件。',
    active: '帳號已啟用，請使用申請時的電子郵件與初始密碼登入系統。'
  };
  const nextStatus = cleanText(updates.status) || cleanText(entry.application.status);
  const nextRecord = {
    ...entry.application,
    ...updates,
    statusLabel: STATUS_LABELS[nextStatus] || cleanText(updates.statusLabel) || entry.application.statusLabel,
    statusDetail: STATUS_DETAILS[nextStatus] || cleanText(updates.statusDetail) || entry.application.statusDetail,
    updatedAt: new Date().toISOString()
  };

  await db.query(`
    UPDATE unit_contact_applications SET
      status=$1, status_label=$2, status_detail=$3,
      review_comment=$4, reviewed_by=$5, reviewed_at=$6,
      activation_sent_at=$7, activated_at=$8,
      external_user_id=$9, updated_at=$10
    WHERE id = $11
  `, [
    cleanText(nextRecord.status),
    cleanText(nextRecord.statusLabel),
    cleanText(nextRecord.statusDetail),
    cleanText(nextRecord.reviewComment),
    cleanText(nextRecord.reviewedBy),
    cleanText(nextRecord.reviewedAt) || null,
    cleanText(nextRecord.activationSentAt) || null,
    cleanText(nextRecord.activatedAt) || null,
    cleanText(nextRecord.externalUserId),
    nextRecord.updatedAt,
    Number(entry.listItemId)
  ]);

  return { before: entry.application, after: nextRecord };
}

/* ------------------------------------------------------------------ */
/*  Application filtering / pagination                                 */
/* ------------------------------------------------------------------ */

function readAdminApplicationFilters(filters) {
  const source = filters && typeof filters === 'object' ? filters : {};
  const limit = Math.max(1, Math.min(200, Number(source.limit) || 50));
  const offset = Math.max(0, Number(source.offset) || 0);
  return {
    status: cleanText(source.status),
    email: cleanText(source.email),
    keyword: cleanText(source.keyword),
    limit, offset
  };
}

function buildAdminApplicationPage(filters, total) {
  const nextFilters = readAdminApplicationFilters(filters);
  const safeTotal = Math.max(0, Number(total) || 0);
  const limit = nextFilters.limit;
  const pageCount = safeTotal > 0 ? Math.max(1, Math.ceil(safeTotal / limit)) : 0;
  const safeOffset = safeTotal > 0
    ? Math.min(Math.max(0, nextFilters.offset), Math.max(0, (pageCount - 1) * limit))
    : 0;
  const currentPage = safeTotal > 0 ? Math.floor(safeOffset / limit) + 1 : 0;
  const hasPrev = safeOffset > 0;
  const hasNext = safeTotal > 0 && (safeOffset + limit) < safeTotal;
  return {
    offset: safeOffset, limit, total: safeTotal, pageCount, currentPage,
    hasPrev, hasNext,
    prevOffset: hasPrev ? Math.max(0, safeOffset - limit) : 0,
    nextOffset: hasNext ? safeOffset + limit : safeOffset,
    pageStart: safeTotal > 0 ? safeOffset + 1 : 0,
    pageEnd: safeTotal > 0 ? Math.min(safeOffset + limit, safeTotal) : 0
  };
}

function summarizeAdminApplications(items) {
  const rows = Array.isArray(items) ? items : [];
  const summary = { total: rows.length, pendingReview: 0, approved: 0, activationPending: 0, active: 0, returned: 0, rejected: 0 };
  rows.forEach((item) => {
    const status = cleanText(item && item.status);
    if (status === STATUSES.PENDING_REVIEW) summary.pendingReview += 1;
    if (status === STATUSES.APPROVED) summary.approved += 1;
    if (status === STATUSES.ACTIVATION_PENDING) summary.activationPending += 1;
    if (status === STATUSES.ACTIVE) summary.active += 1;
    if (status === STATUSES.RETURNED) summary.returned += 1;
    if (status === STATUSES.REJECTED) summary.rejected += 1;
  });
  return summary;
}

async function listApplicationsForAdmin(filters) {
  const nextFilters = readAdminApplicationFilters(filters);
  const conditions = [];
  const params = [];
  let idx = 0;

  if (nextFilters.status) { idx++; conditions.push(`status = $${idx}`); params.push(nextFilters.status); }
  if (nextFilters.email) { idx++; conditions.push(`LOWER(applicant_email) = $${idx}`); params.push(nextFilters.email.toLowerCase()); }
  if (nextFilters.keyword) {
    idx++;
    conditions.push(`(
      LOWER(application_id) LIKE $${idx} OR LOWER(applicant_name) LIKE $${idx}
      OR LOWER(applicant_email) LIKE $${idx} OR LOWER(unit_value) LIKE $${idx}
      OR LOWER(review_comment) LIKE $${idx}
    )`);
    params.push(`%${nextFilters.keyword.toLowerCase()}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Single query for count + summary using FILTER aggregates (eliminates extra round-trip)
  const summaryResult = await db.queryOne(
    `SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = '${STATUSES.PENDING_REVIEW}')::int AS "pendingReview",
      COUNT(*) FILTER (WHERE status = '${STATUSES.APPROVED}')::int AS "approved",
      COUNT(*) FILTER (WHERE status = '${STATUSES.ACTIVATION_PENDING}')::int AS "activationPending",
      COUNT(*) FILTER (WHERE status = '${STATUSES.ACTIVE}')::int AS "active",
      COUNT(*) FILTER (WHERE status = '${STATUSES.RETURNED}')::int AS "returned",
      COUNT(*) FILTER (WHERE status = '${STATUSES.REJECTED}')::int AS "rejected"
    FROM unit_contact_applications ${where}`,
    params
  );
  const total = summaryResult ? summaryResult.total : 0;
  const summary = summaryResult ? {
    total,
    pendingReview: summaryResult.pendingReview || 0,
    approved: summaryResult.approved || 0,
    activationPending: summaryResult.activationPending || 0,
    active: summaryResult.active || 0,
    returned: summaryResult.returned || 0,
    rejected: summaryResult.rejected || 0
  } : { total: 0, pendingReview: 0, approved: 0, activationPending: 0, active: 0, returned: 0, rejected: 0 };

  const page = buildAdminApplicationPage(nextFilters, total);
  idx++;
  params.push(page.limit);
  idx++;
  params.push(page.offset);
  const rows = await db.queryAll(
    `${APPLICATION_SELECT} ${where} ORDER BY COALESCE(updated_at, submitted_at) DESC, id DESC LIMIT $${idx - 1} OFFSET $${idx}`,
    params
  );
  const items = rows.map(mapRowToApplication);

  return {
    items,
    total,
    summary,
    page,
    filters: {
      status: nextFilters.status,
      email: nextFilters.email,
      keyword: nextFilters.keyword,
      limit: String(page.limit),
      offset: String(page.offset)
    },
    generatedAt: new Date().toISOString()
  };
}

/* ------------------------------------------------------------------ */
/*  Global API rate limiter (per IP)                                   */
/* ------------------------------------------------------------------ */

const GLOBAL_RATE_LIMIT_WINDOW_MS = Number(process.env.API_RATE_LIMIT_WINDOW_MS) || 60_000;
const GLOBAL_RATE_LIMIT_MAX_REQUESTS = Number(process.env.API_RATE_LIMIT_MAX_REQUESTS) || 120;
const globalRateLimitStore = new Map();

function checkGlobalRateLimit(req) {
  const now = Date.now();
  const clientIp = readClientAddress(req) || 'unknown';
  const activeSince = now - GLOBAL_RATE_LIMIT_WINDOW_MS;
  const timestamps = (globalRateLimitStore.get(clientIp) || []).filter((ts) => ts > activeSince);
  timestamps.push(now);
  globalRateLimitStore.set(clientIp, timestamps);
  if (timestamps.length > GLOBAL_RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = Math.max(1000, GLOBAL_RATE_LIMIT_WINDOW_MS - (now - timestamps[0]));
    return { limited: true, retryAfterSec: Math.ceil(retryAfterMs / 1000) };
  }
  return { limited: false, retryAfterSec: 0 };
}

/* Clean up stale entries every 5 minutes */
setInterval(() => {
  const cutoff = Date.now() - GLOBAL_RATE_LIMIT_WINDOW_MS;
  for (const [key, timestamps] of globalRateLimitStore) {
    const fresh = timestamps.filter((ts) => ts > cutoff);
    if (fresh.length === 0) globalRateLimitStore.delete(key);
    else globalRateLimitStore.set(key, fresh);
  }
}, 5 * 60_000).unref();

/* ------------------------------------------------------------------ */
/*  Apply throttle                                                     */
/* ------------------------------------------------------------------ */

function buildApplyThrottleKey(payload, clientAddress) {
  return [cleanText(payload && payload.applicantEmail).toLowerCase(), cleanText(clientAddress)].filter(Boolean).join('::');
}

function registerApplyAttempt(payload, clientAddress) {
  const now = Date.now();
  const key = buildApplyThrottleKey(payload, clientAddress);
  if (!key) return { limited: false, retryAfterMs: 0 };
  const activeSince = now - APPLY_RATE_LIMIT_WINDOW_MS;
  const attempts = (applyThrottle.get(key) || []).filter((ts) => ts > activeSince);
  attempts.push(now);
  applyThrottle.set(key, attempts);
  if (attempts.length > APPLY_RATE_LIMIT_MAX_REQUESTS) {
    return { limited: true, retryAfterMs: Math.max(1000, APPLY_RATE_LIMIT_WINDOW_MS - (now - attempts[0])) };
  }
  return { limited: false, retryAfterMs: 0 };
}

function isTrustedProxyAddress(address) {
  const value = cleanText(address);
  if (!value) return false;
  if (value === '::1' || value === '127.0.0.1' || value === 'localhost') return true;
  if (value.startsWith('::ffff:127.')) return true;
  if (/^10\./.test(value)) return true;
  if (/^192\.168\./.test(value)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(value)) return true;
  if (/^fc[0-9a-f]{2}:/i.test(value) || /^fd[0-9a-f]{2}:/i.test(value)) return true;
  return false;
}

function readClientAddress(req) {
  const remoteAddress = cleanText(req && req.socket && req.socket.remoteAddress);
  const forwarded = cleanText(req && req.headers && req.headers['x-forwarded-for']);
  if (forwarded && isTrustedProxyAddress(remoteAddress)) {
    return forwarded.split(',')[0].trim();
  }
  return remoteAddress;
}

/* ------------------------------------------------------------------ */
/*  Audit helper                                                       */
/* ------------------------------------------------------------------ */

async function createAuditRow(input) {
  await db.query(`
    INSERT INTO ops_audit (title, event_type, actor_email, target_email, unit_code, record_id, occurred_at, payload_json)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    cleanText(input.recordId || input.eventType || 'audit'),
    cleanText(input.eventType),
    cleanText(input.actorEmail),
    cleanText(input.targetEmail || ''),
    cleanText(input.unitCode || ''),
    cleanText(input.recordId),
    cleanText(input.occurredAt) || new Date().toISOString(),
    cleanText(input.payloadJson)
  ]);
}

async function tryCreateAuditRow(input) {
  try {
    await createAuditRow(input);
  } catch (error) {
    console.error('[audit] failed to create audit row', String(error && error.message || error || 'unknown error'), input && input.eventType ? 'event=' + input.eventType : '');
  }
}

/* ------------------------------------------------------------------ */
/*  Application snapshots / diffs                                      */
/* ------------------------------------------------------------------ */

function buildApplicationSnapshot(application) {
  if (!application) return null;
  const authorizedUnits = Array.isArray(application.authorizedUnits)
    ? application.authorizedUnits.slice()
    : (Array.isArray(application.units) ? application.units.slice() : []);
  return {
    id: cleanText(application.id),
    applicantName: cleanText(application.applicantName),
    applicantEmail: cleanText(application.applicantEmail),
    extensionNumber: cleanText(application.extensionNumber),
    unitCategory: cleanText(application.unitCategory),
    primaryUnit: cleanText(application.primaryUnit),
    secondaryUnit: cleanText(application.secondaryUnit),
    unitValue: cleanText(application.unitValue),
    unitCode: cleanText(application.unitCode),
    authorizedUnits,
    contactType: cleanText(application.contactType),
    status: cleanText(application.status),
    reviewedBy: cleanText(application.reviewedBy),
    reviewedAt: cleanText(application.reviewedAt),
    activatedAt: cleanText(application.activatedAt),
    authorizationDocAttachmentId: cleanText(application.authorizationDocAttachmentId),
    authorizationDocDriveItemId: cleanText(application.authorizationDocDriveItemId),
    authorizationDocFileName: cleanText(application.authorizationDocFileName),
    authorizationDocContentType: cleanText(application.authorizationDocContentType),
    authorizationDocSize: Number(application.authorizationDocSize || 0),
    authorizationDocUploadedAt: cleanText(application.authorizationDocUploadedAt)
  };
}

function buildApplicationChanges(beforeItem, afterItem) {
  return buildFieldChanges(beforeItem, afterItem, [
    'applicantName', 'applicantEmail', 'extensionNumber',
    'unitCategory', 'primaryUnit', 'secondaryUnit',
    'unitValue', 'unitCode',
    { key: 'authorizedUnits', kind: 'array' },
    'contactType', 'note', 'status', 'reviewedBy', 'reviewedAt',
    'reviewComment', 'activationSentAt', 'activatedAt', 'externalUserId',
    'authorizationDocAttachmentId', 'authorizationDocDriveItemId',
    'authorizationDocFileName', 'authorizationDocContentType',
    'authorizationDocSize', 'authorizationDocUploadedAt'
  ]);
}

function summarizeLookupResults(applications) {
  const items = Array.isArray(applications) ? applications : [];
  return {
    total: items.length,
    ids: items.map((entry) => cleanText(entry.id)).filter(Boolean).slice(0, 10),
    statuses: items.reduce((result, entry) => {
      const key = cleanText(entry && entry.status) || 'unknown';
      result[key] = Number(result[key] || 0) + 1;
      return result;
    }, {})
  };
}

/* ------------------------------------------------------------------ */
/*  System user provisioning for unit-contact activation               */
/* ------------------------------------------------------------------ */

const USER_SELECT = `
  SELECT id, username, password, name, email, role,
         security_roles_json, primary_unit, authorized_units_json,
         scope_units_json, unit, units_json, active_unit,
         must_change_password, failed_attempts, locked_until,
         backend_mode, record_source, created_at, updated_at
  FROM system_users
`;

function mapRowToSystemUser(row) {
  if (!row) return null;
  return {
    username: row.username || '',
    password: row.password || '',
    name: row.name || '',
    email: row.email || '',
    role: row.role || '',
    securityRoles: parseJsonField(row.security_roles_json, []),
    primaryUnit: row.primary_unit || '',
    authorizedUnits: parseJsonField(row.authorized_units_json, []),
    scopeUnits: parseJsonField(row.scope_units_json, []),
    unit: row.unit || '',
    units: parseJsonField(row.units_json, []),
    activeUnit: row.active_unit || '',
    mustChangePassword: !!row.must_change_password,
    backendMode: row.backend_mode || 'pg-campus-backend',
    recordSource: row.record_source || 'frontend',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : ''
  };
}

async function getSystemUserEntryByUsername(username) {
  const target = cleanText(username).toLowerCase();
  if (!target) return null;
  const row = await db.queryOne(`${USER_SELECT} WHERE LOWER(username) = $1`, [target]);
  if (!row) return null;
  return { listItemId: String(row.id), item: mapRowToSystemUser(row) };
}

async function upsertSystemUser(existingEntry, nextItem) {
  const normalized = createSystemUserRecord(nextItem, nextItem.updatedAt || new Date().toISOString());
  const now = new Date().toISOString();
  if (existingEntry) {
    await db.query(`
      UPDATE system_users SET
        password=$1, display_name=$2, email=$3, role=$4,
        security_roles_json=$5, primary_unit=$6, authorized_units_json=$7,
        scope_units_json=$8, unit=$9, units_json=$10, active_unit=$11,
        must_change_password=$12, backend_mode=$13, record_source=$14, updated_at=$15
      WHERE id = $16
    `, [
      normalized.password, normalized.name, normalized.email, normalized.role,
      JSON.stringify(normalized.securityRoles || []),
      normalized.primaryUnit,
      JSON.stringify(normalized.authorizedUnits || []),
      JSON.stringify(normalized.scopeUnits || []),
      normalized.unit,
      JSON.stringify(normalized.units || []),
      normalized.activeUnit,
      normalized.mustChangePassword,
      'pg-campus-backend', 'unit-contact-activation', now,
      Number(existingEntry.listItemId)
    ]);
    return { created: false, item: normalized };
  }
  await db.query(`
    INSERT INTO system_users (
      username, password, display_name, email, role,
      security_roles_json, primary_unit, authorized_units_json,
      scope_units_json, unit, units_json, active_unit,
      must_change_password, backend_mode, record_source, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
  `, [
    normalized.username, normalized.password, normalized.name, normalized.email, normalized.role,
    JSON.stringify(normalized.securityRoles || []),
    normalized.primaryUnit,
    JSON.stringify(normalized.authorizedUnits || []),
    JSON.stringify(normalized.scopeUnits || []),
    normalized.unit,
    JSON.stringify(normalized.units || []),
    normalized.activeUnit,
    normalized.mustChangePassword,
    'pg-campus-backend', 'unit-contact-activation', now, now
  ]);
  return { created: true, item: normalized };
}

function createGeneratedPasswordSecret(password, existingPasswordSecret) {
  const plain = cleanText(password);
  if (!plain) return '';
  const existingState = readStoredPasswordState(existingPasswordSecret);
  const existingVersion = Number(existingState && existingState.sessionVersion) || 1;
  const nextVersion = cleanText(existingPasswordSecret) ? existingVersion + 1 : existingVersion;
  return serializePasswordSecret(createPasswordSecret(plain, {
    mustChangePassword: true,
    sessionVersion: nextVersion
  }));
}

function generateRandomInitialPassword() {
  for (let index = 0; index < 12; index += 1) {
    const candidate = generatePassword(14);
    if (/[A-Z]/.test(candidate) && /[a-z]/.test(candidate) && /\d/.test(candidate)) {
      return candidate;
    }
  }
  return 'Temp' + crypto.randomBytes(4).toString('hex').slice(0, 8) + '9';
}

function resolveUnitContactLoginUsername(application) {
  return normalizeLookupEmail(application && application.applicantEmail);
}

async function provisionUnitContactSystemUser(application) {
  const loginUsername = resolveUnitContactLoginUsername(application);
  if (!loginUsername) {
    const error = new Error('Application email is required to provision the system user.');
    error.statusCode = 400;
    throw error;
  }

  const existingUserEntry = await getSystemUserEntryByUsername(loginUsername);
  const initialPassword = generateRandomInitialPassword();
  const nextPasswordSecret = createGeneratedPasswordSecret(initialPassword, cleanText(existingUserEntry && existingUserEntry.item && existingUserEntry.item.password));
  const primaryUnit = cleanText(application && application.primaryUnit) || cleanText(application && application.unitValue);
  const authorizedUnits = Array.isArray(application && application.authorizedUnits)
    ? application.authorizedUnits.map((entry) => cleanText(entry)).filter(Boolean)
    : [];
  const matrixUnits = Array.from(new Set([primaryUnit, ...authorizedUnits].filter(Boolean)));
  const systemUserPayload = {
    username: loginUsername,
    password: nextPasswordSecret,
    name: cleanText(application && application.applicantName) || cleanText(application && application.applicantEmail) || 'Unknown',
    email: cleanText(application && application.applicantEmail),
    role: USER_ROLES.UNIT_ADMIN,
    securityRoles: Array.isArray(application && application.securityRoles) ? application.securityRoles : [],
    primaryUnit,
    authorizedUnits: matrixUnits,
    scopeUnits: matrixUnits,
    unit: primaryUnit,
    units: matrixUnits,
    activeUnit: primaryUnit,
    mustChangePassword: true,
    backendMode: 'pg-campus-backend',
    recordSource: 'unit-contact-activation'
  };
  validateSystemUserPayload(systemUserPayload, { requirePassword: !existingUserEntry });
  const userWrite = await upsertSystemUser(existingUserEntry, systemUserPayload);
  if (systemUserRouter && typeof systemUserRouter.invalidateUsersCache === 'function') {
    systemUserRouter.invalidateUsersCache();
  }
  return { loginUsername, initialPassword, userWrite };
}

/* ------------------------------------------------------------------ */
/*  Email notifications (Graph Mail — interim)                         */
/* ------------------------------------------------------------------ */

function getUnitContactNotifyTo() {
  return cleanText(
    process.env.UNIT_CONTACT_NOTIFY_TO
    || process.env.GRAPH_MAIL_SENDER_UPN
    || process.env.AUTH_MAIL_SENDER_UPN
  );
}

function buildUnitContactApplicantMail(application) {
  return {
    subject: `[ISMS] 已收到單位管理人申請：${cleanText(application && application.id)}`,
    html: buildHtmlDocument([
      `您好，您的單位管理人申請已送出。`,
      `申請編號：${cleanText(application && application.id)}`,
      `申請單位：${cleanText(application && application.unitValue)}`,
      `目前狀態：${cleanText(application && application.statusLabel) || cleanText(application && application.status)}`,
      `審核通過後，系統會直接啟用帳號並寄送登入資訊。`,
      `登入帳號即為您申請時填寫的電子郵件。`,
      `如需查詢進度，請使用同一電子郵件回到系統查詢。`
    ])
  };
}

function buildUnitContactAdminMail(application) {
  return {
    subject: `[ISMS] 新的單位管理人申請：${cleanText(application && application.id)}`,
    html: buildHtmlDocument([
      `系統收到新的單位管理人申請，請管理端留意。`,
      `申請編號：${cleanText(application && application.id)}`,
      `申請單位：${cleanText(application && application.unitValue)}`,
      `申請人：${cleanText(application && application.applicantName)}`,
      `申請電子郵件：${cleanText(application && application.applicantEmail)}`,
      `分機：${cleanText(application && application.extensionNumber)}`,
      `目前狀態：${cleanText(application && application.statusLabel) || cleanText(application && application.status)}`
    ])
  };
}

function buildUnitContactStatusMail(application, options) {
  const opts = options || {};
  const loginUsername = cleanText(opts.loginUsername) || cleanText(application && application.externalUserId) || resolveUnitContactLoginUsername(application);
  const initialPassword = cleanText(opts.initialPassword);
  return {
    subject: `[ISMS] 單位管理人申請進度更新：${cleanText(application && application.id)}`,
    html: buildHtmlDocument([
      `您好，您的單位管理人申請狀態已更新。`,
      `申請編號：${cleanText(application && application.id)}`,
      `申請單位：${cleanText(application && application.unitValue)}`,
      `目前狀態：${cleanText(application && application.statusLabel) || cleanText(application && application.status)}`,
      cleanText(application && application.reviewComment) ? `處理說明：${cleanText(application && application.reviewComment)}` : '',
      cleanText(application && application.status) === STATUSES.ACTIVE
        ? [
            loginUsername ? `登入帳號：${loginUsername}` : '',
            initialPassword ? `初始密碼：${initialPassword}` : '',
            initialPassword
              ? '登入帳號固定為申請時使用的電子郵件。請使用上列初始密碼登入系統，並於首次登入後立即修改密碼。'
              : (loginUsername
                  ? '帳號已啟用，登入帳號固定為申請時使用的電子郵件。若尚未收到新的初始密碼，請先使用忘記密碼流程重設，或聯絡管理端重新寄送登入資訊。'
                  : '帳號已可啟用或已完成啟用，請依管理端通知的帳號資訊登入系統。')
          ].filter(Boolean).join('\n')
        : '請使用原送件電子郵件回到系統查詢最新處理進度。'
    ].filter(Boolean))
  };
}

// Note: sendGraphMail needs graphRequest/getDelegatedToken — these are loaded from graph-mailer.cjs
// which handles its own token acquisition. We pass a shim for backward compatibility.
async function getDelegatedTokenShim() {
  // graph-mailer.cjs uses its own token acquisition
  const { acquirePreferredGraphToken, loadBackendConfig } = require('../../scripts/_m365-a3-backend-utils.cjs');
  const token = await acquirePreferredGraphToken(loadBackendConfig());
  const decoded = JSON.parse(Buffer.from(String(token.accessToken).split('.')[1], 'base64url').toString('utf8'));
  return { accessToken: token.accessToken, decoded, mode: cleanText(token.mode) || 'delegated-cli' };
}

async function graphRequestShim(method, pathOrUrl, body) {
  const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
  const { accessToken } = await getDelegatedTokenShim();
  const targetUrl = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : GRAPH_ROOT + pathOrUrl;
  const response = await fetch(targetUrl, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (response.status === 204) return null;
  const text = await response.text();
  let parsed = null;
  if (text) { try { parsed = JSON.parse(text); } catch (_) { parsed = { raw: text }; } }
  if (!response.ok) {
    const message = parsed && parsed.error && parsed.error.message
      ? parsed.error.message : `Graph request failed with HTTP ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status >= 500 ? 502 : 500;
    throw error;
  }
  return parsed;
}

async function notifyUnitContactApplicationSubmitted(application) {
  const applicantMail = buildUnitContactApplicantMail(application);
  const adminMail = buildUnitContactAdminMail(application);
  const applicantEmail = cleanText(application && application.applicantEmail);
  const adminEmail = getUnitContactNotifyTo();
  const applicantDelivery = applicantEmail
    ? await sendGraphMail({ graphRequest: graphRequestShim, getDelegatedToken: getDelegatedTokenShim, to: applicantEmail, subject: applicantMail.subject, html: applicantMail.html })
    : { sent: false, channel: 'graph-mail', reason: 'missing-applicant-email' };
  const adminDelivery = adminEmail
    ? await sendGraphMail({ graphRequest: graphRequestShim, getDelegatedToken: getDelegatedTokenShim, to: adminEmail, subject: adminMail.subject, html: adminMail.html })
    : { sent: false, channel: 'graph-mail', reason: 'missing-admin-recipient' };
  await tryCreateAuditRow({
    eventType: applicantDelivery.sent ? 'unit_contact.applicant_mail_sent' : 'unit_contact.applicant_mail_failed',
    actorEmail: applicantEmail, targetEmail: applicantEmail,
    unitCode: cleanText(application && application.unitCode),
    recordId: cleanText(application && application.id),
    payloadJson: JSON.stringify({ delivery: applicantDelivery, subject: applicantMail.subject })
  });
  await tryCreateAuditRow({
    eventType: adminDelivery.sent ? 'unit_contact.admin_mail_sent' : 'unit_contact.admin_mail_failed',
    actorEmail: applicantEmail, targetEmail: adminEmail,
    unitCode: cleanText(application && application.unitCode),
    recordId: cleanText(application && application.id),
    payloadJson: JSON.stringify({ delivery: adminDelivery, subject: adminMail.subject })
  });
  return { applicant: applicantDelivery, admin: adminDelivery };
}

async function notifyUnitContactStatusUpdated(application, options) {
  const applicantEmail = cleanText(application && application.applicantEmail);
  const mail = buildUnitContactStatusMail(application, options);
  const delivery = applicantEmail
    ? await sendGraphMail({ graphRequest: graphRequestShim, getDelegatedToken: getDelegatedTokenShim, to: applicantEmail, subject: mail.subject, html: mail.html })
    : { sent: false, channel: 'graph-mail', reason: 'missing-applicant-email' };
  await tryCreateAuditRow({
    eventType: delivery.sent ? 'unit_contact.status_mail_sent' : 'unit_contact.status_mail_failed',
    actorEmail: cleanText(application && application.reviewedBy) || applicantEmail,
    targetEmail: applicantEmail,
    unitCode: cleanText(application && application.unitCode),
    recordId: cleanText(application && application.id),
    payloadJson: JSON.stringify({
      delivery, subject: mail.subject,
      status: cleanText(application && application.status),
      loginUsername: cleanText(options && options.loginUsername) || cleanText(application && application.externalUserId),
      hasInitialPassword: !!cleanText(options && options.initialPassword)
    })
  });
  return delivery;
}

/* ------------------------------------------------------------------ */
/*  Authorization doc content serving (local filesystem)               */
/* ------------------------------------------------------------------ */

function getAttachmentsDir() {
  return cleanText(process.env.ATTACHMENTS_DIR) || path.join(process.cwd(), 'data', 'attachments');
}

function sanitizePathSegment(value, fallback) {
  return cleanText(value || fallback || 'item')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/^\.+/, '').replace(/\.+$/, '')
    .slice(0, 120) || cleanText(fallback || 'item');
}

function sanitizeFileName(filename) {
  const baseName = cleanText(filename).split(/[\\/]/).pop() || '';
  return baseName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim() || 'attachment.bin';
}

function normalizeAttachmentDisplayName(filename) {
  const cleanName = cleanText(filename);
  if (!cleanName) return 'attachment.bin';
  const normalized = cleanName
    .replace(/^(?:att|trn|chk|car|uca)(?:[-_][a-z0-9]{4,}){1,}(?:[-_]+)/i, '')
    .replace(/^[a-z]{3,6}(?:[-_][a-z0-9]{4,}){1,}(?:[-_]+)/i, '')
    .replace(/^([a-z0-9]{3,6}(?:[-_][a-z0-9]{3,}){2,})[-_]+/i, '')
    .trim();
  return normalized || cleanName;
}

function buildContentDisposition(filename, download) {
  const cleanName = cleanText(filename) || 'attachment.bin';
  const asciiFallback = cleanName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  const encoded = encodeURIComponent(cleanName);
  return `${download ? 'attachment' : 'inline'}; filename="${asciiFallback || 'attachment.bin'}"; filename*=UTF-8''${encoded}`;
}

/* ------------------------------------------------------------------ */
/*  DI wiring — create all routers (PostgreSQL mode)                   */
/* ------------------------------------------------------------------ */

const requestAuthz = createRequestAuthz();

const checklistRouter = createChecklistRouter({
  parseJsonBody, writeJson, requestAuthz
});

const correctiveActionRouter = createCorrectiveActionRouter({
  parseJsonBody, writeJson, sendGraphMail, requestAuthz,
  graphRequest: graphRequestShim,
  getDelegatedToken: getDelegatedTokenShim
});

const auditTrailRouter = createAuditTrailRouter({
  writeJson, requestAuthz
});

const unitGovernanceRouter = createUnitGovernanceRouter({
  parseJsonBody, writeJson, requestAuthz,
  listUnitContactApplications: async function () {
    const rows = await listAllApplications();
    return rows.map((entry) => entry.application);
  },
  createAuditRow: tryCreateAuditRow
});

const trainingRouter = createTrainingRouter({
  parseJsonBody, writeJson, requestAuthz
});

const reviewScopeRouter = createReviewScopeRouter({
  parseJsonBody, writeJson, requestAuthz
});

const attachmentRouter = createAttachmentRouter({
  parseJsonBody, parseUploadBody, writeJson, writeBinary, requestAuthz
});

const systemUserRouter = createSystemUserRouter({
  parseJsonBody, writeJson, sendGraphMail, requestAuthz,
  graphRequest: graphRequestShim,
  getDelegatedToken: getDelegatedTokenShim
});

/* ------------------------------------------------------------------ */
/*  Health                                                             */
/* ------------------------------------------------------------------ */

async function getHealth() {
  const dbHealth = await db.healthCheck();
  return {
    ok: dbHealth.ok,
    ready: dbHealth.ok,
    contractVersion: CONTRACT_VERSION,
    repository: 'postgresql',
    database: { ok: dbHealth.ok, latencyMs: dbHealth.latencyMs }
  };
}

/* ------------------------------------------------------------------ */
/*  Route handlers                                                     */
/* ------------------------------------------------------------------ */

async function handleApply(req, res, origin) {
  let payload = null;
  try {
    const envelope = await parseJsonBody(req);
    validateActionEnvelope(envelope, ACTIONS.APPLY);
    payload = normalizeApplyPayload(envelope.payload);
    validateApplyPayload(payload);
    const throttle = registerApplyAttempt(payload, readClientAddress(req));
    if (throttle.limited) {
      const rateError = createHttpError('Too many application requests. Please try again later.', 429);
      rateError.retryAfterMs = throttle.retryAfterMs;
      throw rateError;
    }
    await ensureNoDuplicateActiveApplication(payload);
    const created = await createApplication(payload);
    const notifications = await notifyUnitContactApplicationSubmitted(created);
    return writeJson(res, buildJsonResponse(201, {
      ok: true,
      application: mapApplicationForPublicClient(created),
      notifications,
      contractVersion: CONTRACT_VERSION
    }), origin);
  } catch (error) {
    if (payload && Number(error && error.statusCode) === 409) {
      await tryCreateAuditRow({
        eventType: 'unit_contact.application_duplicate_blocked',
        actorEmail: cleanText(payload.applicantEmail),
        targetEmail: cleanText(payload.applicantEmail),
        unitCode: cleanText(payload.unitCode),
        recordId: cleanText(error && error.duplicatedApplication && error.duplicatedApplication.id) || cleanText(payload.unitValue),
        payloadJson: JSON.stringify({
          requested: buildApplicationSnapshot(payload),
          duplicated: buildApplicationSnapshot(error && error.duplicatedApplication),
          duplicatedChanges: buildApplicationChanges(null, error && error.duplicatedApplication)
        })
      });
    }
    const response = buildErrorResponse(error, 'Failed to submit application.');
    if (Number(error && error.statusCode) === 429 && Number(error && error.retryAfterMs) > 0) {
      response.headers = { ...(response.headers || {}), 'Retry-After': String(Math.ceil(Number(error.retryAfterMs) / 1000)) };
    }
    return writeJson(res, response, origin);
  }
}

async function handleAdminList(req, res, origin, url) {
  try {
    const authz = await requestAuthz.requireAuthenticatedUser(req);
    requestAuthz.requireAdmin(authz, '僅最高管理員可檢視申請清單');
    const result = await listApplicationsForAdmin({
      status: url.searchParams.get('status'),
      email: url.searchParams.get('email'),
      keyword: url.searchParams.get('keyword'),
      limit: url.searchParams.get('limit'),
      offset: url.searchParams.get('offset')
    });
    return writeJson(res, buildJsonResponse(200, {
      ok: true,
      items: Array.isArray(result && result.items) ? result.items.map(mapApplicationForClient) : [],
      total: Math.max(0, Number(result && result.total) || 0),
      summary: result && result.summary ? result.summary : summarizeAdminApplications([]),
      page: result && result.page ? result.page : buildAdminApplicationPage({}, 0),
      filters: result && result.filters ? result.filters : readAdminApplicationFilters({}),
      generatedAt: String(result && result.generatedAt || '').trim() || new Date().toISOString(),
      contractVersion: CONTRACT_VERSION
    }), origin);
  } catch (error) {
    return writeJson(res, buildErrorResponse(error, 'Failed to list applications.'), origin);
  }
}

async function handleReview(req, res, origin) {
  try {
    const authz = await requestAuthz.requireAuthenticatedUser(req);
    requestAuthz.requireAdmin(authz, '僅最高管理員可審核申請');
    const envelope = await parseJsonBody(req);
    validateActionEnvelope(envelope, ACTIONS.REVIEW);
    const payload = normalizeReviewPayload(envelope.payload);
    validateReviewPayload(payload);
    const reviewActor = cleanText(payload.reviewedBy) || cleanText(authz && authz.user && authz.user.name) || cleanText(authz && authz.username);
    const existingApplicationEntry = await findApplicationEntryById(payload.id);
    if (!existingApplicationEntry) {
      const missingError = new Error('Application not found');
      missingError.statusCode = 404;
      throw missingError;
    }
    const currentApplication = existingApplicationEntry.application;
    const currentStatus = cleanText(currentApplication && currentApplication.status);
    if (payload.status === STATUSES.APPROVED && currentStatus === STATUSES.ACTIVE) {
      const alreadyActiveError = new Error('申請已啟用，如需補寄登入資訊請使用重新寄送功能。');
      alreadyActiveError.statusCode = 409;
      throw alreadyActiveError;
    }

    let provisioning = null;
    let result = null;
    if (payload.status === STATUSES.APPROVED) {
      provisioning = await provisionUnitContactSystemUser(currentApplication);
      result = await updateApplicationRecord(payload.id, {
        status: STATUSES.ACTIVE,
        reviewComment: payload.reviewComment,
        reviewedBy: reviewActor,
        reviewedAt: new Date().toISOString(),
        activatedAt: new Date().toISOString(),
        activationSentAt: new Date().toISOString(),
        externalUserId: provisioning.loginUsername
      });
    } else {
      result = await updateApplicationRecord(payload.id, {
        status: payload.status,
        reviewComment: payload.reviewComment,
        reviewedBy: reviewActor,
        reviewedAt: new Date().toISOString()
      });
    }
    const delivery = await notifyUnitContactStatusUpdated(result.after, provisioning ? {
      loginUsername: provisioning.loginUsername,
      initialPassword: provisioning.initialPassword
    } : null);
    await tryCreateAuditRow({
      eventType: provisioning ? 'unit_contact.application_reviewed_and_activated' : 'unit_contact.application_reviewed',
      actorEmail: cleanText(authz && authz.user && authz.user.email),
      targetEmail: cleanText(result.after && result.after.applicantEmail),
      unitCode: cleanText(result.after && result.after.unitCode),
      recordId: cleanText(result.after && result.after.id),
      payloadJson: JSON.stringify({
        snapshot: buildApplicationSnapshot(result.after),
        changes: buildApplicationChanges(result.before, result.after),
        delivery,
        loginUsername: cleanText(provisioning && provisioning.loginUsername),
        createdSystemUser: !!(provisioning && provisioning.userWrite && provisioning.userWrite.created),
        updatedSystemUser: !!(provisioning && provisioning.userWrite)
      })
    });
    return writeJson(res, buildJsonResponse(200, {
      ok: true,
      item: mapApplicationForClient(result.after),
      delivery,
      contractVersion: CONTRACT_VERSION
    }), origin);
  } catch (error) {
    return writeJson(res, buildErrorResponse(error, 'Failed to review application.'), origin);
  }
}

async function handleActivate(req, res, origin) {
  try {
    const authz = await requestAuthz.requireAuthenticatedUser(req);
    requestAuthz.requireAdmin(authz, '僅最高管理員可完成帳號啟用');
    const envelope = await parseJsonBody(req);
    validateActionEnvelope(envelope, ACTIONS.ACTIVATE);
    const payload = normalizeActivationPayload(envelope.payload);
    validateActivationPayload(payload);

    const existingApplicationEntry = await findApplicationEntryById(payload.id);
    if (!existingApplicationEntry) {
      const missingError = new Error('Application not found');
      missingError.statusCode = 404;
      throw missingError;
    }
    const currentApplication = existingApplicationEntry.application;
    const currentStatus = cleanText(currentApplication && currentApplication.status);
    if (![STATUSES.APPROVED, STATUSES.ACTIVATION_PENDING, STATUSES.ACTIVE].includes(currentStatus)) {
      const statusError = new Error('申請尚未通過審核，不能直接標記為已啟用。');
      statusError.statusCode = 409;
      throw statusError;
    }

    const reviewActor = cleanText(payload.reviewedBy) || cleanText(authz && authz.user && authz.user.name) || cleanText(authz && authz.username);
    const provisioning = await provisionUnitContactSystemUser(currentApplication);
    const result = await updateApplicationRecord(payload.id, {
      status: STATUSES.ACTIVE,
      reviewComment: payload.reviewComment,
      reviewedBy: reviewActor,
      reviewedAt: new Date().toISOString(),
      activatedAt: new Date().toISOString(),
      activationSentAt: new Date().toISOString(),
      externalUserId: provisioning.loginUsername
    });
    const delivery = await notifyUnitContactStatusUpdated(result.after, {
      loginUsername: provisioning.loginUsername,
      initialPassword: provisioning.initialPassword
    });
    await tryCreateAuditRow({
      eventType: 'unit_contact.application_activated',
      actorEmail: cleanText(authz && authz.user && authz.user.email),
      targetEmail: cleanText(result.after && result.after.applicantEmail),
      unitCode: cleanText(result.after && result.after.unitCode),
      recordId: cleanText(result.after && result.after.id),
      payloadJson: JSON.stringify({
        snapshot: buildApplicationSnapshot(result.after),
        changes: buildApplicationChanges(result.before, result.after),
        delivery,
        loginUsername: provisioning.loginUsername,
        createdSystemUser: !!(provisioning.userWrite && provisioning.userWrite.created),
        updatedSystemUser: !!provisioning.userWrite
      })
    });
    return writeJson(res, buildJsonResponse(200, {
      ok: true, item: mapApplicationForClient(result.after), delivery, contractVersion: CONTRACT_VERSION
    }), origin);
  } catch (error) {
    return writeJson(res, buildErrorResponse(error, 'Failed to activate application.'), origin);
  }
}

async function handleAuthorizationDocContent(req, res, origin, url, applicationId) {
  try {
    const entry = await findApplicationEntryById(applicationId);
    if (!entry || !entry.application) {
      const notFound = new Error('Application not found');
      notFound.statusCode = 404;
      throw notFound;
    }
    const application = entry.application;
    const applicantEmail = cleanText(application.applicantEmail).toLowerCase();
    const authorizationHeader = cleanText(req && req.headers && req.headers.authorization);
    if (authorizationHeader && /^Bearer\s+/i.test(authorizationHeader)) {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const actorEmail = cleanText(authz && authz.user && authz.user.email).toLowerCase();
      const actorUsername = cleanText(authz && authz.username).toLowerCase();
      if (!requestAuthz.isAdmin(authz) && actorEmail !== applicantEmail && actorUsername !== applicantEmail) {
        const forbidden = new Error('Forbidden');
        forbidden.statusCode = 403;
        throw forbidden;
      }
    } else {
      const lookupEmail = normalizeLookupEmail(url.searchParams.get('email'));
      if (cleanText(lookupEmail).toLowerCase() !== applicantEmail) {
        const forbidden = new Error('Forbidden');
        forbidden.statusCode = 403;
        throw forbidden;
      }
    }

    const download = cleanText(url.searchParams.get('download')) === '1';

    // Try to find attachment in DB first
    const attachmentId = cleanText(application.authorizationDocAttachmentId);
    if (attachmentId) {
      const attRow = await db.queryOne(`SELECT * FROM attachments WHERE attachment_id = $1`, [attachmentId]);
      if (attRow && attRow.storage_path) {
        const storagePath = path.join(getAttachmentsDir(), cleanText(attRow.storage_path));
        try {
          const payload = await fs.promises.readFile(storagePath);
          const contentType = cleanText(attRow.content_type) || cleanText(application.authorizationDocContentType) || 'application/octet-stream';
          const fileName = normalizeAttachmentDisplayName(cleanText(attRow.file_name) || application.authorizationDocFileName || 'authorization-doc.pdf');
          await writeBinary(res, {
            status: 200,
            path: '/api/unit-contact/applications/authorization-doc/content',
            body: payload,
            headers: {
              'Content-Type': contentType,
              'Content-Disposition': buildContentDisposition(fileName, download)
            }
          }, origin);
          return;
        } catch (_) {
          // fall through to try other methods
        }
      }
    }

    // Try direct filesystem path
    const relativePath = [
      'unit-contact-authorization-doc',
      sanitizePathSegment(application.applicantEmail, 'applicant'),
      sanitizePathSegment(attachmentId, 'att')
    ].join('/');
    const baseDir = path.join(getAttachmentsDir(), relativePath);
    try {
      const files = await fs.promises.readdir(baseDir);
      if (files.length > 0) {
        const filePath = path.join(baseDir, files[0]);
        const payload = await fs.promises.readFile(filePath);
        const contentType = cleanText(application.authorizationDocContentType) || 'application/octet-stream';
        const fileName = normalizeAttachmentDisplayName(files[0] || application.authorizationDocFileName || 'authorization-doc.pdf');
        await writeBinary(res, {
          status: 200,
          path: '/api/unit-contact/applications/authorization-doc/content',
          body: payload,
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': buildContentDisposition(fileName, download)
          }
        }, origin);
        return;
      }
    } catch (_) { /* directory doesn't exist */ }

    const missing = new Error('Authorization document not found');
    missing.statusCode = 404;
    throw missing;
  } catch (error) {
    await writeJson(res, {
      status: Number(error && error.statusCode) || 500,
      jsonBody: { ok: false, error: cleanText(error && error.message) || 'Failed to read authorization document.' }
    }, origin);
  }
}

async function handleLookup(req, res, origin, url) {
  let email = '';
  try {
    if (String(req.method || 'GET').toUpperCase() === 'GET') {
      email = normalizeLookupEmail(url.searchParams.get('email'));
    } else {
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ACTIONS.LOOKUP);
      email = normalizeLookupEmail(envelope && envelope.payload && envelope.payload.email);
    }
    const applications = await listApplicationsByEmail(email);
    await tryCreateAuditRow({
      eventType: 'unit_contact.status_looked_up',
      actorEmail: email, targetEmail: email, unitCode: '', recordId: email,
      payloadJson: JSON.stringify({ lookupEmail: email, summary: summarizeLookupResults(applications) })
    });
    return writeJson(res, buildJsonResponse(200, {
      ok: true,
      applications: applications.map(mapApplicationForPublicStatus),
      contractVersion: CONTRACT_VERSION
    }), origin);
  } catch (error) {
    return writeJson(res, buildErrorResponse(error, 'Failed to lookup application status.'), origin);
  }
}

async function handleHealth(_req, res, origin) {
  try {
    return writeJson(res, buildJsonResponse(200, await getHealth()), origin);
  } catch (error) {
    return writeJson(res, buildErrorResponse(error, 'Failed to read backend health.', 500), origin);
  }
}

/* ------------------------------------------------------------------ */
/*  HTTP server                                                        */
/* ------------------------------------------------------------------ */

function createServer() {
  return http.createServer(async (req, res) => {
    const startedAt = Date.now();
    const requestId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString('hex');
    req.__ismsRequestId = requestId;
    res.__ismsReq = req;
    res.setHeader('x-request-id', requestId);
    const origin = cleanText(req.headers.origin);
    const url = new URL(req.url, `http://${req.headers.host}`);
    res.once('finish', () => {
      if (!String(url.pathname || '').startsWith('/api/')) return;
      const durationMs = Date.now() - startedAt;
      const clientIp = readClientAddress(req) || '-';
      console.log(JSON.stringify({
        level: 'info', type: 'http',
        requestId, method: req.method, path: url.pathname,
        status: res.statusCode, durationMs, clientIp,
        contentLength: Number(res.getHeader('content-length') || 0),
        gzip: !!res.getHeader('content-encoding'),
        ts: new Date().toISOString()
      }));
    });

    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...buildCorsHeaders(origin), ...buildSecurityHeaders(url.pathname) });
      res.end();
      return;
    }

    /* Global API rate limiting */
    if (String(url.pathname || '').startsWith('/api/')) {
      const rateCheck = checkGlobalRateLimit(req);
      if (rateCheck.limited) {
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'Retry-After': String(rateCheck.retryAfterSec),
          ...buildCorsHeaders(origin),
          ...buildSecurityHeaders(url.pathname)
        });
        res.end(JSON.stringify({ ok: false, message: 'Too many requests. Please try again later.', retryAfterSec: rateCheck.retryAfterSec }));
        return;
      }
    }

    try {
      // ── Dashboard summary endpoint (admin only) ──
      if (url.pathname === '/api/dashboard/summary' && req.method === 'GET') {
        try {
          const authz = await requestAuthz.requireAuthenticatedUser(req);
          requestAuthz.requireAdmin(authz, 'Only admin can access dashboard summary');
          const auditYear = cleanText(url.searchParams && url.searchParams.get('auditYear')) || String(new Date().getFullYear() - 1911);
          const trainingYear = cleanText(url.searchParams && url.searchParams.get('trainingYear')) || auditYear;

          const [checklistStats, trainingStats, trainingByUnit, pendingApps, pendingCases] = await Promise.all([
            db.queryOne(`SELECT
              COUNT(DISTINCT unit) FILTER (WHERE status = '已送出')::int AS submitted_units,
              COUNT(DISTINCT unit)::int AS total_filing_units,
              COUNT(*)::int AS total_checklists,
              COUNT(*) FILTER (WHERE status = '草稿')::int AS draft_count,
              COUNT(*) FILTER (WHERE status = '已送出')::int AS submitted_count
              FROM checklists WHERE audit_year = $1`, [auditYear]),
            db.queryOne(`SELECT
              COUNT(*)::int AS total_forms,
              COUNT(*) FILTER (WHERE status = '已完成填報')::int AS completed_forms,
              COUNT(*) FILTER (WHERE status = '暫存')::int AS draft_forms,
              COUNT(*) FILTER (WHERE status = '待簽核')::int AS pending_forms,
              COUNT(*) FILTER (WHERE status = '退回更正')::int AS returned_forms,
              COALESCE(AVG(completion_rate), 0)::numeric(5,2) AS avg_completion_rate
              FROM training_forms WHERE training_year = $1`, [trainingYear]),
            db.queryAll(`SELECT stats_unit, status, COUNT(*)::int AS form_count,
              COALESCE(AVG(completion_rate), 0)::numeric(5,2) AS avg_rate
              FROM training_forms WHERE training_year = $1
              GROUP BY stats_unit, status ORDER BY stats_unit`, [trainingYear]),
            db.queryOne(`SELECT
              COUNT(*) FILTER (WHERE status = 'pending_review')::int AS pending_review,
              COUNT(*) FILTER (WHERE status = 'activation_pending')::int AS activation_pending
              FROM unit_contact_applications`),
            db.queryOne(`SELECT
              COUNT(*) FILTER (WHERE status = '待矯正')::int AS pending_correction,
              COUNT(*) FILTER (WHERE status = '已提案')::int AS proposed,
              COUNT(*) FILTER (WHERE status = '追蹤中')::int AS tracking,
              COUNT(*) FILTER (WHERE status NOT IN ('結案'))::int AS open_total
              FROM corrective_actions`)
          ]);

          const cs = checklistStats || {};
          const ts = trainingStats || {};
          const pa = pendingApps || {};
          const pc = pendingCases || {};
          const totalUnits = Math.max(Number(cs.total_filing_units) || 0, 163);
          const submittedUnits = Number(cs.submitted_units) || 0;
          const pendingTotal = (Number(pa.pending_review) || 0) + (Number(pa.activation_pending) || 0)
            + (Number(pc.pending_correction) || 0) + (Number(pc.proposed) || 0) + (Number(pc.tracking) || 0);

          await writeJson(res, buildJsonResponse(200, {
            checklist: {
              totalUnits,
              submittedUnits,
              notFiledUnits: totalUnits - submittedUnits,
              draftCount: Number(cs.draft_count) || 0,
              submittedCount: Number(cs.submitted_count) || 0,
              auditYear
            },
            training: {
              totalForms: Number(ts.total_forms) || 0,
              completedForms: Number(ts.completed_forms) || 0,
              draftForms: Number(ts.draft_forms) || 0,
              pendingForms: Number(ts.pending_forms) || 0,
              returnedForms: Number(ts.returned_forms) || 0,
              avgCompletionRate: Number(ts.avg_completion_rate) || 0,
              trainingYear,
              byStatsUnit: (trainingByUnit || []).map(function (r) {
                return { statsUnit: r.stats_unit, status: r.status, formCount: Number(r.form_count) || 0, avgRate: Number(r.avg_rate) || 0 };
              })
            },
            pending: {
              applicationsPendingReview: Number(pa.pending_review) || 0,
              activationPending: Number(pa.activation_pending) || 0,
              correctivePending: Number(pc.pending_correction) || 0,
              correctiveProposed: Number(pc.proposed) || 0,
              correctiveTracking: Number(pc.tracking) || 0,
              correctiveOpenTotal: Number(pc.open_total) || 0,
              totalPendingItems: pendingTotal
            },
            generatedAt: new Date().toISOString()
          }), origin);
        } catch (error) {
          await writeJson(res, buildErrorResponse(error, 'Failed to load dashboard summary.', 500), origin);
        }
        return;
      }

      if (url.pathname === '/api/unit-contact/health') {
        if (req.method !== 'GET') {
          await writeJson(res, buildErrorResponse(createHttpError('Method Not Allowed', 405), 'Method Not Allowed', 405), origin);
          return;
        }
        await handleHealth(req, res, origin);
        return;
      }
      if (url.pathname === '/api/unit-contact/apply' && req.method === 'POST') {
        await handleApply(req, res, origin);
        return;
      }
      if (url.pathname === '/api/unit-contact/applications' && req.method === 'GET') {
        await handleAdminList(req, res, origin, url);
        return;
      }
      if (url.pathname === '/api/unit-contact/status' && (req.method === 'POST' || req.method === 'GET')) {
        await handleLookup(req, res, origin, url);
        return;
      }
      if (url.pathname === '/api/unit-contact/review' && req.method === 'POST') {
        await handleReview(req, res, origin);
        return;
      }
      if (url.pathname === '/api/unit-contact/activate' && req.method === 'POST') {
        await handleActivate(req, res, origin);
        return;
      }
      const authDocMatch = url.pathname.match(/^\/api\/unit-contact\/applications\/([^/]+)\/authorization-doc\/content\/?$/);
      if (authDocMatch && req.method === 'GET') {
        await handleAuthorizationDocContent(req, res, origin, url, decodeURIComponent(authDocMatch[1]));
        return;
      }
      if (await correctiveActionRouter.tryHandle(req, res, origin, url)) return;
      if (await auditTrailRouter.tryHandle(req, res, origin, url)) return;
      if (await unitGovernanceRouter.tryHandle(req, res, origin, url)) return;
      if (await checklistRouter.tryHandle(req, res, origin, url)) return;
      if (await trainingRouter.tryHandle(req, res, origin, url)) return;
      if (await reviewScopeRouter.tryHandle(req, res, origin, url)) return;
      if (await attachmentRouter.tryHandle(req, res, origin, url)) return;
      if (await systemUserRouter.tryHandle(req, res, origin, url)) return;
      await writeJson(res, buildErrorResponse(new Error('Not found'), 'Not found', 404), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Unexpected backend error.', 500), origin);
    }
  });
}

function startServer(port = DEFAULT_PORT) {
  const server = createServer();
  server.listen(port, () => {
    console.log(`unit-contact-campus-backend listening on http://127.0.0.1:${port}`);
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createServer,
  startServer
};
