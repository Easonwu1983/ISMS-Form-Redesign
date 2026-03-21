const path = require('path');
const {
  attachDiagnostics,
  createArtifactRun,
  createResultEnvelope,
  finalizeResults,
  gotoHash,
  launchBrowser,
  login,
  logout,
  runStep,
  writeJson
} = require('./_role-test-utils.cjs');

const OUT_DIR = createArtifactRun('checklist-governance-smoke').outDir;
const RESULT_PATH = path.join(OUT_DIR, 'checklist-governance-smoke.json');
const BASE_URL = String(process.env.TEST_BASE_URL || process.env.ISMS_LIVE_BASE || 'http://127.0.0.1:8088/').trim().replace(/\/$/, '');
const API_BASE = BASE_URL;
const ADMIN = {
  username: String(process.env.CHECKLIST_GOVERNANCE_ADMIN_USERNAME || 'admin').trim(),
  password: String(process.env.CHECKLIST_GOVERNANCE_ADMIN_PASSWORD || 'admin123').trim()
};

function cleanText(value) {
  return String(value || '').trim();
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
    const message = json && (json.error || json.message) ? (json.error || json.message) : `HTTP ${response.status}`;
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
    payload: { username: ADMIN.username, password: ADMIN.password }
  });
  const token = cleanText(body && body.session && body.session.token);
  if (!token) throw new Error('Admin login did not return a session token');
  return { token, body };
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
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

async function pickGovernancePair(page) {
  return page.evaluate(() => {
    const api = window._unitModule;
    if (!api || typeof api.getSelectableUnitStructure !== 'function' || typeof api.composeUnitValue !== 'function') {
      throw new Error('unit module helpers are unavailable');
    }
    const structure = api.getSelectableUnitStructure({ excludeUnits: ['學校分部總辦事處'] }) || {};
    const parents = Object.keys(structure)
      .filter((parent) => Array.isArray(structure[parent]) && structure[parent].length > 0)
      .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    const preferredParent = parents.includes('主計室') ? '主計室' : (parents[0] || '');
    const selectedParent = preferredParent || '';
    const children = selectedParent ? (Array.isArray(structure[selectedParent]) ? structure[selectedParent] : []) : [];
    const selectedChild = children.find((child) => String(child || '').trim()) || '';
    return {
      parent: selectedParent,
      child: selectedChild,
      childUnit: selectedParent && selectedChild ? api.composeUnitValue(selectedParent, selectedChild) : ''
    };
  });
}

async function setGovernanceMode(page, unit, mode, note) {
  await page.evaluate(({ unit, mode, note }) => {
    const card = Array.from(document.querySelectorAll('[data-governance-unit]'))
      .find((entry) => String(entry.getAttribute('data-governance-unit') || '').trim() === String(unit || '').trim());
    if (!card) throw new Error(`Missing governance card for ${unit}`);
    const modeSelect = card.querySelector('[data-governance-unit-mode]');
    const noteInput = card.querySelector('[data-governance-unit-note]');
    const saveButton = card.querySelector('[data-action="admin.saveGovernanceMode"]');
    if (!modeSelect || !saveButton) throw new Error(`Missing governance controls for ${unit}`);
    modeSelect.value = mode;
    modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    if (noteInput) {
      noteInput.value = note || '';
      noteInput.dispatchEvent(new Event('input', { bubbles: true }));
      noteInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    saveButton.click();
  }, { unit, mode, note });
  await page.waitForFunction(({ unit, mode }) => {
    const api = window._dataModule;
    return !!api && typeof api.getUnitGovernanceMode === 'function' && api.getUnitGovernanceMode(unit) === mode;
  }, { unit, mode }, { timeout: 20000 });
}

async function readChecklistLockState(page) {
  return page.evaluate(() => {
    const appText = String(document.getElementById('app')?.innerText || '');
    const submitButton = document.querySelector('button[type="submit"]');
    const saveDraft = document.getElementById('cl-save-draft');
    const topInputs = ['#cl-unit', '#cl-date', '#cl-year', '#cl-sign-status', '#cl-sign-date']
      .map((selector) => {
        const node = document.querySelector(selector);
        return {
          selector,
          exists: !!node,
          disabled: node ? !!node.disabled : false,
          value: node && 'value' in node ? String(node.value || '') : ''
        };
      });
    const lockedBlocks = Array.from(document.querySelectorAll('.cl-item--locked')).length;
    const editableInsideLocked = Array.from(document.querySelectorAll('.cl-item--locked')).some((item) => {
      return !!item.querySelector('input:not([disabled]), textarea:not([readonly]), select:not([disabled])');
    });
    return {
      appText,
      submitVisible: !!submitButton,
      saveDraftVisible: !!saveDraft,
      topInputs,
      lockedBlocks,
      editableInsideLocked
    };
  });
}

(async () => {
  const results = createResultEnvelope({
    steps: [],
    frontBase: BASE_URL
  });

  let browser = null;
  let page = null;
  let adminToken = '';
  let tempUsername = '';
  let tempPassword = '';
  let originalReviewStore = null;
  let chosenParent = '';
  let chosenChild = '';
  let chosenChildUnit = '';

  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      ignoreHTTPSErrors: true
    });
    page = await context.newPage();
    attachDiagnostics(page, results);

    await runStep(results, 'CG-01', 'admin', 'login and open unit governance page', async () => {
      const loginResult = await loginAsAdmin();
      adminToken = loginResult.token;
      await login(page, ADMIN.username, ADMIN.password);
      await gotoHash(page, 'unit-review', { handleUnsaved: false });
      await page.waitForSelector('[data-governance-unit]', { timeout: 30000 });
      return 'unit-review ready';
    });

    await runStep(results, 'CG-02', 'admin', 'pick a governed parent/child unit pair', async () => {
      const pair = await pickGovernancePair(page);
      chosenParent = cleanText(pair.parent);
      chosenChild = cleanText(pair.child);
      chosenChildUnit = cleanText(pair.childUnit);
      if (!chosenParent || !chosenChild || !chosenChildUnit) {
        throw new Error('Unable to find a parent unit with at least one child unit');
      }
      return { parent: chosenParent, child: chosenChild, childUnit: chosenChildUnit };
    });

    await runStep(results, 'CG-03', 'admin', 'save consolidated governance mode for the parent unit', async () => {
      originalReviewStore = await page.evaluate(() => {
        if (!window._dataModule || typeof window._dataModule.loadUnitReviewStore !== 'function') return null;
        return window._dataModule.loadUnitReviewStore();
      });
      await setGovernanceMode(page, chosenParent, 'consolidated', 'checklist governance smoke');
      const saved = await page.evaluate((unit) => {
        const api = window._dataModule;
        const mode = api && typeof api.getUnitGovernanceMode === 'function' ? api.getUnitGovernanceMode(unit) : '';
        const store = api && typeof api.getUnitGovernanceModes === 'function' ? api.getUnitGovernanceModes() : [];
        const entry = Array.isArray(store) ? store.find((item) => String(item && item.unit || '').trim() === String(unit || '').trim()) : null;
        return {
          mode,
          note: entry && entry.note ? String(entry.note) : '',
          children: entry && Array.isArray(entry.children) ? entry.children.length : 0
        };
      }, chosenParent);
      if (saved.mode !== 'consolidated') throw new Error(`Governance mode was not saved: ${saved.mode}`);
      return saved;
    });

    await runStep(results, 'CG-04', 'admin', 'provision a temporary unit admin for the chosen child unit', async () => {
      tempUsername = `gov-smoke-${Date.now()}@g.ntu.edu.tw`;
      tempPassword = `G${Date.now()}#Aa1`;
      const body = await upsertSystemUser(adminToken, {
        username: tempUsername,
        password: tempPassword,
        forcePasswordChange: false,
        name: `治理測試 ${Date.now()}`,
        email: tempUsername,
        role: '單位管理員',
        unit: chosenChildUnit,
        units: [chosenChildUnit],
        activeUnit: chosenChildUnit,
        securityRoles: ['二級單位資安窗口'],
        actorName: 'admin',
        actorEmail: 'admin@localhost'
      });
      if (!(body && body.created !== false)) {
        // Upsert may update an existing temp user in a rare rerun; that is fine.
      }
      return { username: tempUsername, unit: chosenChildUnit };
    });

    await runStep(results, 'CG-05', 'unit admin', 'login and confirm checklist is locked by governance mode', async () => {
      await logout(page);
      await login(page, tempUsername, tempPassword);
      await gotoHash(page, 'checklist-fill', { handleUnsaved: false });
      await page.waitForSelector('[data-testid="checklist-form"]', { timeout: 30000 });
      await page.waitForSelector('.cl-checklist-lock-banner', { timeout: 30000 });
      const state = await readChecklistLockState(page);
      if (!state.appText.includes('本單位由一級單位統一填報')) {
        throw new Error('Governance lock banner is missing');
      }
      if (!state.appText.includes('您目前可檢視內容，但無法在此單位填寫或送出')) {
        throw new Error('Governance lock explanation is missing');
      }
      if (state.submitVisible) throw new Error('Submit button should be hidden in locked mode');
      if (state.saveDraftVisible) throw new Error('Save draft button should be hidden in locked mode');
      for (const entry of state.topInputs) {
        if (!entry.exists) throw new Error(`Missing top input: ${entry.selector}`);
        if (!entry.disabled) throw new Error(`Top input should be disabled: ${entry.selector}`);
      }
      if (!state.lockedBlocks) throw new Error('Expected locked checklist sections');
      if (state.editableInsideLocked) throw new Error('Locked checklist sections still contain editable controls');
      const unitValue = await page.locator('#cl-unit').inputValue();
      if (cleanText(unitValue) !== chosenChildUnit) {
        throw new Error(`Checklist unit mismatch: ${unitValue} vs ${chosenChildUnit}`);
      }
      return {
        username: tempUsername,
        parent: chosenParent,
        childUnit: chosenChildUnit,
        lockedBlocks: state.lockedBlocks
      };
    });
  } finally {
    try {
      if (page && originalReviewStore) {
        await page.evaluate((store) => {
          if (window._dataModule && typeof window._dataModule.saveUnitReviewStore === 'function') {
            window._dataModule.saveUnitReviewStore(store);
          }
        }, originalReviewStore);
      }
    } catch (_) {
      // best effort cleanup
    }
    if (adminToken && tempUsername) {
      try {
        await deleteSystemUser(adminToken, tempUsername);
      } catch (_) {
        // best effort cleanup
      }
    }
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    writeJson(RESULT_PATH, finalizeResults(results));
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
