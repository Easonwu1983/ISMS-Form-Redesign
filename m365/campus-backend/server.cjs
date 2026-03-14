const http = require('http');
const { URL } = require('url');

const {
  ACTIONS,
  ACTIVE_DUPLICATE_STATUSES,
  CONTRACT_VERSION,
  buildErrorResponse,
  buildJsonResponse,
  createApplicationRecord,
  mapApplicationForClient,
  mapApplicationToGraphFields,
  mapGraphFieldsToApplication,
  normalizeApplyPayload,
  normalizeLookupEmail,
  validateActionEnvelope,
  validateApplyPayload
} = require('../azure-function/unit-contact-api/src/shared/contract');
const { createChecklistRouter } = require('./checklist-backend.cjs');
const { createCorrectiveActionRouter } = require('./corrective-action-backend.cjs');
const { createAuditTrailRouter } = require('./audit-trail-backend.cjs');
const { createReviewScopeRouter } = require('./review-scope-backend.cjs');
const { createAttachmentRouter } = require('./attachment-backend.cjs');
const { createSystemUserRouter } = require('./system-user-backend.cjs');
const { createTrainingRouter } = require('./training-backend.cjs');
const { createRequestAuthz } = require('./request-authz.cjs');
const {
  buildFieldChanges
} = require('./audit-diff.cjs');
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
  listColumnsMap: new Map(),
  actor: null,
  token: null,
  tokenExp: 0,
  tokenMode: ''
};

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

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function decodeJwt(accessToken) {
  return JSON.parse(Buffer.from(String(accessToken || '').split('.')[1], 'base64url').toString('utf8'));
}

function buildCorsHeaders(origin) {
  const allowedOrigins = getAllowedOrigins();
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-ISMS-Contract-Version, X-ISMS-Active-Unit',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

async function writeJson(res, response, origin) {
  const payload = JSON.stringify(response.jsonBody || {});
  const headers = {
    ...(response.headers || {}),
    ...buildCorsHeaders(origin),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  };
  res.writeHead(response.status || 200, headers);
  res.end(payload);
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
    error.statusCode = response.status >= 500 ? 502 : 500;
    throw error;
  }
  return parsed;
}

async function resolveLists() {
  if (state.lists) return state.lists;
  const siteId = await resolveSiteId();
  const applicationsName = getEnv('UNIT_CONTACT_APPLICATIONS_LIST', 'UnitContactApplications');
  const unitAdminsName = getEnv('UNIT_CONTACT_UNITADMINS_LIST', 'UnitAdmins');
  const auditName = getEnv('UNIT_CONTACT_AUDIT_LIST', 'OpsAudit');
  const body = await graphRequest('GET', `/sites/${siteId}/lists?$select=id,displayName,webUrl`);
  const listMap = new Map((Array.isArray(body && body.value) ? body.value : []).map((entry) => [cleanText(entry.displayName), entry]));

  const applications = listMap.get(applicationsName);
  const unitAdmins = listMap.get(unitAdminsName);
  const audit = listMap.get(auditName);
  if (!applications || !unitAdmins || !audit) {
    throw new Error('Required SharePoint lists are missing. Run provisioning first.');
  }

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

async function listAllApplications() {
  const siteId = await resolveSiteId();
  const lists = await resolveLists();
  const items = [];
  let nextUrl = `${GRAPH_ROOT}/sites/${siteId}/lists/${lists.applications.id}/items?$expand=fields&$top=200`;

  while (nextUrl) {
    const body = await graphRequest('GET', nextUrl);
    items.push(...(Array.isArray(body && body.value) ? body.value : []));
    nextUrl = cleanText(body && body['@odata.nextLink']);
  }

  return items
    .map((entry) => entry && entry.fields ? mapGraphFieldsToApplication(entry.fields) : null)
    .filter(Boolean);
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
  return applications.reduce((maxValue, entry) => Math.max(maxValue, parseSequenceFromId(entry.id, year)), 0) + 1;
}

async function listApplicationsByEmail(email) {
  const applications = await listAllApplications();
  return applications
    .filter((entry) => entry.applicantEmail === email)
    .sort((left, right) => String(right.submittedAt).localeCompare(String(left.submittedAt)));
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
  } catch (_) { }
}

function buildApplicationSnapshot(application) {
  if (!application) return null;
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
    contactType: cleanText(application.contactType),
    status: cleanText(application.status),
    reviewedBy: cleanText(application.reviewedBy),
    reviewedAt: cleanText(application.reviewedAt),
    activatedAt: cleanText(application.activatedAt)
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
    'contactType',
    'note',
    'status',
    'reviewedBy',
    'reviewedAt',
    'reviewComment',
    'activationSentAt',
    'activatedAt',
    'externalUserId'
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

async function getHealth() {
  const siteId = await resolveSiteId();
  const lists = await resolveLists();
  const { decoded, mode } = await getDelegatedToken();
  return {
    ok: true,
    contractVersion: CONTRACT_VERSION,
    repository: mode === 'app-only' ? 'sharepoint-app-only' : 'sharepoint-delegated-cli',
    actor: summarizeTokenActor(decoded, mode),
    site: {
      id: siteId,
      url: state.siteUrl
    },
    lists: {
      applications: lists.applications,
      unitAdmins: lists.unitAdmins,
      audit: lists.audit
    }
  };
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
  requestAuthz
});

const auditTrailRouter = createAuditTrailRouter({
  writeJson,
  graphRequest,
  resolveSiteId,
  getDelegatedToken,
  requestAuthz
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
  requestAuthz
});

async function handleApply(req, res, origin) {
  let payload = null;
  try {
    const envelope = await parseJsonBody(req);
    validateActionEnvelope(envelope, ACTIONS.APPLY);
    payload = normalizeApplyPayload(envelope.payload);
    validateApplyPayload(payload);
    await ensureNoDuplicateActiveApplication(payload);
    const created = await createApplication(payload);
    return writeJson(res, buildJsonResponse(201, {
      ok: true,
      application: mapApplicationForClient(created),
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
    return writeJson(res, buildErrorResponse(error, 'Failed to submit application.'), origin);
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
      applications: applications.map(mapApplicationForClient),
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
    const origin = cleanText(req.headers.origin);
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, buildCorsHeaders(origin));
      res.end();
      return;
    }

    try {
      if (url.pathname === '/api/unit-contact/health') {
        await handleHealth(req, res, origin);
        return;
      }
      if (url.pathname === '/api/unit-contact/apply' && req.method === 'POST') {
        await handleApply(req, res, origin);
        return;
      }
      if (url.pathname === '/api/unit-contact/status' && (req.method === 'POST' || req.method === 'GET')) {
        await handleLookup(req, res, origin, url);
        return;
      }
      if (await correctiveActionRouter.tryHandle(req, res, origin, url)) {
        return;
      }
      if (await auditTrailRouter.tryHandle(req, res, origin, url)) {
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


