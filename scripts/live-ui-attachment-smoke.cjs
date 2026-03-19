const fs = require('fs');
const path = require('path');
const {
  attachDiagnostics,
  chooseUnitForHandlerUsername,
  createArtifactRun,
  createResultEnvelope,
  finalizeResults,
  writeJson
} = require('./_role-test-utils.cjs');
const { chromium } = require('./_playwright.cjs');
const { FORM_ACTIONS } = require('../m365/azure-function/training-api/src/shared/contract');
const { ATTACHMENT_ACTIONS } = require('../m365/azure-function/attachment-api/src/shared/contract');

const BASE_URL = (process.env.ISMS_LIVE_BASE || 'http://127.0.0.1:8088/').replace(/\/+$/, '/') ;
const runMeta = createArtifactRun('live-ui-attachment-smoke');
const OUT_DIR = runMeta.outDir;
const SHOT_DIR = path.join(OUT_DIR, 'screenshots');
const RESULT_PATH = path.join(OUT_DIR, 'results.json');
const EVIDENCE_PATH = path.join(OUT_DIR, 'smoke-evidence.png');
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

fs.mkdirSync(SHOT_DIR, { recursive: true });
if (!fs.existsSync(EVIDENCE_PATH)) {
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0x8AAAAASUVORK5CYII=';
  fs.writeFileSync(EVIDENCE_PATH, Buffer.from(pngBase64, 'base64'));
}

const results = createResultEnvelope({
  baseUrl: BASE_URL,
  steps: [],
  artifacts: [],
  findings: [],
  cleanup: [],
  context: {
    admin: { username: 'admin', password: 'admin123' },
    reporter: { username: 'unit1', password: 'unit123', name: '計中管理者' }
  }
});

function artifact(type, filePath, extra) {
  results.artifacts.push({ type, path: filePath, ...(extra || {}) });
}

async function launchBrowserSafe() {
  const executablePath = fs.existsSync(CHROME_PATH)
    ? CHROME_PATH
    : (fs.existsSync(EDGE_PATH) ? EDGE_PATH : undefined);
  return chromium.launch(executablePath ? { headless: true, executablePath } : { headless: true });
}

async function saveScreenshot(page, name) {
  const filePath = path.join(SHOT_DIR, name);
  await page.screenshot({ path: filePath, fullPage: true });
  artifact('screenshot', filePath);
  return filePath;
}

function addStep(id, role, title, status, detail, extra) {
  results.steps.push({ id, role, title, status, detail, ...(extra || {}) });
}

async function runStep(id, role, title, fn) {
  try {
    const detail = await fn();
    addStep(id, role, title, 'passed', detail || 'ok');
    return detail;
  } catch (error) {
    const message = error && error.stack ? error.stack : String(error);
    addStep(id, role, title, 'failed', message);
    return null;
  }
}

async function acceptNextDialog(page, action = 'accept') {
  page.once('dialog', async (dialog) => {
    try {
      if (action === 'dismiss') await dialog.dismiss();
      else await dialog.accept();
    } catch (_) {
      // Ignore races if the page closes.
    }
  });
}

async function waitForAppReady(page, timeout) {
  await page.waitForFunction(() => window.__APP_READY__ === true, { timeout: timeout || 45000 });
}

async function gotoHash(page, hash, options) {
  const target = '#' + String(hash || '').replace(/^#/, '');
  if (!options || options.handleUnsaved !== false) {
    await acceptNextDialog(page, 'accept');
  }
  await page.evaluate((value) => { window.location.hash = value; }, target);
  await page.waitForTimeout(250);
}

async function waitForHash(page, expected, timeout) {
  await page.waitForFunction((hash) => window.location.hash === hash, expected, { timeout: timeout || 8000 });
}

async function currentHash(page) {
  return page.evaluate(() => window.location.hash || '');
}

async function resetClientState(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const storageKeys = [
      'cats_auth',
      'cats_data',
      'cats_checklists',
      'cats_checklist_template',
      'cats_training_hours',
      'cats_login_log',
      'cats_unit_review',
      'cats_unit_contact_applications'
    ];
    try {
      storageKeys.forEach((key) => {
        try { localStorage.removeItem(key); } catch (_) {}
        try { sessionStorage.removeItem(key); } catch (_) {}
      });
      if (window.indexedDB && typeof window.indexedDB.databases === 'function') {
        const dbs = await window.indexedDB.databases();
        for (const db of dbs || []) {
          if (!db || !db.name) continue;
          await new Promise((resolve) => {
            try {
              const request = window.indexedDB.deleteDatabase(db.name);
              request.onsuccess = request.onerror = request.onblocked = () => resolve();
            } catch (_) {
              resolve();
            }
          });
        }
      }
    } catch (_) {
      // best effort
    }
  });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
}

async function login(page, username, password) {
  await resetClientState(page);
  await page.waitForSelector('[data-testid="login-form"]', { timeout: 15000 });
  await page.fill('[data-testid="login-user"]', username);
  await page.fill('[data-testid="login-pass"]', password);
  await Promise.all([
    page.waitForFunction(() => !!document.querySelector('.btn-logout'), { timeout: 15000 }),
    page.locator('[data-testid="login-form"]').evaluate((form) => form.requestSubmit())
  ]);
  await page.waitForFunction(() => window.__REMOTE_BOOTSTRAP_STATE__ !== 'pending', { timeout: 45000 });
  await page.waitForTimeout(400);
}

async function logout(page) {
  await resetClientState(page);
}

async function assertHealth(endpoint) {
  const response = await fetch(new URL(endpoint, BASE_URL));
  if (!response.ok) throw new Error(`health failed ${endpoint}: HTTP ${response.status}`);
  const body = await response.json();
  if (!body || body.ok === false || body.ready === false) {
    throw new Error(`health not ready ${endpoint}: ${JSON.stringify(body)}`);
  }
  return body;
}

function buildCaseId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `CAR-990-UIATT-${stamp}`;
}

function buildTrainingYear() {
  const now = new Date();
  return `114-SMOKE-${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
}

function isoDate(offsetDays) {
  const value = new Date(Date.now() + offsetDays * 86400000);
  return value.toISOString().slice(0, 10);
}

async function selectHandlerUsername(page, username) {
  await page.evaluate((targetUsername) => {
    const select = document.getElementById('f-hname');
    if (!select) throw new Error('missing #f-hname');
    const option = Array.from(select.options).find((entry) => entry.dataset.username === targetUsername);
    if (!option) {
      throw new Error(`handler option not found for ${targetUsername}`);
    }
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, username);
  await page.waitForTimeout(250);
}

async function getSessionToken(page) {
  return await page.evaluate(() => window._authModule?.currentUser?.()?.sessionToken || '');
}

async function apiGetJson(pathname, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const authed = await fetch(new URL(pathname, BASE_URL), { headers });
  const body = await authed.json();
  if (!authed.ok) {
    throw new Error(`${pathname} failed: HTTP ${authed.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function apiPostJson(pathname, payload, token) {
  const response = await fetch(new URL(pathname, BASE_URL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  if (!response.ok || body.ok === false) {
    throw new Error(`${pathname} failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function cleanupTrainingArtifacts(trainingId, actor) {
  if (!trainingId) return;
  try {
    const detail = await apiGetJson(`/api/training/forms/${encodeURIComponent(trainingId)}`, actor.token);
    const form = detail && detail.item;
    const files = Array.isArray(form && form.signedFiles) ? form.signedFiles : [];
    for (const entry of files) {
      if (!entry || !entry.driveItemId) continue;
      await apiPostJson(`/api/attachments/${encodeURIComponent(entry.driveItemId)}/delete`, {
        action: ATTACHMENT_ACTIONS.DELETE,
        payload: {
          driveItemId: entry.driveItemId,
          actorName: actor.name,
          actorUsername: actor.username
        }
      }, actor.token);
      results.cleanup.push({ type: 'training-attachment', deletedId: entry.driveItemId });
    }
    await apiPostJson(`/api/training/forms/${encodeURIComponent(trainingId)}/delete`, {
      action: FORM_ACTIONS.DELETE,
      payload: {
        id: trainingId,
        actorName: actor.name,
        actorUsername: actor.username
      }
    }, actor.token);
    results.cleanup.push({ type: 'training-form', deletedId: trainingId });
  } catch (error) {
    results.cleanup.push({ type: 'training-cleanup-error', trainingId, error: String(error && error.message || error) });
    throw error;
  }
}

(async () => {
  const browser = await launchBrowserSafe();
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  const page = await context.newPage();
  attachDiagnostics(page, results);

  let correctiveCaseId = null;
  let trainingId = null;
  const trainingYear = buildTrainingYear();

  try {
    await runStep('LIVE-HEALTH', '系統', '確認 live backend 全綠', async () => {
      await assertHealth('/api/auth/health');
      await assertHealth('/api/corrective-actions/health');
      await assertHealth('/api/training/health');
      await assertHealth('/api/attachments/health');
      await assertHealth('/api/checklists/health');
      return 'auth / corrective-actions / training / attachments / checklists ready';
    });

    await runStep('CAR-01', '最高管理員', '建立附件 smoke 矯正單', async () => {
      correctiveCaseId = buildCaseId();
      await login(page, results.context.admin.username, results.context.admin.password);
      await gotoHash(page, 'create');
      await page.waitForSelector('#create-form');
      await page.fill('#f-id', correctiveCaseId);
      await chooseUnitForHandlerUsername(page, 'f-hunit', 'f-hname', results.context.reporter.username);
      await selectHandlerUsername(page, results.context.reporter.username);
      await page.fill('#f-problem', `[UI-ATTACH-SMOKE] 驗證矯正單回填與追蹤附件流程 ${correctiveCaseId}`);
      await page.fill('#f-occurrence', '使用 live 8088 入口驗證回填附件、追蹤附件與結案後附件顯示。');
      await page.fill('#f-due', isoDate(10));
      await page.evaluate(() => {
        ['defType', 'source', 'category'].forEach((name) => {
          const target = document.querySelector(`input[name="${name}"]`);
          if (!target) throw new Error(`missing ${name}`);
          target.checked = true;
          target.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
      await Promise.all([
        waitForHash(page, '#detail/' + correctiveCaseId),
        page.click('[data-testid="create-submit"]')
      ]);
      await saveScreenshot(page, 'corrective-created.png');
      return correctiveCaseId;
    });
    await logout(page);

    await runStep('CAR-02', '填報者', '回填矯正措施並上傳佐證', async () => {
      await login(page, results.context.reporter.username, results.context.reporter.password);
      await gotoHash(page, 'respond/' + correctiveCaseId);
      await page.waitForSelector('#respond-form');
      await page.fill('#r-action', '完成 smoke 測試專用矯正措施回填。');
      await page.fill('#r-due', isoDate(12));
      await page.fill('#r-root', '根因為缺少 live UI 回歸驗證。');
      await page.fill('#r-elim', '新增 live UI 附件 smoke script。');
      await page.setInputFiles('#file-input', EVIDENCE_PATH);
      await page.waitForFunction(() => document.querySelectorAll('#file-previews .file-preview-item').length === 1, { timeout: 10000 });
      await Promise.all([
        waitForHash(page, '#detail/' + correctiveCaseId),
        page.click('[data-testid="respond-submit"]')
      ]);
      await page.waitForSelector('#case-evidence-main .file-preview-item', { timeout: 10000 });
      const mainCount = await page.locator('#case-evidence-main .file-preview-item').count();
      const actionCount = await page.locator('#case-evidence-main .file-preview-actions a, #case-evidence-main .file-preview-actions button').count();
      if (mainCount < 1) throw new Error(`expected >=1 evidence items, got ${mainCount}`);
      if (actionCount < 2) throw new Error(`expected preview/download actions, got ${actionCount}`);
      await saveScreenshot(page, 'corrective-responded.png');
      return `detail shows ${mainCount} evidence item(s) after respond`;
    });
    await logout(page);

    await runStep('CAR-03', '最高管理員', '審核並轉入追蹤', async () => {
      await login(page, results.context.admin.username, results.context.admin.password);
      await gotoHash(page, 'detail/' + correctiveCaseId);
      await page.waitForSelector('.detail-header');
      await page.waitForSelector('[data-testid="case-transition-review"]', { timeout: 15000 });
      const reviewResult = await page.evaluate(async (id) => {
        const api = window._m365ApiClient;
        const user = window._authModule?.currentUser?.() || {};
        if (!api || typeof api.reviewCorrectiveAction !== 'function') {
          throw new Error('missing corrective action api client');
        }
        const result = await api.reviewCorrectiveAction(id, {
          decision: 'start_review',
          actorName: user.name || user.username || 'admin',
          actorUsername: user.username || 'admin'
        });
        return {
          status: result && result.item && result.item.status,
          reviewResult: result && result.item && result.item.reviewResult
        };
      }, correctiveCaseId);
      if (!reviewResult || reviewResult.status !== '審核中') {
        throw new Error(`review did not transition to 審核中: ${JSON.stringify(reviewResult)}`);
      }
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      await gotoHash(page, 'detail/' + correctiveCaseId, { handleUnsaved: false });
      await page.waitForSelector('.detail-header');
      await page.waitForSelector('[data-testid="case-transition-tracking"]', { timeout: 15000 });
      const trackingResult = await page.evaluate(async (id) => {
        const api = window._m365ApiClient;
        const user = window._authModule?.currentUser?.() || {};
        if (!api || typeof api.reviewCorrectiveAction !== 'function') {
          throw new Error('missing corrective action api client');
        }
        const result = await api.reviewCorrectiveAction(id, {
          decision: 'tracking',
          actorName: user.name || user.username || 'admin',
          actorUsername: user.username || 'admin'
        });
        return {
          status: result && result.item && result.item.status,
          reviewResult: result && result.item && result.item.reviewResult
        };
      }, correctiveCaseId);
      if (!trackingResult || trackingResult.status !== '追蹤中') {
        throw new Error(`tracking transition did not reach 追蹤中: ${JSON.stringify(trackingResult)}`);
      }
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      await gotoHash(page, 'detail/' + correctiveCaseId, { handleUnsaved: false });
      await page.waitForSelector('.detail-header');
      await saveScreenshot(page, 'corrective-tracking-state.png');
      return 'moved to tracking';
    });
    await logout(page);

    await runStep('CAR-04', '填報者', '追蹤提報結案並上傳佐證', async () => {
      await login(page, results.context.reporter.username, results.context.reporter.password);
      await gotoHash(page, 'tracking/' + correctiveCaseId);
      await page.waitForSelector('#track-form');
      await page.fill('#tk-exec', 'Completed all live attachment smoke verification.');
      await page.fill('#tk-note', 'Request close with tracking evidence.');
      await page.evaluate(() => {
        const target = Array.from(document.querySelectorAll('input[name="tkResult"]')).find((entry) => {
          return String(entry.value || '').includes('結案');
        }) || document.querySelector('input[name="tkResult"]');
        if (!target) throw new Error('missing tkResult radio');
        target.checked = true;
        target.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForFunction(() => {
        const wrap = document.getElementById('tk-evidence-wrap');
        return wrap && window.getComputedStyle(wrap).display !== 'none';
      }, { timeout: 5000 });
      await page.setInputFiles('#tk-file-input', EVIDENCE_PATH);
      await page.waitForFunction(() => document.querySelectorAll('#tk-file-previews .file-preview-item').length === 1, { timeout: 10000 });
      await Promise.all([
        waitForHash(page, '#detail/' + correctiveCaseId),
        page.click('[data-testid="tracking-submit"]')
      ]);
      await page.waitForSelector('#case-pending-evidence .file-preview-item', { timeout: 10000 });
      await saveScreenshot(page, 'corrective-pending-tracking.png');
      return 'pending tracking review shows uploaded evidence';
    });
    await logout(page);

    await runStep('CAR-05', '最高管理員', '核准結案並確認附件保留', async () => {
      await login(page, results.context.admin.username, results.context.admin.password);
      await gotoHash(page, 'detail/' + correctiveCaseId);
      await page.waitForSelector('.detail-header');
      await page.waitForSelector('[data-testid="pending-tracking-approve-close"]', { timeout: 15000 });
      const reviewTrackingResult = await page.evaluate(async (id) => {
        const api = window._m365ApiClient;
        const user = window._authModule?.currentUser?.() || {};
        if (!api || typeof api.reviewCorrectiveActionTracking !== 'function') {
          throw new Error('missing corrective action tracking review api client');
        }
        const result = await api.reviewCorrectiveActionTracking(id, {
          decision: 'close',
          actorName: user.name || user.username || 'admin',
          actorUsername: user.username || 'admin'
        });
        return {
          status: result && result.item && result.item.status,
          reviewResult: result && result.item && result.item.reviewResult
        };
      }, correctiveCaseId);
      if (!reviewTrackingResult || reviewTrackingResult.status !== '結案') {
        throw new Error(`tracking review did not close: ${JSON.stringify(reviewTrackingResult)}`);
      }
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      await gotoHash(page, 'detail/' + correctiveCaseId, { handleUnsaved: false });
      await page.waitForSelector('#case-evidence-main .file-preview-item', { timeout: 10000 });
      const evidenceCount = await page.locator('#case-evidence-main .file-preview-item').count();
      const detail = await apiGetJson(`/api/corrective-actions/${encodeURIComponent(correctiveCaseId)}`, await getSessionToken(page));
      const item = detail && detail.item;
      if (!item || item.status !== '結案') {
        throw new Error(`expected closed status, got ${JSON.stringify(item && item.status)}`);
      }
      if (!Array.isArray(item.evidence) || item.evidence.length < 2) {
        throw new Error(`expected merged evidence length >= 2, got ${JSON.stringify(item && item.evidence)}`);
      }
      if (evidenceCount < 2) throw new Error(`expected 2 evidence items on detail, got ${evidenceCount}`);
      await saveScreenshot(page, 'corrective-closed.png');
      return `closed with ${evidenceCount} evidence item(s) visible`;
    });
    await logout(page);

    await runStep('TRN-01', '填報者', '教育訓練流程一建立單據', async () => {
      await login(page, results.context.reporter.username, results.context.reporter.password);
      await gotoHash(page, 'training-fill');
      await page.waitForSelector('#training-form');
      await page.fill('#tr-phone', '02-3366-1234');
      await page.fill('#tr-email', 'unit1@g.ntu.edu.tw');
      await page.fill('#tr-year', trainingYear);
      await page.fill('#tr-date', isoDate(0));
      await page.waitForFunction(() => document.querySelectorAll('select[data-field="status"]').length >= 1, { timeout: 10000 });
      await page.click('#training-select-all');
      await page.selectOption('#training-bulk-status', { label: '在職' });
      await page.click('[data-bulk-general="是"]');
      await page.click('#training-apply-bulk');
      const rowCount = await page.locator('select[data-field="status"]').count();
      for (let index = 0; index < rowCount; index += 1) {
        await page.locator(`select[data-idx="${index}"][data-field="status"]`).selectOption({ label: '在職' });
        await page.locator(`select[data-idx="${index}"][data-field="isInfoStaff"]`).selectOption({ label: '否' });
      }
      await Promise.all([
        page.waitForFunction(() => String(window.location.hash || '').startsWith('#training-detail/'), { timeout: 12000 }),
        page.click('[data-testid="training-submit"]')
      ]);
      trainingId = decodeURIComponent((await currentHash(page)).replace(/^#training-detail\//, ''));
      if (!trainingId) throw new Error('missing training id');
      await saveScreenshot(page, 'training-pending-signoff.png');
      return trainingId;
    });

    await runStep('TRN-02', '填報者', '教育訓練流程三上傳簽核檔', async () => {
      if (!trainingId) throw new Error('missing training id');
      await page.waitForSelector('#training-file-input', { timeout: 10000 });
      await page.setInputFiles('#training-file-input', EVIDENCE_PATH);
      await page.waitForSelector('#training-file-previews .training-file-card', { timeout: 10000 });
      const previewActions = await page.locator('#training-file-previews .training-file-actions a, #training-file-previews .training-file-actions button').count();
      if (previewActions < 2) throw new Error(`expected preview/download actions, got ${previewActions}`);
      await page.click('#training-finalize-submit');
      await page.waitForFunction(() => !document.querySelector('#training-finalize-submit'), { timeout: 12000 });
      await page.waitForSelector('#training-signed-files-readonly .training-file-card', { timeout: 10000 });
      const readonlyActions = await page.locator('#training-signed-files-readonly .training-file-actions a, #training-signed-files-readonly .training-file-actions button').count();
      if (readonlyActions < 2) throw new Error(`expected readonly preview/download actions, got ${readonlyActions}`);
      const detail = await apiGetJson(`/api/training/forms/${encodeURIComponent(trainingId)}`, await getSessionToken(page));
      const form = detail && detail.item;
      if (!form || !Array.isArray(form.signedFiles) || form.signedFiles.length < 1) {
        throw new Error(`training signed files missing after finalize: ${JSON.stringify(form)}`);
      }
      const signedFileName = String(form.signedFiles[0] && (form.signedFiles[0].name || form.signedFiles[0].fileName || '')).trim();
      if (!signedFileName || /^(?:att|trn|chk|car|uca)[-_]/i.test(signedFileName)) {
        throw new Error(`training signed file name is not normalized: ${signedFileName}`);
      }
      await saveScreenshot(page, 'training-finalized.png');
      return `finalized with ${form.signedFiles.length} signed file(s)`;
    });
    await logout(page);

    await runStep('TRN-03', '系統', '清理教育訓練 smoke 資料', async () => {
      if (!trainingId) throw new Error('missing training id for cleanup');
      await login(page, results.context.reporter.username, results.context.reporter.password);
      await cleanupTrainingArtifacts(trainingId, {
        ...results.context.reporter,
        token: await getSessionToken(page)
      });
      return `deleted training form ${trainingId}`;
    });

    await runStep('CHK-01', '填報者', '檢核表附件能力檢查', async () => {
      await login(page, results.context.reporter.username, results.context.reporter.password);
      await gotoHash(page, 'checklist-fill');
      await page.waitForSelector('#checklist-form');
      const fileInputs = await page.locator('#checklist-form input[type="file"]').count();
      const evidenceTextareas = await page.locator('#checklist-form textarea[id^="cl-evidence-"]').count();
      await saveScreenshot(page, 'checklist-fill-current.png');
      if (fileInputs !== 0) {
        return `found ${fileInputs} file input(s); checklist upload exists`;
      }
      results.findings.push({
        type: 'missing-feature',
        module: 'checklist',
        detail: '檢核表目前只有每題「佐證資料說明」文字欄位，沒有實際檔案上傳 input，無法完成附件端到端測試。'
      });
      throw new Error(`checklist has ${evidenceTextareas} evidence textarea(s) but no file upload input`);
    });
    await logout(page);
  } finally {
    try {
      await context.close();
      await browser.close();
    } catch (_) {
      // Ignore shutdown errors.
    }
    const finalized = finalizeResults(results);
    writeJson(RESULT_PATH, finalized);
    if (finalized.summary.failed || finalized.pageErrors.length) {
      process.exitCode = 1;
    }
  }
})().catch((error) => {
  results.fatal = error && error.stack ? error.stack : String(error);
  writeJson(RESULT_PATH, finalizeResults(results));
  console.error(results.fatal);
  process.exitCode = 1;
});
