const http = require('http');
const crypto = require('crypto');
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
  mapApplicationToGraphFields,
  mapGraphFieldsToApplication,
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
  mapGraphFieldsToSystemUser,
  mapSystemUserToGraphFields,
  readStoredPasswordState,
  USER_ROLES,
  validateSystemUserPayload
} = require('../azure-function/system-user-api/src/shared/contract');
const {
  GRAPH_ROOT,
  acquirePreferredGraphToken,
  loadBackendConfig,
  resolveSiteIdFromUrl
} = require('../../scripts/_m365-a3-backend-utils.cjs');

const DEFAULT_PORT = Number(process.env.PORT || process.env.UNIT_CONTACT_BACKEND_PORT || 8787);
const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:8080',
  'http://localhost:8080'
];

const state = {
  siteId: '',
  siteUrl: '',
  lists: null,
  listMap: null,
  systemUsersList: null,
  attachmentsDrive: null,
  listColumnsMap: new Map(),
  actor: null,
  token: null,
  tokenExp: 0,
  tokenMode: '',
  applicationsCache: null,
  applicationsCacheAt: 0,
  applicationsCachePromise: null,
  applicationQueryCache: new Map()
};
const APPLICATIONS_CACHE_TTL_MS = Number(process.env.UNIT_CONTACT_APPLICATIONS_CACHE_MS || 30000);
const APPLICATIONS_QUERY_CACHE_TTL_MS = Number(process.env.UNIT_CONTACT_APPLICATIONS_QUERY_CACHE_MS || 15000);
const MAX_JSON_BODY_BYTES = Number(process.env.UNIT_CONTACT_MAX_JSON_BODY_BYTES || 1024 * 1024);
const APPLY_RATE_LIMIT_WINDOW_MS = Number(process.env.UNIT_CONTACT_APPLY_WINDOW_MS || 15 * 60 * 1000);
const APPLY_RATE_LIMIT_MAX_REQUESTS = Number(process.env.UNIT_CONTACT_APPLY_MAX_REQUESTS || 5);
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
  return raw
    .split(',')
    .map((entry) => cleanText(entry))
    .filter(Boolean);
}

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode || 400;
  return error;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    req.on('data', (chunk) => {
      totalBytes += Buffer.byteLength(chunk);
      if (totalBytes > MAX_JSON_BODY_BYTES) {
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

function decodeJwt(accessToken) {
  return JSON.parse(Buffer.from(String(accessToken || '').split('.')[1], 'base64url').toString('utf8'));
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
  const path = cleanText(pathname) || '/';
  return {
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), usb=(), payment=(), browsing-topics=()',
    'cache-control': path.startsWith('/api/') ? 'no-store, no-cache, must-revalidate' : 'no-store',
    'pragma': 'no-cache'
  };
}

async function writeJson(res, response, origin) {
  const payload = JSON.stringify(response.jsonBody || {});
  const headers = {
    ...(response.headers || {}),
    ...buildCorsHeaders(origin),
    ...buildSecurityHeaders(response.path || '/api'),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  };
  res.writeHead(response.status || 200, headers);
  res.end(payload);
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

function summarizeTokenActor(decoded, mode) {
  return {
    tokenMode: cleanText(mode) || 'delegated-cli',
    appId: cleanText(decoded && (decoded.appid || decoded.azp)),
    upn: cleanText(decoded && decoded.upn),
    scopes: cleanText(decoded && decoded.scp),
    roles: Array.isArray(decoded && decoded.roles) ? decoded.roles.join(',') : ''
  };
}

async function getDelegatedToken() {
  if (state.token && state.tokenExp > Date.now() + 60 * 1000) {
    return { accessToken: state.token, decoded: state.actor, mode: state.tokenMode || 'delegated-cli' };
  }
  const token = await acquirePreferredGraphToken(loadBackendConfig());
  const decoded = decodeJwt(token.accessToken);
  state.token = token.accessToken;
  state.tokenExp = Number(decoded.exp || 0) * 1000;
  state.actor = decoded;
  state.tokenMode = cleanText(token.mode) || 'delegated-cli';
  return { accessToken: token.accessToken, decoded, mode: state.tokenMode };
}

async function rawGraphResponse(method, pathOrUrl, body, headers) {
  const { accessToken } = await getDelegatedToken();
  const targetUrl = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : GRAPH_ROOT + pathOrUrl;
  const response = await fetch(targetUrl, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(headers || {})
    },
    body
  });
  if (!response.ok) {
    const contentType = cleanText(response.headers.get('content-type'));
    if (contentType.includes('application/json')) {
      const json = await response.json();
      const error = new Error(cleanText(json && json.error && json.error.message) || `Graph request failed with HTTP ${response.status}`);
      error.statusCode = response.status >= 500 ? 502 : 500;
      throw error;
    }
    const text = await response.text();
    const error = new Error(cleanText(text) || `Graph request failed with HTTP ${response.status}`);
    error.statusCode = response.status >= 500 ? 502 : 500;
    throw error;
  }
  return response;
}

function sanitizePathSegment(value, fallback) {
  return cleanText(value || fallback || 'item')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .slice(0, 120) || cleanText(fallback || 'item');
}

function sanitizeFileName(filename) {
  const baseName = cleanText(filename).split(/[\\/]/).pop() || '';
  return baseName
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim() || 'attachment.bin';
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

async function resolveAttachmentsDrive() {
  if (state.attachmentsDrive) return state.attachmentsDrive;
  const siteId = await resolveSiteId();
  const list = await resolveNamedList(getEnv('ATTACHMENTS_LIBRARY', 'ISMSAttachments'));
  state.attachmentsDrive = await graphRequest('GET', `/sites/${siteId}/lists/${list.id}/drive?$select=id,name,webUrl,driveType`);
  return state.attachmentsDrive;
}

async function resolveSiteId() {
  if (state.siteId) return state.siteId;
  const backendConfig = loadBackendConfig();
  const configuredSiteId = getEnv('UNIT_CONTACT_SHAREPOINT_SITE_ID', backendConfig.siteId);
  const configuredSiteUrl = getEnv('UNIT_CONTACT_SHAREPOINT_SITE_URL', backendConfig.sharePointSiteUrl);

  const { accessToken } = await getDelegatedToken();
  const siteId = configuredSiteId || await resolveSiteIdFromUrl(accessToken, configuredSiteUrl);
  if (!siteId) {
    throw new Error('Missing SharePoint site configuration. Set UNIT_CONTACT_SHAREPOINT_SITE_ID or UNIT_CONTACT_SHAREPOINT_SITE_URL.');
  }

  state.siteId = siteId;
  state.siteUrl = configuredSiteUrl;
  return siteId;
}

async function fetchListMap() {
  const siteId = await resolveSiteId();
  const body = await graphRequest('GET', '/sites/' + siteId + '/lists?$select=id,displayName,webUrl');
  return new Map((Array.isArray(body && body.value) ? body.value : []).map((entry) => [cleanText(entry.displayName), entry]));
}

async function resolveNamedList(name) {
  const listName = cleanText(name);
  if (!state.listMap || !state.listMap.has(listName)) {
    state.listMap = await fetchListMap();
  }
  let list = state.listMap.get(listName);
  if (!list) {
    state.listMap = await fetchListMap();
    list = state.listMap.get(listName);
  }
  if (!list) {
    throw new Error('SharePoint list not found: ' + listName);
  }
  return list;
}

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
    return {
      limited: true,
      retryAfterMs: Math.max(1000, APPLY_RATE_LIMIT_WINDOW_MS - (now - attempts[0]))
    };
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

function getSystemUsersListName() {
  return getEnv('SYSTEM_USERS_LIST', 'SystemUsers');
}

async function resolveSystemUsersList() {
  if (state.systemUsersList) return state.systemUsersList;
  state.systemUsersList = await resolveNamedList(getSystemUsersListName());
  return state.systemUsersList;
}

async function graphRequest(method, pathOrUrl, body) {
  const { accessToken } = await getDelegatedToken();
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
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      parsed = { raw: text };
    }
  }
  if (!response.ok) {
    const message = parsed && parsed.error && parsed.error.message
      ? parsed.error.message
      : `Graph request failed with HTTP ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status === 429
      ? 429
      : (response.status >= 500 ? 502 : 500);
    if (response.status === 429) {
      const retryAfter = Number.parseInt(response.headers.get('Retry-After') || '', 10);
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        error.retryAfterMs = retryAfter * 1000;
      }
    }
    throw error;
  }
  return parsed;
}

async function resolveLists() {
  if (state.lists) return state.lists;
  const applicationsName = getEnv('UNIT_CONTACT_APPLICATIONS_LIST', 'UnitContactApplications');
  const unitAdminsName = getEnv('UNIT_CONTACT_UNITADMINS_LIST', 'UnitAdmins');
  const auditName = getEnv('UNIT_CONTACT_AUDIT_LIST', 'OpsAudit');

  const applications = await resolveNamedList(applicationsName);
  const unitAdmins = await resolveNamedList(unitAdminsName);
  const audit = await resolveNamedList(auditName);

  state.lists = {
    applications,
    unitAdmins,
    audit
  };
  return state.lists;
}

async function fetchListColumnNames(listId) {
  const siteId = await resolveSiteId();
  const body = await graphRequest('GET', `/sites/${siteId}/lists/${listId}/columns?$select=name`);
  return new Set((Array.isArray(body && body.value) ? body.value : []).map((entry) => cleanText(entry && entry.name)).filter(Boolean));
}

async function resolveListColumnNames(listId) {
  const cleanListId = cleanText(listId);
  if (!cleanListId) return new Set();
  if (!state.listColumnsMap.has(cleanListId)) {
    state.listColumnsMap.set(cleanListId, await fetchListColumnNames(cleanListId));
  }
  return state.listColumnsMap.get(cleanListId);
}

function filterFieldsForExistingColumns(fields, existingNames) {
  const allowed = existingNames instanceof Set ? existingNames : new Set();
  return Object.entries(fields || {}).reduce((result, [key, value]) => {
    if (key === 'Title' || allowed.has(key)) {
      result[key] = value;
    }
    return result;
  }, {});
}

function cloneApplicationEntries(entries) {
  return Array.isArray(entries) ? JSON.parse(JSON.stringify(entries)) : [];
}

function invalidateApplicationCaches() {
  state.applicationsCache = null;
  state.applicationsCacheAt = 0;
  state.applicationsCachePromise = null;
  state.applicationQueryCache.clear();
}

function readAdminApplicationFilters(filters) {
  const source = filters && typeof filters === 'object' ? filters : {};
  const limit = Math.max(1, Math.min(200, Number(source.limit) || 50));
  const offset = Math.max(0, Number(source.offset) || 0);
  return {
    status: cleanText(source.status),
    email: cleanText(source.email),
    keyword: cleanText(source.keyword),
    limit,
    offset
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
    offset: safeOffset,
    limit,
    total: safeTotal,
    pageCount,
    currentPage,
    hasPrev,
    hasNext,
    prevOffset: hasPrev ? Math.max(0, safeOffset - limit) : 0,
    nextOffset: hasNext ? safeOffset + limit : safeOffset,
    pageStart: safeTotal > 0 ? safeOffset + 1 : 0,
    pageEnd: safeTotal > 0 ? Math.min(safeOffset + limit, safeTotal) : 0
  };
}

function summarizeAdminApplications(items) {
  const rows = Array.isArray(items) ? items : [];
  const summary = {
    total: rows.length,
    pendingReview: 0,
    approved: 0,
    activationPending: 0,
    active: 0,
    returned: 0,
    rejected: 0
  };
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

function getAdminApplicationQuerySignature(filters) {
  const nextFilters = readAdminApplicationFilters(filters);
  return [
    nextFilters.status,
    nextFilters.email.toLowerCase(),
    nextFilters.keyword.toLowerCase(),
    String(nextFilters.limit),
    String(nextFilters.offset)
  ].join('|');
}

async function listAllApplications() {
  const now = Date.now();
  if (Array.isArray(state.applicationsCache) && state.applicationsCache.length && now - state.applicationsCacheAt < APPLICATIONS_CACHE_TTL_MS) {
    return cloneApplicationEntries(state.applicationsCache);
  }
  if (state.applicationsCachePromise) {
    return cloneApplicationEntries(await state.applicationsCachePromise);
  }
  state.applicationsCachePromise = (async () => {
    const siteId = await resolveSiteId();
    const lists = await resolveLists();
    const items = [];
    let nextUrl = `${GRAPH_ROOT}/sites/${siteId}/lists/${lists.applications.id}/items?$expand=fields&$top=200`;

    while (nextUrl) {
      const body = await graphRequest('GET', nextUrl);
      items.push(...(Array.isArray(body && body.value) ? body.value : []));
      nextUrl = cleanText(body && body['@odata.nextLink']);
    }

    const rows = items
      .map((entry) => entry && entry.fields ? {
        listItemId: cleanText(entry.id),
        application: mapGraphFieldsToApplication({
          ...entry.fields,
          Created: entry.createdDateTime,
          Modified: entry.lastModifiedDateTime
        })
      } : null)
      .filter(Boolean);
    state.applicationsCache = rows;
    state.applicationsCacheAt = Date.now();
    return rows;
  })().catch((error) => {
    invalidateApplicationCaches();
    throw error;
  }).finally(() => {
    state.applicationsCachePromise = null;
  });
  return cloneApplicationEntries(await state.applicationsCachePromise);
}

function parseSequenceFromId(id, year) {
  const prefix = `UCA-${year}-`;
  if (!String(id || '').startsWith(prefix)) return 0;
  const raw = String(id).slice(prefix.length);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getNextSequence(year) {
  const applications = await listAllApplications();
  return applications.reduce((maxValue, entry) => Math.max(maxValue, parseSequenceFromId(entry.application && entry.application.id, year)), 0) + 1;
}

async function listApplicationsByEmail(email) {
  const applications = await listAllApplications();
  return applications
    .map((entry) => entry.application)
    .filter((entry) => entry.applicantEmail === email)
    .sort((left, right) => String(right.submittedAt).localeCompare(String(left.submittedAt)));
}

async function findApplicationEntryById(id) {
  const cleanId = cleanText(id);
  if (!cleanId) return null;
  const applications = await listAllApplications();
  return applications.find((entry) => cleanText(entry.application && entry.application.id) === cleanId) || null;
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

async function createAuditRow(input) {
  const siteId = await resolveSiteId();
  const lists = await resolveLists();
  const columnNames = await resolveListColumnNames(lists.audit.id);
  await graphRequest('POST', `/sites/${siteId}/lists/${lists.audit.id}/items`, {
    fields: filterFieldsForExistingColumns({
      Title: cleanText(input.recordId || input.eventType || 'audit'),
      EventType: cleanText(input.eventType),
      ActorEmail: cleanText(input.actorEmail),
      TargetEmail: cleanText(input.targetEmail),
      UnitCode: cleanText(input.unitCode),
      RecordId: cleanText(input.recordId),
      OccurredAt: cleanText(input.occurredAt) || new Date().toISOString(),
      PayloadJson: cleanText(input.payloadJson)
    }, columnNames)
  });
}

async function tryCreateAuditRow(input) {
  try {
    await createAuditRow(input);
  } catch (error) {
    console.error('[audit] failed to create audit row', String(error && error.message || error || 'unknown error'), input && input.eventType ? 'event=' + input.eventType : '');
  }
}

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
    'applicantName',
    'applicantEmail',
    'extensionNumber',
    'unitCategory',
    'primaryUnit',
    'secondaryUnit',
    'unitValue',
    'unitCode',
    { key: 'authorizedUnits', kind: 'array' },
    'contactType',
    'note',
    'status',
    'reviewedBy',
    'reviewedAt',
    'reviewComment',
    'activationSentAt',
    'activatedAt',
    'externalUserId',
    'authorizationDocAttachmentId',
    'authorizationDocDriveItemId',
    'authorizationDocFileName',
    'authorizationDocContentType',
    'authorizationDocSize',
    'authorizationDocUploadedAt'
  ]);
}

function buildUnitContactAuthorizationDocPath(application) {
  const ownerId = sanitizePathSegment(application && application.applicantEmail, 'applicant');
  const attachmentId = sanitizePathSegment(application && application.authorizationDocAttachmentId, 'att');
  const fileName = sanitizeFileName(application && application.authorizationDocFileName || '銝餌恣??????pdf');
  return ['unit-contact-authorization-doc', ownerId, attachmentId, fileName].join('/');
}function summarizeLookupResults(applications) {
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

function generateUsernameCandidate() {
  return `uca${crypto.randomBytes(4).toString('hex')}`;
}

async function generateUniqueUnitContactUsername() {
  for (let index = 0; index < 20; index += 1) {
    const candidate = generateUsernameCandidate();
    const existing = await getSystemUserEntryByUsername(candidate);
    if (!existing) return candidate;
  }
  throw new Error('?⊥??Ｙ??臭??雿恣?犖?餃撣唾?');
}

async function listAllSystemUsers() {
  const siteId = await resolveSiteId();
  const list = await resolveSystemUsersList();
  const rows = [];
  let nextUrl = '/sites/' + siteId + '/lists/' + list.id + '/items?$expand=fields&$top=200';
  while (nextUrl) {
    const body = await graphRequest('GET', nextUrl);
    const batch = Array.isArray(body && body.value) ? body.value : [];
    rows.push(...batch.map((entry) => ({
      listItemId: cleanText(entry && entry.id),
      item: mapGraphFieldsToSystemUser(entry && entry.fields ? entry.fields : {})
    })));
    nextUrl = cleanText(body && body['@odata.nextLink']);
  }
  return rows;
}

async function getSystemUserEntryByUsername(username) {
  const target = cleanText(username).toLowerCase();
  if (!target) return null;
  const rows = await listAllSystemUsers();
  return rows.find((entry) => cleanText(entry.item && entry.item.username).toLowerCase() === target) || null;
}

function resolveUnitContactLoginUsername(application) {
  return normalizeLookupEmail(application && application.applicantEmail);
}

async function upsertSystemUser(existingEntry, nextItem) {
  const siteId = await resolveSiteId();
  const list = await resolveSystemUsersList();
  const normalized = createSystemUserRecord(nextItem, nextItem.updatedAt || new Date().toISOString());
  const columnNames = await resolveListColumnNames(list.id);
  const fields = filterFieldsForExistingColumns(mapSystemUserToGraphFields(normalized), columnNames);
  if (existingEntry) {
    await graphRequest('PATCH', '/sites/' + siteId + '/lists/' + list.id + '/items/' + existingEntry.listItemId + '/fields', fields);
    return { created: false, item: normalized };
  }
  await graphRequest('POST', '/sites/' + siteId + '/lists/' + list.id + '/items', { fields });
  return { created: true, item: normalized };
}

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
    name: cleanText(application && application.applicantName),
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
    backendMode: state.tokenMode === 'app-only' ? 'campus-sharepoint-app-only' : 'campus-sharepoint-cli',
    recordSource: 'unit-contact-activation'
  };
  validateSystemUserPayload(systemUserPayload, { requirePassword: !existingUserEntry });
  const userWrite = await upsertSystemUser(existingUserEntry, systemUserPayload);
  return {
    loginUsername,
    initialPassword,
    userWrite
  };
}

async function notifyUnitContactApplicationSubmitted(application) {
  const applicantMail = buildUnitContactApplicantMail(application);
  const adminMail = buildUnitContactAdminMail(application);
  const applicantEmail = cleanText(application && application.applicantEmail);
  const adminEmail = getUnitContactNotifyTo();
  const applicantDelivery = applicantEmail
    ? await sendGraphMail({
        graphRequest,
        getDelegatedToken,
        to: applicantEmail,
        subject: applicantMail.subject,
        html: applicantMail.html
      })
    : { sent: false, channel: 'graph-mail', reason: 'missing-applicant-email' };
  const adminDelivery = adminEmail
    ? await sendGraphMail({
        graphRequest,
        getDelegatedToken,
        to: adminEmail,
        subject: adminMail.subject,
        html: adminMail.html
      })
    : { sent: false, channel: 'graph-mail', reason: 'missing-admin-recipient' };

  await tryCreateAuditRow({
    eventType: applicantDelivery.sent ? 'unit_contact.applicant_mail_sent' : 'unit_contact.applicant_mail_failed',
    actorEmail: cleanText(application && application.applicantEmail),
    targetEmail: cleanText(application && application.applicantEmail),
    unitCode: cleanText(application && application.unitCode),
    recordId: cleanText(application && application.id),
    payloadJson: JSON.stringify({
      delivery: applicantDelivery,
      subject: applicantMail.subject
    })
  });
  await tryCreateAuditRow({
    eventType: adminDelivery.sent ? 'unit_contact.admin_mail_sent' : 'unit_contact.admin_mail_failed',
    actorEmail: cleanText(application && application.applicantEmail),
    targetEmail: adminEmail,
    unitCode: cleanText(application && application.unitCode),
    recordId: cleanText(application && application.id),
    payloadJson: JSON.stringify({
      delivery: adminDelivery,
      subject: adminMail.subject
    })
  });

  return {
    applicant: applicantDelivery,
    admin: adminDelivery
  };
}

async function notifyUnitContactStatusUpdated(application, options) {
  const applicantEmail = cleanText(application && application.applicantEmail);
  const mail = buildUnitContactStatusMail(application, options);
  const delivery = applicantEmail
    ? await sendGraphMail({
        graphRequest,
        getDelegatedToken,
        to: applicantEmail,
        subject: mail.subject,
        html: mail.html
      })
    : { sent: false, channel: 'graph-mail', reason: 'missing-applicant-email' };

  await tryCreateAuditRow({
    eventType: delivery.sent ? 'unit_contact.status_mail_sent' : 'unit_contact.status_mail_failed',
      actorEmail: cleanText(application && application.reviewedBy) || cleanText(application && application.applicantEmail),
      targetEmail: applicantEmail,
      unitCode: cleanText(application && application.unitCode),
      recordId: cleanText(application && application.id),
      payloadJson: JSON.stringify({
        delivery,
        subject: mail.subject,
        status: cleanText(application && application.status),
        loginUsername: cleanText(options && options.loginUsername) || cleanText(application && application.externalUserId),
        hasInitialPassword: !!cleanText(options && options.initialPassword)
      })
  });

  return delivery;
}

async function createApplication(payload) {
  const siteId = await resolveSiteId();
  const lists = await resolveLists();
  const columnNames = await resolveListColumnNames(lists.applications.id);
  const nextSequence = await getNextSequence(new Date().getFullYear());
  const application = createApplicationRecord(payload, nextSequence);
  application.source = 'a3-campus-backend';
  application.backendMode = state.tokenMode === 'app-only' ? 'campus-sharepoint-app-only' : 'campus-sharepoint-cli';

  const created = await graphRequest('POST', `/sites/${siteId}/lists/${lists.applications.id}/items`, {
    fields: filterFieldsForExistingColumns(mapApplicationToGraphFields(application), columnNames)
  });
  const mapped = created && created.fields ? mapGraphFieldsToApplication(created.fields) : application;
  invalidateApplicationCaches();

  await tryCreateAuditRow({
    eventType: 'unit_contact.application_submitted',
    actorEmail: mapped.applicantEmail,
    targetEmail: mapped.applicantEmail,
    unitCode: mapped.unitCode,
    recordId: mapped.id,
    payloadJson: JSON.stringify({
      source: mapped.source,
      backendMode: mapped.backendMode,
      snapshot: buildApplicationSnapshot(mapped),
      changes: buildApplicationChanges(null, mapped)
    })
  });

  return mapped;
}

function matchesListFilter(application, filters) {
  const input = filters && typeof filters === 'object' ? filters : {};
  const status = cleanText(input.status);
  const email = cleanText(input.email).toLowerCase();
  const keyword = cleanText(input.keyword).toLowerCase();
  if (status && cleanText(application && application.status) !== status) return false;
  if (email && cleanText(application && application.applicantEmail).toLowerCase() !== email) return false;
  if (keyword) {
    const haystack = [
      cleanText(application && application.id),
      cleanText(application && application.applicantName),
      cleanText(application && application.applicantEmail),
      cleanText(application && application.unitValue),
      cleanText(application && application.reviewComment)
    ].join(' ').toLowerCase();
    if (!haystack.includes(keyword)) return false;
  }
  return true;
}

async function listApplicationsForAdmin(filters) {
  const nextFilters = readAdminApplicationFilters(filters);
  const signature = getAdminApplicationQuerySignature(nextFilters);
  const cached = state.applicationQueryCache.get(signature);
  if (cached && (Date.now() - Number(cached.createdAt || 0)) < APPLICATIONS_QUERY_CACHE_TTL_MS) {
    return JSON.parse(JSON.stringify(cached.value));
  }
  const applications = await listAllApplications();
  const items = applications
    .map((entry) => entry.application)
    .filter((application) => matchesListFilter(application, nextFilters))
    .sort((left, right) => String(right.updatedAt || right.submittedAt).localeCompare(String(left.updatedAt || left.submittedAt)));
  const page = buildAdminApplicationPage(nextFilters, items.length);
  const result = {
    items: items.slice(page.offset, page.offset + page.limit),
    total: items.length,
    summary: summarizeAdminApplications(items),
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
  state.applicationQueryCache.set(signature, {
    createdAt: Date.now(),
    value: result
  });
  return JSON.parse(JSON.stringify(result));
}

async function updateApplicationRecord(applicationId, updates) {
  const entry = await findApplicationEntryById(applicationId);
  if (!entry) {
    const error = new Error('Application not found');
    error.statusCode = 404;
    throw error;
  }
  const siteId = await resolveSiteId();
  const lists = await resolveLists();
  const columnNames = await resolveListColumnNames(lists.applications.id);
  const nextRecord = {
    ...entry.application,
    ...updates,
    updatedAt: new Date().toISOString()
  };
  const fields = filterFieldsForExistingColumns(mapApplicationToGraphFields(nextRecord), columnNames);
  await graphRequest('PATCH', `/sites/${siteId}/lists/${lists.applications.id}/items/${entry.listItemId}/fields`, fields);
  invalidateApplicationCaches();
  return {
    before: entry.application,
    after: mapGraphFieldsToApplication(fields)
  };
}

async function getHealth() {
  const health = {
    ok: true,
    ready: true,
    contractVersion: CONTRACT_VERSION
  };
  try {
    await resolveSiteId();
    await resolveLists();
  } catch (error) {
    console.error('[unit-contact.health] readiness check failed:', error);
    health.ok = false;
    health.ready = false;
    health.message = 'Backend is not ready.';
  }
  return health;
}

const requestAuthz = createRequestAuthz({
  graphRequest,
  resolveSiteId
});

const checklistRouter = createChecklistRouter({
  parseJsonBody,
  writeJson,
  graphRequest,
  resolveSiteId,
  getDelegatedToken,
  requestAuthz
});

const correctiveActionRouter = createCorrectiveActionRouter({
  parseJsonBody,
  writeJson,
  graphRequest,
  resolveSiteId,
  getDelegatedToken,
  sendGraphMail,
  requestAuthz
});

const auditTrailRouter = createAuditTrailRouter({
  writeJson,
  graphRequest,
  resolveSiteId,
  getDelegatedToken,
  requestAuthz
});

const unitGovernanceRouter = createUnitGovernanceRouter({
  parseJsonBody,
  writeJson,
  requestAuthz,
  listUnitContactApplications: async function () {
    const rows = await listAllApplications();
    return rows.map((entry) => entry.application);
  },
  createAuditRow: tryCreateAuditRow
});

const trainingRouter = createTrainingRouter({
  parseJsonBody,
  writeJson,
  graphRequest,
  resolveSiteId,
  getDelegatedToken,
  requestAuthz
});

const reviewScopeRouter = createReviewScopeRouter({
  parseJsonBody,
  writeJson,
  graphRequest,
  resolveSiteId,
  getDelegatedToken,
  requestAuthz
});

const attachmentRouter = createAttachmentRouter({
  parseJsonBody,
  writeJson,
  writeBinary,
  graphRequest,
  resolveSiteId,
  getDelegatedToken,
  requestAuthz
});

const systemUserRouter = createSystemUserRouter({
  parseJsonBody,
  writeJson,
  graphRequest,
  resolveSiteId,
  getDelegatedToken,
  sendGraphMail,
  requestAuthz
});

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
      response.headers = {
        ...(response.headers || {}),
        'Retry-After': String(Math.ceil(Number(error.retryAfterMs) / 1000))
      };
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
    requestAuthz.requireAdmin(authz, '\u50c5\u6700\u9ad8\u7ba1\u7406\u54e1\u53ef\u5b8c\u6210\u5e33\u865f\u555f\u7528');
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
      const statusError = new Error('\u7533\u8acb\u5c1a\u672a\u901a\u904e\u5be9\u6838\uff0c\u4e0d\u80fd\u76f4\u63a5\u6a19\u8a18\u70ba\u5df2\u555f\u7528\u3002');
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
      ok: true,
      item: mapApplicationForClient(result.after),
      delivery,
      contractVersion: CONTRACT_VERSION
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
    const siteId = await resolveSiteId();
    const drive = await resolveAttachmentsDrive();
    const fileName = normalizeAttachmentDisplayName(application.authorizationDocFileName || '銝餌恣??????pdf');
    const attachmentId = cleanText(application.authorizationDocAttachmentId);
    const driveItemId = cleanText(application.authorizationDocDriveItemId);
    const headers = { Accept: '*/*' };
    let response = null;
    if (driveItemId) {
      try {
        response = await rawGraphResponse('GET', `/sites/${siteId}/drives/${drive.id}/items/${encodeURIComponent(driveItemId)}/content`, undefined, headers);
      } catch (error) {
        if (!attachmentId) throw error;
        response = null;
      }
    }
    if (!response && attachmentId) {
      const encodedPath = buildUnitContactAuthorizationDocPath(application).split('/').map((segment) => encodeURIComponent(segment)).join('/');
      response = await rawGraphResponse('GET', `/sites/${siteId}/drives/${drive.id}/root:/${encodedPath}:/content`, undefined, headers);
    }
    if (!response) {
      const missing = new Error('Authorization document not found');
      missing.statusCode = 404;
      throw missing;
    }
    const payload = Buffer.from(await response.arrayBuffer());
    const contentType = cleanText(response.headers.get('content-type')) || cleanText(application.authorizationDocContentType) || 'application/octet-stream';
    await writeBinary(res, {
      status: 200,
      path: '/api/unit-contact/applications/authorization-doc/content',
      body: payload,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': buildContentDisposition(fileName, download)
      }
    }, origin);
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
      actorEmail: email,
      targetEmail: email,
      unitCode: '',
      recordId: email,
      payloadJson: JSON.stringify({
        lookupEmail: email,
        summary: summarizeLookupResults(applications)
      })
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

function createServer() {
  return http.createServer(async (req, res) => {
    const startedAt = Date.now();
    const requestId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString('hex');
    req.__ismsRequestId = requestId;
    res.setHeader('x-request-id', requestId);
    const origin = cleanText(req.headers.origin);
    const url = new URL(req.url, `http://${req.headers.host}`);
    res.once('finish', () => {
      if (!String(url.pathname || '').startsWith('/api/')) return;
      const durationMs = Date.now() - startedAt;
      console.log(`[http] requestId=${requestId} method=${req.method} path=${url.pathname} status=${res.statusCode} durationMs=${durationMs}`);
    });

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...buildCorsHeaders(origin),
        ...buildSecurityHeaders(url.pathname)
      });
      res.end();
      return;
    }

    try {
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
      if (await correctiveActionRouter.tryHandle(req, res, origin, url)) {
        return;
      }
      if (await auditTrailRouter.tryHandle(req, res, origin, url)) {
        return;
      }
      if (await unitGovernanceRouter.tryHandle(req, res, origin, url)) {
        return;
      }
      if (await checklistRouter.tryHandle(req, res, origin, url)) {
        return;
      }
      if (await trainingRouter.tryHandle(req, res, origin, url)) {
        return;
      }
      if (await reviewScopeRouter.tryHandle(req, res, origin, url)) {
        return;
      }
      if (await attachmentRouter.tryHandle(req, res, origin, url)) {
        return;
      }
      if (await systemUserRouter.tryHandle(req, res, origin, url)) {
        return;
      }
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
