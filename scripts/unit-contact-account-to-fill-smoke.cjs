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

const FRONT_BASE = String(process.env.ACCOUNT_FLOW_FRONT_BASE || 'https://isms-campus-portal.pages.dev/').trim();
const API_BASE = String(process.env.ACCOUNT_FLOW_API_BASE || 'http://127.0.0.1:8088').trim().replace(/\/$/, '');
const ADMIN_USERNAME = String(process.env.ACCOUNT_FLOW_ADMIN_USERNAME || 'admin').trim();
const ADMIN_PASSWORD = String(process.env.ACCOUNT_FLOW_ADMIN_PASSWORD || 'admin123').trim();
const OUT_DIR = createArtifactRun('unit-contact-account-to-fill-smoke').outDir;
const RESULT_PATH = path.join(OUT_DIR, 'unit-contact-account-to-fill-smoke.json');
const CURRENT_ROC_YEAR = String(new Date().getFullYear() - 1911);

function nowStamp() {
  return Date.now();
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

async function loginAsAdmin() {
  const body = await apiJson('POST', '/api/auth/login', {
    action: 'auth.login',
    payload: {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD
    }
  });
  const token = String(body && body.session && body.session.token || '').trim();
  if (!token) throw new Error('Admin login did not return a session token');
  return {
    token,
    body
  };
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
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

async function chooseTargetUnit(token) {
  const users = await getSystemUsers(token);
  const forms = await getTrainingForms(token);
  const occupiedUnits = new Set(forms
    .filter((entry) => String(entry && entry.trainingYear || '').trim() === CURRENT_ROC_YEAR)
    .map((entry) => String(entry && entry.unit || '').trim())
    .filter(Boolean));
  const candidates = Array.from(new Set(users
    .filter((entry) => entry && entry.role !== '最高管理員' && entry.role !== '跨單位檢視者')
    .map((entry) => String(entry.unit || '').trim())
    .filter(Boolean)));
  const selected = candidates.find((unit) => !occupiedUnits.has(unit)) || candidates[0] || '總務處／營繕組';
  return {
    unit: selected,
    occupiedUnits: Array.from(occupiedUnits),
    candidates
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
    payload: {
      username
    }
  }, authHeaders(token));
}

async function deleteTrainingForm(token, formId) {
  return apiJson('POST', `/api/training/forms/${encodeURIComponent(formId)}/delete`, {
    action: 'training.form.delete',
    payload: {
      id: formId
    }
  }, authHeaders(token));
}

async function deleteTrainingRoster(token, rosterId) {
  return apiJson('POST', `/api/training/rosters/${encodeURIComponent(rosterId)}/delete`, {
    action: 'training.roster.delete',
    payload: {
      id: rosterId
    }
  }, authHeaders(token));
}

async function lookupApplicationsByEmail(email) {
  const body = await apiJson('POST', '/api/unit-contact/status', {
    action: 'unit-contact.lookup',
    payload: {
      email
    }
  });
  return Array.isArray(body && body.applications) ? body.applications : [];
}

async function resolveUnitContactListContext() {
  const config = loadBackendConfig();
  const token = acquireDelegatedGraphTokenFromCli().accessToken;
  let siteId = '';
  try {
    const health = await apiJson('GET', '/api/unit-contact/health');
    siteId = String(health && health.site && health.site.id || '').trim();
  } catch (_) { }
  if (!siteId) {
    siteId = config.siteId || await resolveSiteIdFromUrl(token, config.sharePointSiteUrl);
  }
  if (!siteId) throw new Error('Missing siteId in .local-secrets/m365-a3-backend.json');
  const lists = await graphGet(token, `${GRAPH_ROOT}/sites/${siteId}/lists?$select=id,displayName`);
  const unitContactList = (lists.value || []).find((entry) => entry.displayName === 'UnitContactApplications');
  if (!unitContactList) throw new Error('UnitContactApplications list not found');
  const columns = await graphGet(token, `${GRAPH_ROOT}/sites/${siteId}/lists/${unitContactList.id}/columns?$select=name`);
  return {
    accessToken: token,
    siteId,
    listId: unitContactList.id,
    columnNames: new Set((columns.value || []).map((entry) => String(entry && entry.name || '').trim()).filter(Boolean))
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
  return (body.value || []).find((entry) => String(entry && entry.fields && entry.fields.ApplicationId || '').trim() === applicationId) || null;
}

async function patchApplicationToActive(context, applicationId, username) {
  const item = await findApplicationListItem(context, applicationId);
  if (!item) throw new Error(`Application ${applicationId} not found in SharePoint`);
  const nowIso = new Date().toISOString();
  const fields = filterFields({
    Status: 'active',
    StatusLabel: '已啟用',
    StatusDetail: `管理端已建立帳號 ${username}，可直接登入開始填報。`,
    ReviewedAt: nowIso,
    ReviewedBy: 'smoke-script',
    ReviewComment: 'smoke auto approved',
    ActivationSentAt: nowIso,
    ActivatedAt: nowIso,
    ProvisionedAt: nowIso,
    ProvisionedBy: 'smoke-script',
    ProvisioningNote: `Account ready: ${username}`,
    AppUsername: username
  }, context.columnNames);
  await graphPatch(context.accessToken, `${GRAPH_ROOT}/sites/${context.siteId}/lists/${context.listId}/items/${item.id}/fields`, fields);
  return item.id;
}

async function deleteApplicationListItem(context, itemId) {
  if (!itemId) return;
  await fetch(`${GRAPH_ROOT}/sites/${context.siteId}/lists/${context.listId}/items/${itemId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${context.accessToken}`
    }
  });
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
  await page.goto(FRONT_BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__APP_READY__ === true, { timeout: 45000 });
  await page.waitForSelector('.btn-logout', { timeout: 20000 });
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
  const testEmail = `ucae2e-${stamp}@example.com`;
  const manualPersonName = `測試人員${stamp}`;
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
      await page.fill('[data-testid="unit-contact-name"]', '測試申請人');
      await page.fill('[data-testid="unit-contact-extension"]', '61234');
      await page.fill('[data-testid="unit-contact-email"]', testEmail);
      await page.fill('[data-testid="unit-contact-note"]', 'account-to-fill smoke');
      await page.click('[data-testid="unit-contact-submit"]');
      await page.waitForURL(/#apply-unit-contact-success\//, { timeout: 20000 });
      if (await page.locator('.unit-contact-summary-grid strong').count()) {
        createdApplicationId = String(await page.locator('.unit-contact-summary-grid strong').first().textContent() || '').trim();
      } else {
        const lookup = await lookupApplicationsByEmail(testEmail);
        createdApplicationId = String((lookup[0] && lookup[0].id) || '').trim();
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
      const cardText = String(await page.locator('.unit-contact-status-card').first().textContent() || '').trim();
      if (!cardText.includes(createdApplicationId)) throw new Error('Pending application lookup did not include application id');
      return {
        cardText: cardText.slice(0, 240)
      };
    });

    await runStep(results, 'ACCOUNT-FLOW-4', 'admin', 'provision reporter account for the approved application', async () => {
      await upsertSystemUser(adminToken, {
        username: testUsername,
        password: testPassword,
        name: '測試申請人',
        email: testEmail,
        role: '填報人',
        unit: targetUnit,
        units: [targetUnit],
        activeUnit: targetUnit,
        actorName: '系統測試',
        actorEmail: 'admin@company.com'
      });
      createdApplicationListItemId = await patchApplicationToActive(graphContext, createdApplicationId, testUsername);
      const lookup = await lookupApplicationsByEmail(testEmail);
      const application = lookup.find((entry) => entry.id === createdApplicationId);
      if (!application) throw new Error('Updated application not found after provisioning');
      if (application.status !== 'active') throw new Error(`Application status not updated: ${application.status}`);
      return {
        username: testUsername,
        status: application.status,
        statusLabel: application.statusLabel
      };
    });

    await runStep(results, 'ACCOUNT-FLOW-5', 'public', 'lookup approved application and confirm handoff detail is visible', async () => {
      await gotoHash(page, 'apply-unit-contact-status', { handleUnsaved: false });
      await page.waitForSelector('#uca-status-email', { timeout: 15000 });
      await page.fill('#uca-status-email', testEmail);
      await page.locator('#unit-contact-status-form').evaluate((form) => form.requestSubmit());
      await page.waitForSelector('.unit-contact-status-card', { timeout: 20000 });
      const cardText = String(await page.locator('.unit-contact-status-card').first().textContent() || '').trim();
      if (!cardText.includes('已啟用')) throw new Error('Application status card did not show 已啟用');
      return {
        cardText: cardText.slice(0, 280)
      };
    });

    await runStep(results, 'ACCOUNT-FLOW-6', 'reporter', 'login with the provisioned account through Pages', async () => {
      await loginViaPage(page, testUsername, testPassword);
      const shellText = String(await page.textContent('.shell') || '').trim();
      if (!shellText) throw new Error('Shell did not render after login');
      return {
        hash: await page.evaluate(() => window.location.hash || '')
      };
    });

    await runStep(results, 'ACCOUNT-FLOW-7', 'reporter', 'open training fill page and save a draft', async () => {
      await gotoHash(page, 'training-fill', { handleUnsaved: false });
      await page.waitForSelector('[data-testid="training-form"]', { timeout: 20000 });
      await page.fill('#tr-phone', '02-3366-61234');
      await page.fill('#tr-email', testEmail);
      await page.fill('#tr-new-name', manualPersonName);
      await page.fill('#tr-new-unit-name', targetUnit.split('／').pop() || targetUnit);
      await page.fill('#tr-new-identity', '測試人員');
      await page.fill('#tr-new-job-title', '工程師');
      await page.click('#training-add-person');
      await page.waitForFunction((name) => {
        return Array.from(document.querySelectorAll('#training-rows-body tr')).some((row) => String(row.textContent || '').includes(name));
      }, manualPersonName, { timeout: 15000 });
      await page.click('[data-testid="training-save-draft"]');
      await page.waitForFunction(() => /#training-fill\//.test(window.location.hash), { timeout: 20000 });
      createdTrainingFormId = await page.evaluate(() => decodeURIComponent((window.location.hash || '').split('/')[1] || ''));
      if (!createdTrainingFormId.startsWith('TRN-')) throw new Error(`Unexpected training form id: ${createdTrainingFormId}`);
      const statusText = String(await page.textContent('#training-draft-status') || '').trim();
      return {
        formId: createdTrainingFormId,
        draftStatus: statusText
      };
    });

    await runStep(results, 'ACCOUNT-FLOW-8', 'admin', 'verify saved training draft through backend API', async () => {
      const forms = await getTrainingForms(adminToken);
      const form = forms.find((entry) => entry.id === createdTrainingFormId);
      if (!form) throw new Error('Created training draft not found in backend');
      if (String(form.status || '').trim() !== '暫存') throw new Error(`Unexpected training form status: ${form.status}`);
      const rosters = await getTrainingRosters(adminToken);
      createdRosterIds = rosters
        .filter((entry) => String(entry.name || '').trim() === manualPersonName && String(entry.unit || '').trim() === targetUnit)
        .map((entry) => entry.id)
        .filter(Boolean);
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
        } catch (_) { }
      }
      for (const rosterId of createdRosterIds) {
        try {
          await deleteTrainingRoster(adminToken, rosterId);
        } catch (_) { }
      }
      try {
        await deleteSystemUser(adminToken, testUsername);
      } catch (_) { }
    }
    if (graphContext && createdApplicationListItemId) {
      try {
        await deleteApplicationListItem(graphContext, createdApplicationListItemId);
      } catch (_) { }
    }
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    writeJson(RESULT_PATH, finalizeResults(results));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
