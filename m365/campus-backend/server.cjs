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
    error.statusCode = response.status >= 500 ? 502 : 500;
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
    .map((entry) => entry && entry.fields ? {
      listItemId: cleanText(entry.id),
      application: mapGraphFieldsToApplication({
        ...entry.fields,
        Created: entry.createdDateTime,
        Modified: entry.lastModifiedDateTime
      })
    } : null)
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
  throw new Error('????????????????????');
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
      `您好，系統已收到您的單位管理人申請。`,
      `申請編號：${cleanText(application && application.id)}`,
      `申請單位：${cleanText(application && application.unitValue)}`,
      `申請人：${cleanText(application && application.applicantName)}`,
      `目前狀態：${cleanText(application && application.statusLabel) || cleanText(application && application.status)}`,
      `管理者審核通過後，系統會直接啟用帳號，並寄送登入資訊。`,
      `登入帳號會直接使用您申請時填寫的電子郵件。`,
      `後續請使用送件信箱回到系統查詢申請進度。`
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
      `申請信箱：${cleanText(application && application.applicantEmail)}`,
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
        : '請使用原送件信箱回到系統查詢最新處理進度。'
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
  const systemUserPayload = {
    username: loginUsername,
    password: nextPasswordSecret,
    name: cleanText(application && application.applicantName),
    email: cleanText(application && application.applicantEmail),
    role: USER_ROLES.UNIT_ADMIN,
    unit: cleanText(application && application.unitValue),
    units: cleanText(application && application.unitValue) ? [cleanText(application.unitValue)] : [],
    activeUnit: cleanText(application && application.unitValue),
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
  const applications = await listAllApplications();
  const limit = Math.max(1, Math.min(200, Number(filters && filters.limit) || 50));
  return applications
    .map((entry) => entry.application)
    .filter((application) => matchesListFilter(application, filters))
    .sort((left, right) => String(right.updatedAt || right.submittedAt).localeCompare(String(left.updatedAt || left.submittedAt)))
    .slice(0, limit);
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
  return {
    before: entry.application,
    after: mapGraphFieldsToApplication(fields)
  };
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
    await ensureNoDuplicateActiveApplication(payload);
    const created = await createApplication(payload);
    const notifications = await notifyUnitContactApplicationSubmitted(created);
    return writeJson(res, buildJsonResponse(201, {
      ok: true,
      application: mapApplicationForClient(created),
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
    return writeJson(res, buildErrorResponse(error, 'Failed to submit application.'), origin);
  }
}

async function handleAdminList(req, res, origin, url) {
  try {
    const authz = await requestAuthz.requireAuthenticatedUser(req);
    requestAuthz.requireAdmin(authz, '僅最高管理員可檢視申請清單');
    const items = await listApplicationsForAdmin({
      status: url.searchParams.get('status'),
      email: url.searchParams.get('email'),
      keyword: url.searchParams.get('keyword'),
      limit: url.searchParams.get('limit')
    });
    return writeJson(res, buildJsonResponse(200, {
      ok: true,
      items: items.map(mapApplicationForClient),
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
      res.writeHead(204, {
        ...buildCorsHeaders(origin),
        ...buildSecurityHeaders(url.pathname)
      });
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



