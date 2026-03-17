const path = require('path');
const {
  GRAPH_ROOT,
  acquireDelegatedGraphTokenFromCli,
  graphGet,
  graphPatch,
  loadBackendConfig,
  resolveSiteIdFromUrl
} = require('./_m365-a3-backend-utils.cjs');
const {
  attachDiagnostics,
  createArtifactRun,
  createResultEnvelope,
  finalizeResults,
  gotoHash,
  launchBrowser,
  runStep,
  writeJson
} = require('./_role-test-utils.cjs');

const FRONT_BASE = String(process.env.ACCOUNT_FLOW_FRONT_BASE || 'https://isms-campus-portal.pages.dev/').trim().replace(/\/$/, '');
const API_BASE = String(process.env.ACCOUNT_FLOW_API_BASE || 'http://127.0.0.1:8088').trim().replace(/\/$/, '');
const ADMIN_USERNAME = String(process.env.ACCOUNT_FLOW_ADMIN_USERNAME || 'admin').trim();
const ADMIN_PASSWORD = String(process.env.ACCOUNT_FLOW_ADMIN_PASSWORD || 'admin123').trim();
const OUT_DIR = createArtifactRun('unit-contact-account-to-fill-smoke').outDir;
const RESULT_PATH = path.join(OUT_DIR, 'unit-contact-account-to-fill-smoke.json');
const CURRENT_ROC_YEAR = String(new Date().getFullYear() - 1911);
const ROLE_ADMIN = '\u6700\u9ad8\u7ba1\u7406\u54e1';
const ROLE_VIEWER = '\u8de8\u55ae\u4f4d\u6aa2\u8996\u8005';
const ROLE_REPORTER = '\u586b\u5831\u4eba';
const ACTIVE_LABEL = '\u5df2\u555f\u7528';
const DRAFT_STATUS = '\u66ab\u5b58';
const UNIT_SEPARATOR = '\uFF0F';
const DEFAULT_TARGET_UNIT = '\u8a08\u7b97\u6a5f\u53ca\u8cc7\u8a0a\u7db2\u8def\u4e2d\u5fc3\uff0f\u8cc7\u8a0a\u7db2\u8def\u7d44';
const SAFE_TARGET_UNITS = [
  '\u7a3d\u6838\u5ba4',
  '\u8a08\u7b97\u6a5f\u53ca\u8cc7\u8a0a\u7db2\u8def\u4e2d\u5fc3\uff0f\u8cc7\u8a0a\u7db2\u8def\u7d44',
  '\u7e3d\u52d9\u8655\uff0f\u71df\u7e55\u7d44',
  '\u4eba\u4e8b\u5ba4\uff0f\u7d9c\u5408\u696d\u52d9\u7d44'
];

function nowStamp() {
  return Date.now();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(value) {
  return String(value || '').trim();
}

function isUsefulUnit(unit) {
  const text = cleanText(unit);
  return !!text && !/[?\uFFFD]/.test(text);
}

async function apiJson(method, pathName, body, headers) {
  const response = await fetch(API_BASE + pathName, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  if (!response.ok) {
    const message = json && (json.error || json.message)
      ? (json.error || json.message)
      : `HTTP ${response.status}`;
    const error = new Error(String(message || 'Request failed'));
    error.status = response.status;
    error.body = json || text;
    throw error;
  }
  return json;
}

async function loginAsUser(username, password) {
  const body = await apiJson('POST', '/api/auth/login', {
    action: 'auth.login',
    payload: { username, password }
  });
  const token = cleanText(body && body.session && body.session.token);
  if (!token) throw new Error(`Login did not return a session token for ${username}`);
  return { token, body };
}

async function loginAsAdmin() {
  return loginAsUser(ADMIN_USERNAME, ADMIN_PASSWORD);
}

function authHeaders(token, extraHeaders) {
  return {
    Authorization: `Bearer ${token}`,
    ...(extraHeaders || {})
  };
}

async function getSystemUsers(token) {
  const body = await apiJson('GET', '/api/system-users', null, authHeaders(token));
  return Array.isArray(body && body.items) ? body.items : [];
}

async function getTrainingForms(token) {
  const body = await apiJson('GET', '/api/training/forms', null, authHeaders(token));
  return Array.isArray(body && body.items) ? body.items : [];
}

async function getTrainingRosters(token) {
  const body = await apiJson('GET', '/api/training/rosters', null, authHeaders(token));
  return Array.isArray(body && body.items) ? body.items : [];
}

async function waitForTrainingRosters(token, predicate, options) {
  const timeoutMs = Number((options && options.timeoutMs) || 30000);
  const intervalMs = Number((options && options.intervalMs) || 1500);
  const deadline = Date.now() + timeoutMs;
  let lastItems = [];
  do {
    lastItems = await getTrainingRosters(token);
    if (predicate(lastItems)) return lastItems;
    await wait(intervalMs);
  } while (Date.now() < deadline);
  return lastItems;
}

function isSafeTargetUnit(unit) {
  return SAFE_TARGET_UNITS.includes(cleanText(unit));
}

async function chooseTargetUnit(token) {
  const forms = await getTrainingForms(token);
  const occupiedUnits = new Set(forms
    .filter((entry) => cleanText(entry && entry.trainingYear) === CURRENT_ROC_YEAR)
    .map((entry) => cleanText(entry && entry.unit))
    .filter(Boolean));
  const safeCandidates = SAFE_TARGET_UNITS.filter((unit) => !occupiedUnits.has(unit));
  const selected = safeCandidates[0] || SAFE_TARGET_UNITS[0] || DEFAULT_TARGET_UNIT;
  return {
    unit: selected,
    occupiedUnits: Array.from(occupiedUnits),
    candidates: SAFE_TARGET_UNITS.slice(),
    safeCandidates
  };
}

async function upsertSystemUser(token, payload) {
  return apiJson('POST', '/api/system-users/upsert', {
    action: 'system-user.upsert',
    payload
  }, authHeaders(token));
}

async function deleteSystemUser(token, username) {
  return apiJson('POST', `/api/system-users/${encodeURIComponent(username)}/delete`, {
    action: 'system-user.delete',
    payload: { username }
  }, authHeaders(token));
}

async function deleteTrainingForm(token, formId) {
  return apiJson('POST', `/api/training/forms/${encodeURIComponent(formId)}/delete`, {
    action: 'training.form.delete',
    payload: { id: formId }
  }, authHeaders(token));
}

async function deleteTrainingRoster(token, rosterId) {
  return apiJson('POST', `/api/training/rosters/${encodeURIComponent(rosterId)}/delete`, {
    action: 'training.roster.delete',
    payload: { id: rosterId }
  }, authHeaders(token));
}

async function lookupApplicationsByEmail(email) {
  const body = await apiJson('POST', '/api/unit-contact/status', {
    action: 'unit-contact.lookup',
    payload: { email }
  });
  return Array.isArray(body && body.applications) ? body.applications : [];
}

async function waitForApplicationStatus(email, applicationId, predicate, options) {
  const timeoutMs = Number((options && options.timeoutMs) || 30000);
  const intervalMs = Number((options && options.intervalMs) || 1500);
  const deadline = Date.now() + timeoutMs;
  let lastMatch = null;
  do {
    const applications = await lookupApplicationsByEmail(email);
    lastMatch = applications.find((entry) => cleanText(entry && entry.id) === cleanText(applicationId)) || null;
    if (lastMatch && predicate(lastMatch)) return lastMatch;
    await wait(intervalMs);
  } while (Date.now() < deadline);
  return lastMatch;
}

async function resolveUnitContactListContext() {
  const config = loadBackendConfig();
  const token = acquireDelegatedGraphTokenFromCli().accessToken;
  let siteId = '';
  try {
    const health = await apiJson('GET', '/api/unit-contact/health');
    siteId = cleanText(health && health.site && health.site.id);
  } catch (_) {
    siteId = '';
  }
  if (!siteId) {
    siteId = config.siteId || await resolveSiteIdFromUrl(token, config.sharePointSiteUrl);
  }
  if (!siteId) throw new Error('Missing siteId in backend configuration');
  const lists = await graphGet(token, `${GRAPH_ROOT}/sites/${siteId}/lists?$select=id,displayName`);
  const unitContactList = (lists.value || []).find((entry) => entry.displayName === 'UnitContactApplications');
  if (!unitContactList) throw new Error('UnitContactApplications list not found');
  const columns = await graphGet(token, `${GRAPH_ROOT}/sites/${siteId}/lists/${unitContactList.id}/columns?$select=name`);
  return {
    accessToken: token,
    siteId,
    listId: unitContactList.id,
    columnNames: new Set((columns.value || []).map((entry) => cleanText(entry && entry.name)).filter(Boolean))
  };
}

function filterFields(fields, columnNames) {
  return Object.entries(fields || {}).reduce((result, [key, value]) => {
    if (key === 'Title' || columnNames.has(key)) result[key] = value;
    return result;
  }, {});
}

async function findApplicationListItem(context, applicationId) {
  const body = await graphGet(context.accessToken, `${GRAPH_ROOT}/sites/${context.siteId}/lists/${context.listId}/items?$expand=fields&$top=200`);
  return (body.value || []).find((entry) => cleanText(entry && entry.fields && entry.fields.ApplicationId) === applicationId) || null;
}

async function patchApplicationToActive(context, applicationId, username) {
  const item = await findApplicationListItem(context, applicationId);
  if (!item) throw new Error(`Application ${applicationId} not found in SharePoint`);
  const nowIso = new Date().toISOString();
  const fields = filterFields({
    Status: 'active',
    StatusLabel: '\u5df2\u555f\u7528',
    StatusDetail: `\u5e33\u865f\u5df2\u555f\u7528\uff0c\u8acb\u4f7f\u7528 ${username} \u767b\u5165\u7cfb\u7d71\u3002`,
    ReviewedAt: nowIso,
    ReviewedBy: 'smoke-script',
    ReviewComment: 'smoke auto approved',
    ActivationSentAt: nowIso,
    ActivatedAt: nowIso,
    ProvisionedAt: nowIso,
    ProvisionedBy: 'smoke-script',
    ProvisioningNote: `Account ready: ${username}`,
    AppUsername: username,
    ExternalUserId: username
  }, context.columnNames);
  await graphPatch(context.accessToken, `${GRAPH_ROOT}/sites/${context.siteId}/lists/${context.listId}/items/${item.id}/fields`, fields);
  return item.id;
}

async function deleteApplicationListItem(context, itemId) {
  if (!itemId) return;
  const response = await fetch(`${GRAPH_ROOT}/sites/${context.siteId}/lists/${context.listId}/items/${itemId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${context.accessToken}`
    }
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete application list item ${itemId}: HTTP ${response.status}`);
  }
}

async function chooseUnitByLabel(page, baseId, unitLabel) {
  await page.evaluate(({ baseId, unitLabel }) => {
    const categorySelect = document.getElementById(`${baseId}-category`);
    const parentSelect = document.getElementById(`${baseId}-parent`);
    const childSelect = document.getElementById(`${baseId}-child`);
    if (!parentSelect) throw new Error(`Missing unit controls for ${baseId}`);

    const dispatch = (element) => {
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const optionsOf = (select) => Array.from(select.options).filter((entry) => String(entry.value || '').trim());
    const currentValue = () => {
      const childValue = childSelect && !childSelect.disabled ? String(childSelect.value || '').trim() : '';
      return childValue || String(parentSelect.value || '').trim();
    };

    const tryCurrent = () => currentValue() === unitLabel;
    const categoryOptions = categorySelect ? optionsOf(categorySelect) : [{ value: '' }];

    for (const categoryOption of categoryOptions) {
      if (categorySelect) {
        categorySelect.value = categoryOption.value;
        dispatch(categorySelect);
      }
      const parentOptions = optionsOf(parentSelect);
      for (const parentOption of parentOptions) {
        parentSelect.value = parentOption.value;
        dispatch(parentSelect);
        if (tryCurrent()) return;
        const childOptions = childSelect && !childSelect.disabled ? optionsOf(childSelect) : [];
        for (const childOption of childOptions) {
          childSelect.value = childOption.value;
          dispatch(childSelect);
          if (tryCurrent()) return;
        }
      }
    }

    throw new Error(`Unable to locate unit ${unitLabel}`);
  }, { baseId, unitLabel });
  await page.waitForTimeout(250);
}

async function loginViaPage(page, username, password) {
  await page.goto(FRONT_BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__APP_READY__ === true, { timeout: 45000 });
  await page.waitForSelector('[data-testid="login-form"]', { timeout: 15000 });
  await page.fill('[data-testid="login-user"]', username);
  await page.fill('[data-testid="login-pass"]', password);
  await page.locator('[data-testid="login-form"]').evaluate((form) => form.requestSubmit());
  await page.waitForFunction(() => !!window.sessionStorage.getItem('cats_auth'), { timeout: 20000 });
  await page.waitForFunction(() => !!document.querySelector('.btn-logout'), { timeout: 20000 });
  await page.waitForFunction(() => window.__REMOTE_BOOTSTRAP_STATE__ !== 'pending', { timeout: 30000 });
  const auth = await page.evaluate(() => {
    try {
      return JSON.parse(window.sessionStorage.getItem('cats_auth') || 'null');
    } catch (_) {
      return null;
    }
  });
  return {
    hash: await page.evaluate(() => window.location.hash || ''),
    auth
  };
}

(async () => {
  const results = createResultEnvelope({
    steps: [],
    frontBase: FRONT_BASE,
    apiBase: API_BASE
  });
  const stamp = nowStamp();
  const testUsername = `ucae2e${stamp}`;
  const testPassword = `T${stamp}#Aa1`;
  const testEmail = `ucae2e-${stamp}@ntu.edu.tw`;
  const applicantName = `\u6e2c\u8a66\u7533\u8acb\u4eba${stamp}`;
  const manualPersonName = `\u6e2c\u8a66\u53d7\u8a13\u4eba\u54e1${stamp}`;
  const jobTitle = '\u5de5\u7a0b\u5e2b';
  const identity = '\u8077\u54e1';
  let adminToken = '';
  let browser = null;
  let page = null;
  let createdApplicationId = '';
  let createdApplicationListItemId = '';
  let createdTrainingFormId = '';
  let createdRosterIds = [];
  let targetUnit = '';
  let graphContext = null;

  try {
    await runStep(results, 'ACCOUNT-FLOW-1', 'admin', 'resolve test unit without current-year training form', async () => {
      const login = await loginAsAdmin();
      adminToken = login.token;
      const selected = await chooseTargetUnit(adminToken);
      targetUnit = selected.unit;
      if (!targetUnit) throw new Error('No target unit available for smoke');
      return selected;
    });

    graphContext = await resolveUnitContactListContext();

    browser = await launchBrowser();
    page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
    attachDiagnostics(page, results);

    await runStep(results, 'ACCOUNT-FLOW-2', 'public', 'submit public unit-contact application through Pages entry', async () => {
      await page.goto(FRONT_BASE, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__APP_READY__ === true, { timeout: 45000 });
      await gotoHash(page, 'apply-unit-contact', { handleUnsaved: false });
      await page.waitForSelector('[data-testid="unit-contact-apply-form"]', { timeout: 20000 });
      await chooseUnitByLabel(page, 'uca-unit', targetUnit);
      await page.fill('[data-testid="unit-contact-name"]', applicantName);
      await page.fill('[data-testid="unit-contact-extension"]', '61234');
      await page.fill('[data-testid="unit-contact-email"]', testEmail);
      await page.fill('[data-testid="unit-contact-note"]', 'account-to-fill smoke');
      await page.click('[data-testid="unit-contact-submit"]');
      await page.waitForURL(/#apply-unit-contact-success\//, { timeout: 20000 });
      if (await page.locator('.unit-contact-summary-grid strong').count()) {
        createdApplicationId = cleanText(await page.locator('.unit-contact-summary-grid strong').first().textContent());
      } else {
        const lookup = await lookupApplicationsByEmail(testEmail);
        createdApplicationId = cleanText(lookup[0] && lookup[0].id);
      }
      if (!createdApplicationId.startsWith('UCA-')) throw new Error(`Unexpected application id: ${createdApplicationId}`);
      return {
        applicationId: createdApplicationId,
        unit: targetUnit
      };
    });

    await runStep(results, 'ACCOUNT-FLOW-3', 'public', 'lookup submitted application and confirm pending review state', async () => {
      await gotoHash(page, 'apply-unit-contact-status', { handleUnsaved: false });
      await page.waitForSelector('#uca-status-email', { timeout: 15000 });
      await page.fill('#uca-status-email', testEmail);
      await page.locator('#unit-contact-status-form').evaluate((form) => form.requestSubmit());
      await page.waitForSelector('.unit-contact-status-card', { timeout: 20000 });
      const cardText = cleanText(await page.locator('.unit-contact-status-card').first().textContent());
      if (!cardText.includes(createdApplicationId)) throw new Error('Pending application lookup did not include application id');
      return { cardText: cardText.slice(0, 240) };
    });

    await runStep(results, 'ACCOUNT-FLOW-4', 'admin', 'provision reporter account for the approved application', async () => {
      await upsertSystemUser(adminToken, {
        username: testUsername,
        password: testPassword,
        forcePasswordChange: false,
        name: applicantName,
        email: testEmail,
        role: ROLE_REPORTER,
        unit: targetUnit,
        units: [targetUnit],
        activeUnit: targetUnit,
        actorName: '\u7cfb\u7d71\u7ba1\u7406\u54e1',
        actorEmail: 'admin@company.com'
      });
      createdApplicationListItemId = await patchApplicationToActive(graphContext, createdApplicationId, testUsername);
      const login = await loginAsUser(testUsername, testPassword);
      const application = await waitForApplicationStatus(testEmail, createdApplicationId, (entry) => {
        return cleanText(entry && entry.status) === 'active' && cleanText(entry && entry.statusLabel) === ACTIVE_LABEL;
      });
      if (!application) throw new Error('Updated application not found after provisioning');
      if (application.status !== 'active') throw new Error(`Application status not updated: ${application.status}`);
      if (cleanText(application.statusLabel) !== ACTIVE_LABEL) throw new Error(`Unexpected status label: ${application.statusLabel}`);
      if (login.body && login.body.mustChangePassword === true) throw new Error('Provisioned reporter still requires password change');
      return {
        username: testUsername,
        status: application.status,
        statusLabel: application.statusLabel
      };
    });

    await runStep(results, 'ACCOUNT-FLOW-5', 'public', 'lookup approved application and confirm active label is visible', async () => {
      await gotoHash(page, 'apply-unit-contact-status', { handleUnsaved: false });
      await page.waitForSelector('#uca-status-email', { timeout: 15000 });
      await page.fill('#uca-status-email', testEmail);
      let cardText = '';
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await page.locator('#unit-contact-status-form').evaluate((form) => form.requestSubmit());
        await page.waitForSelector('.unit-contact-status-card', { timeout: 20000 });
        cardText = cleanText(await page.locator('.unit-contact-status-card').first().textContent());
        if (cardText.includes(ACTIVE_LABEL)) break;
        await page.waitForTimeout(1200);
      }
      if (!cardText.includes(ACTIVE_LABEL)) throw new Error('Application status card did not show active label');
      return { cardText: cardText.slice(0, 280) };
    });

    await runStep(results, 'ACCOUNT-FLOW-6', 'reporter', 'login with the provisioned account through Pages', async () => {
      const loginState = await loginViaPage(page, testUsername, testPassword);
      if (!loginState.auth || cleanText(loginState.auth.username) !== testUsername) {
        throw new Error('Session auth did not switch to the provisioned reporter');
      }
      if (loginState.auth.mustChangePassword === true) {
        throw new Error('Reporter session still marked as mustChangePassword');
      }
      if (!isSafeTargetUnit(loginState.auth.activeUnit) || cleanText(loginState.auth.activeUnit) !== targetUnit) {
        throw new Error(`Reporter active unit mismatch: ${loginState.auth.activeUnit}`);
      }
      return {
        hash: loginState.hash,
        activeUnit: cleanText(loginState.auth.activeUnit),
        username: cleanText(loginState.auth.username)
      };
    });

    await runStep(results, 'ACCOUNT-FLOW-7', 'reporter', 'open training fill page and save a draft', async () => {
      await gotoHash(page, 'training-fill', { handleUnsaved: false });
      await page.waitForSelector('[data-testid="training-form"]', { timeout: 20000 });
      await page.fill('#tr-phone', '02-3366-61234');
      await page.fill('#tr-email', testEmail);
      await page.fill('#tr-new-name', manualPersonName);
      await page.fill('#tr-new-unit-name', cleanText(targetUnit.split(UNIT_SEPARATOR).pop()) || targetUnit);
      await page.fill('#tr-new-identity', identity);
      await page.fill('#tr-new-job-title', jobTitle);
      const previousRowCount = await page.locator('#training-rows-body tr').count();
      await page.click('#training-add-person');
      await page.waitForFunction(({ name, previousRowCount }) => {
        const rows = Array.from(document.querySelectorAll('#training-rows-body tr'));
        const nameFound = rows.some((row) => String(row.textContent || '').includes(name));
        const inputCleared = !String(document.querySelector('#tr-new-name')?.value || '').trim();
        return nameFound || rows.length > previousRowCount || inputCleared;
      }, { name: manualPersonName, previousRowCount }, { timeout: 20000 });
      await page.click('[data-testid="training-save-draft"]');
      await page.waitForFunction(() => /#training-fill\//.test(window.location.hash), { timeout: 20000 });
      createdTrainingFormId = await page.evaluate(() => decodeURIComponent((window.location.hash || '').split('/')[1] || ''));
      if (!createdTrainingFormId.startsWith('TRN-')) throw new Error(`Unexpected training form id: ${createdTrainingFormId}`);
      const statusText = cleanText(await page.textContent('#training-draft-status'));
      if (!statusText || statusText.includes('\u5c1a\u672a\u5efa\u7acb\u8349\u7a3f')) {
        throw new Error('Draft status was not updated after save');
      }
      return {
        formId: createdTrainingFormId,
        draftStatus: statusText
      };
    });

    await runStep(results, 'ACCOUNT-FLOW-8', 'admin', 'verify saved training draft through backend API', async () => {
      const forms = await getTrainingForms(adminToken);
      const form = forms.find((entry) => cleanText(entry.id) === createdTrainingFormId);
      if (!form) throw new Error('Created training draft not found in backend');
      if (cleanText(form.status) !== DRAFT_STATUS) throw new Error(`Unexpected training form status: ${form.status}`);
      const rosters = await waitForTrainingRosters(adminToken, (items) => {
        return items.some((entry) => cleanText(entry.name) === manualPersonName && cleanText(entry.unit) === targetUnit);
      });
      createdRosterIds = rosters
        .filter((entry) => cleanText(entry.name) === manualPersonName && cleanText(entry.unit) === targetUnit)
        .map((entry) => cleanText(entry.id))
        .filter(Boolean);
      if (!createdRosterIds.length) throw new Error('Created manual roster row was not found in backend');
      return {
        formId: form.id,
        rosterCount: createdRosterIds.length
      };
    });
  } finally {
    if (adminToken) {
      if (createdTrainingFormId) {
        try {
          await deleteTrainingForm(adminToken, createdTrainingFormId);
        } catch (_) {}
      }
      for (const rosterId of createdRosterIds) {
        try {
          await deleteTrainingRoster(adminToken, rosterId);
        } catch (_) {}
      }
      try {
        await deleteSystemUser(adminToken, testUsername);
      } catch (_) {}
    }
    if (graphContext && createdApplicationListItemId) {
      try {
        await deleteApplicationListItem(graphContext, createdApplicationListItemId);
      } catch (_) {}
    }
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    writeJson(RESULT_PATH, finalizeResults(results));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
