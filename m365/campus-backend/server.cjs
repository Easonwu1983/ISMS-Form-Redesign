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
const { createTrainingRouter } = require('./training-backend.cjs');
const {
  GRAPH_ROOT,
  acquireDelegatedGraphTokenFromCli,
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
  actor: null,
  token: null,
  tokenExp: 0
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
    'Access-Control-Allow-Headers': 'Content-Type, X-ISMS-Contract-Version',
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

async function getDelegatedToken() {
  if (state.token && state.tokenExp > Date.now() + 60 * 1000) {
    return { accessToken: state.token, decoded: state.actor };
  }
  const token = acquireDelegatedGraphTokenFromCli();
  const decoded = decodeJwt(token.accessToken);
  state.token = token.accessToken;
  state.tokenExp = Number(decoded.exp || 0) * 1000;
  state.actor = decoded;
  return { accessToken: token.accessToken, decoded };
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
  throw error;
}

async function createAuditRow(input) {
  const siteId = await resolveSiteId();
  const lists = await resolveLists();
  await graphRequest('POST', `/sites/${siteId}/lists/${lists.audit.id}/items`, {
    fields: {
      Title: cleanText(input.recordId || input.eventType || 'audit'),
      EventType: cleanText(input.eventType),
      ActorEmail: cleanText(input.actorEmail),
      TargetEmail: cleanText(input.targetEmail),
      UnitCode: cleanText(input.unitCode),
      RecordId: cleanText(input.recordId),
      OccurredAt: cleanText(input.occurredAt) || new Date().toISOString(),
      PayloadJson: cleanText(input.payloadJson)
    }
  });
}

async function createApplication(payload) {
  const siteId = await resolveSiteId();
  const lists = await resolveLists();
  const nextSequence = await getNextSequence(new Date().getFullYear());
  const application = createApplicationRecord(payload, nextSequence);
  application.source = 'a3-campus-backend';
  application.backendMode = 'campus-sharepoint-cli';

  const created = await graphRequest('POST', `/sites/${siteId}/lists/${lists.applications.id}/items`, {
    fields: mapApplicationToGraphFields(application)
  });
  const mapped = created && created.fields ? mapGraphFieldsToApplication(created.fields) : application;

  await createAuditRow({
    eventType: 'unit_contact.application_submitted',
    actorEmail: mapped.applicantEmail,
    targetEmail: mapped.applicantEmail,
    unitCode: mapped.unitCode,
    recordId: mapped.id,
    payloadJson: JSON.stringify({
      source: mapped.source,
      backendMode: mapped.backendMode
    })
  });

  return mapped;
}

async function getHealth() {
  const siteId = await resolveSiteId();
  const lists = await resolveLists();
  const { decoded } = await getDelegatedToken();
  return {
    ok: true,
    contractVersion: CONTRACT_VERSION,
    repository: 'sharepoint-delegated-cli',
    actor: {
      appId: cleanText(decoded.appid),
      upn: cleanText(decoded.upn),
      scopes: cleanText(decoded.scp)
    },
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

const checklistRouter = createChecklistRouter({
  parseJsonBody,
  writeJson,
  graphRequest,
  resolveSiteId,
  getDelegatedToken
});

const correctiveActionRouter = createCorrectiveActionRouter({
  parseJsonBody,
  writeJson,
  graphRequest,
  resolveSiteId,
  getDelegatedToken
});

const trainingRouter = createTrainingRouter({
  parseJsonBody,
  writeJson,
  graphRequest,
  resolveSiteId,
  getDelegatedToken
});

async function handleApply(req, res, origin) {
  try {
    const envelope = await parseJsonBody(req);
    validateActionEnvelope(envelope, ACTIONS.APPLY);
    const payload = normalizeApplyPayload(envelope.payload);
    validateApplyPayload(payload);
    await ensureNoDuplicateActiveApplication(payload);
    const created = await createApplication(payload);
    return writeJson(res, buildJsonResponse(201, {
      ok: true,
      application: mapApplicationForClient(created),
      contractVersion: CONTRACT_VERSION
    }), origin);
  } catch (error) {
    return writeJson(res, buildErrorResponse(error, 'Failed to submit application.'), origin);
  }
}

async function handleLookup(req, res, origin, url) {
  try {
    let email = '';
    if (String(req.method || 'GET').toUpperCase() === 'GET') {
      email = normalizeLookupEmail(url.searchParams.get('email'));
    } else {
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ACTIONS.LOOKUP);
      email = normalizeLookupEmail(envelope && envelope.payload && envelope.payload.email);
    }
    const applications = await listApplicationsByEmail(email);
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
      if (await checklistRouter.tryHandle(req, res, origin, url)) {
        return;
      }
      if (await trainingRouter.tryHandle(req, res, origin, url)) {
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
