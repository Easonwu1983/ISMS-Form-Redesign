const fs = require('fs');
const path = require('path');
const {
  GRAPH_ROOT,
  acquireDelegatedGraphTokenFromCli,
  graphGet,
  loadBackendConfig,
  resolveSiteIdFromUrl
} = require('./_m365-a3-backend-utils.cjs');

const BASE = String(process.env.UNIT_CONTACT_ADMIN_REVIEW_BASE || 'http://127.0.0.1:8088').trim().replace(/\/$/, '');
const ADMIN_USERNAME = String(process.env.UNIT_CONTACT_ADMIN_REVIEW_USERNAME || 'admin').trim();
const ADMIN_PASSWORD = String(process.env.UNIT_CONTACT_ADMIN_REVIEW_PASSWORD || 'admin123').trim();
const ROOT = process.cwd();
const LOG_DIR = path.join(ROOT, 'logs');
const RESULT_PATH = path.join(LOG_DIR, 'unit-contact-admin-review-smoke.json');
const UNIT_DATA_PATH = path.join(ROOT, 'units-data.json');

const CANDIDATE_UNITS = [
  '稽核室',
  '人事室／綜合業務組',
  '計算機及資訊網路中心／資訊網路組'
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanText(value) {
  return String(value || '').trim();
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

async function requestText(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  return { response, text };
}

async function requestJson(url, options) {
  const { response, text } = await requestText(url, options);
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  return { response, text, json };
}

async function apiJson(method, pathName, body, headers) {
  const { response, json, text } = await requestJson(`${BASE}${pathName}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) {
    const message = json && (json.error || json.message)
      ? String(json.error || json.message)
      : `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.body = json || text;
    throw error;
  }
  return json;
}

async function loginAsAdmin() {
  const body = await apiJson('POST', '/api/auth/login', {
    action: 'auth.login',
    payload: {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD
    }
  });
  const token = cleanText(body && body.session && body.session.token);
  if (!token) throw new Error('Admin login did not return a session token.');
  return token;
}

function authHeaders(token, extraHeaders) {
  return {
    Authorization: `Bearer ${token}`,
    ...(extraHeaders || {})
  };
}

function loadUnitMeta() {
  const payload = JSON.parse(fs.readFileSync(UNIT_DATA_PATH, 'utf8'));
  const meta = payload && payload.unitMetaByValue && typeof payload.unitMetaByValue === 'object'
    ? payload.unitMetaByValue
    : {};
  for (const unitValue of CANDIDATE_UNITS) {
    if (meta[unitValue]) return meta[unitValue];
  }
  throw new Error(`Could not find a stable unit candidate in units-data.json: ${CANDIDATE_UNITS.join(', ')}`);
}

function buildApplyPayload(meta, stamp) {
  return {
    applicantName: `Admin Review 測試${stamp}`,
    applicantEmail: `unit-contact-admin-review-${stamp}@ntu.edu.tw`,
    extensionNumber: `6${String(stamp).slice(-4)}`,
    unitCategory: cleanText(meta && meta.topName),
    primaryUnit: cleanText(meta && meta.topName),
    secondaryUnit: cleanText(meta && meta.isTop ? '' : meta.childName),
    unitValue: cleanText(meta && meta.value),
    unitCode: cleanText(meta && meta.normalizedCode),
    contactType: 'primary',
    note: 'unit-contact admin review smoke'
  };
}

async function lookupApplicationByEmail(email) {
  const body = await apiJson('POST', '/api/unit-contact/status', {
    action: 'unit-contact.lookup',
    payload: { email }
  });
  return Array.isArray(body && body.applications) ? body.applications : [];
}

async function resolveUnitContactListContext() {
  const config = loadBackendConfig();
  const accessToken = acquireDelegatedGraphTokenFromCli().accessToken;
  let siteId = '';
  try {
    const health = await apiJson('GET', '/api/unit-contact/health');
    siteId = cleanText(health && health.site && health.site.id);
  } catch (_) {
    siteId = '';
  }
  if (!siteId) {
    siteId = config.siteId || await resolveSiteIdFromUrl(accessToken, config.sharePointSiteUrl);
  }
  if (!siteId) throw new Error('Unable to resolve SharePoint site id for cleanup.');

  const lists = await graphGet(accessToken, `${GRAPH_ROOT}/sites/${siteId}/lists?$select=id,displayName`);
  const applications = (lists.value || []).find((entry) => entry.displayName === 'UnitContactApplications');
  if (!applications) throw new Error('UnitContactApplications list not found.');
  return {
    accessToken,
    siteId,
    listId: applications.id
  };
}

async function deleteApplicationListItem(context, applicationId) {
  if (!applicationId) return;
  const items = await graphGet(context.accessToken, `${GRAPH_ROOT}/sites/${context.siteId}/lists/${context.listId}/items?$expand=fields&$top=200`);
  const match = (items.value || []).find((entry) => cleanText(entry && entry.fields && entry.fields.ApplicationId) === cleanText(applicationId));
  if (!match) return;
  const response = await fetch(`${GRAPH_ROOT}/sites/${context.siteId}/lists/${context.listId}/items/${match.id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${context.accessToken}`
    }
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete application ${applicationId}: HTTP ${response.status}`);
  }
}

async function deleteSystemUser(token, username) {
  if (!cleanText(username)) return;
  try {
    await apiJson('POST', `/api/system-users/${encodeURIComponent(username)}/delete`, {
      action: 'system-user.delete',
      payload: { username }
    }, authHeaders(token));
  } catch (error) {
    if (error && error.status === 404) return;
    throw error;
  }
}

async function run() {
  const report = {
    startedAt: new Date().toISOString(),
    base: BASE,
    steps: []
  };
  const stamp = Date.now();
  const meta = loadUnitMeta();
  const payload = buildApplyPayload(meta, stamp);
  const listContext = await resolveUnitContactListContext();
  let sessionToken = '';
  let applicationId = '';
  let generatedUsername = '';

  async function step(name, fn) {
    try {
      const detail = await fn();
      report.steps.push({ name, ok: true, detail });
      return detail;
    } catch (error) {
      const message = String(error && error.message || error || 'step failed');
      report.steps.push({ name, ok: false, detail: message });
      throw error;
    }
  }

  try {
    await step('auth:login', async () => {
      sessionToken = await loginAsAdmin();
      return 'status=200';
    });

    await step('apply:create', async () => {
      const body = await apiJson('POST', '/api/unit-contact/apply', {
        action: 'unit-contact.apply',
        payload
      });
      applicationId = cleanText(body && body.application && body.application.id);
      if (!applicationId) throw new Error('missing application id');
      return applicationId;
    });

    await step('review:list', async () => {
      const body = await apiJson('GET', '/api/unit-contact/applications?status=pending_review&limit=20', null, authHeaders(sessionToken));
      const items = Array.isArray(body && body.items) ? body.items : [];
      const match = items.find((entry) => cleanText(entry && entry.id) === applicationId);
      if (!match) throw new Error('application not found in admin list');
      if (cleanText(match.status) !== 'pending_review') throw new Error(`unexpected status ${match.status}`);
      return cleanText(match.status);
    });

    await step('review:approve', async () => {
      const body = await apiJson('POST', '/api/unit-contact/review', {
        action: 'unit-contact.review',
        payload: {
          id: applicationId,
          status: 'approved',
          reviewComment: 'admin review smoke approved'
        }
      }, authHeaders(sessionToken));
      const item = body && body.item;
      generatedUsername = cleanText(item && item.externalUserId);
      if (cleanText(item && item.status) !== 'active') throw new Error('application did not become active after approval');
      if (generatedUsername !== cleanText(payload.applicantEmail)) throw new Error(`unexpected login username ${generatedUsername}`);
      if (!(body && body.delivery && body.delivery.sent)) throw new Error('approval mail delivery did not succeed');
      return { status: cleanText(item && item.status), generatedUsername };
    });

    await step('system-users:created', async () => {
      const body = await apiJson('GET', '/api/system-users', null, authHeaders(sessionToken));
      const items = Array.isArray(body && body.items) ? body.items : [];
      const match = items.find((entry) => cleanText(entry && entry.username) === generatedUsername);
      if (!match) throw new Error('generated system user not found');
      if (cleanText(match.role) !== '單位管理員') throw new Error(`unexpected role ${match.role}`);
      return {
        username: generatedUsername,
        role: cleanText(match.role),
        unit: cleanText(match.unit)
      };
    });

    await step('lookup:active', async () => {
      const applications = await lookupApplicationByEmail(payload.applicantEmail);
      const match = applications.find((entry) => cleanText(entry && entry.id) === applicationId);
      if (!match) throw new Error('lookup result missing application');
      if (cleanText(match.status) !== 'active') throw new Error(`unexpected lookup status ${match.status}`);
      return cleanText(match.status);
    });

    report.ok = true;
  } catch (error) {
    report.ok = false;
    throw error;
  } finally {
    try {
      if (generatedUsername && sessionToken) {
        await deleteSystemUser(sessionToken, generatedUsername);
      }
    } catch (error) {
      report.steps.push({ name: 'cleanup:system-user', ok: false, detail: String(error && error.message || error) });
    }
    try {
      if (applicationId) {
        await deleteApplicationListItem(listContext, applicationId);
      }
    } catch (error) {
      report.steps.push({ name: 'cleanup:application', ok: false, detail: String(error && error.message || error) });
    }
    report.finishedAt = new Date().toISOString();
    writeJson(RESULT_PATH, report);
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
