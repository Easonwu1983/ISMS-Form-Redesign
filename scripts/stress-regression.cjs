const fs = require('fs');
const path = require('path');
const {
  attachDiagnostics,
  createArtifactRun,
  createResultEnvelope,
  finalizeResults,
  gotoHash,
  launchBrowser,
  login,
  readJsonFromStorage,
  resetApp,
  runStep,
  writeJson
} = require('./_role-test-utils.cjs');

const runMeta = createArtifactRun('stress-regression');
const OUT_DIR = runMeta.outDir;
const SHOT_DIR = path.join(OUT_DIR, 'screenshots');
const RESULT_PATH = path.join(OUT_DIR, 'stress-regression.json');
const LARGE_CSV_PATH = path.join(OUT_DIR, 'large-roster.csv');
const TARGET_UNIT = '主計室';
const ROSTER_PREFIX = 'STRESS-ROSTER-';
const CASE_ID = 'CAR-STRESS-LONG';
const TRAINING_IMPORT_CHUNK_SIZE = 100;

fs.mkdirSync(SHOT_DIR, { recursive: true });

function buildLargeCsv(rowCount) {
  const lines = ['姓名,本職單位,身分別,職稱,填報單位'];
  for (let index = 1; index <= rowCount; index += 1) {
    const name = `${ROSTER_PREFIX}${String(index).padStart(3, '0')}`;
    lines.push(`${name},${TARGET_UNIT},職員,工程師,${TARGET_UNIT}`);
  }
  fs.writeFileSync(LARGE_CSV_PATH, lines.join('\r\n'));
}

async function saveScreenshot(results, page, fileName) {
  const filePath = path.join(SHOT_DIR, fileName);
  await page.screenshot({ path: filePath, fullPage: true });
  results.artifacts.push({ type: 'screenshot', path: filePath });
}

async function chooseUnit(page, baseId, fullUnit) {
  await page.evaluate(({ baseId, fullUnit }) => {
    const categoryEl = document.getElementById(`${baseId}-category`);
    const parentEl = document.getElementById(`${baseId}-parent`);
    const childEl = document.getElementById(`${baseId}-child`);
    const hiddenEl = document.getElementById(baseId);
    if (!categoryEl || !parentEl || !childEl || !hiddenEl) {
      throw new Error(`missing unit cascade ${baseId}`);
    }
    const [parent, child] = String(fullUnit || '').split('／');
    const dispatch = (element) => element.dispatchEvent(new Event('change', { bubbles: true }));
    const categoryValues = Array.from(categoryEl.options).map((option) => String(option.value || '').trim()).filter(Boolean);
    for (const value of categoryValues) {
      categoryEl.value = value;
      dispatch(categoryEl);
      const parentOptions = Array.from(parentEl.options).map((option) => String(option.value || '').trim());
      if (parentOptions.includes(parent)) break;
    }
    parentEl.value = parent;
    dispatch(parentEl);
    if (child) {
      childEl.value = child;
      dispatch(childEl);
    }
  }, { baseId, fullUnit });

  await page.waitForFunction(({ baseId, fullUnit }) => {
    const hidden = document.getElementById(baseId);
    return !!hidden && String(hidden.value || '').trim() === String(fullUnit || '').trim();
  }, { baseId, fullUnit });
}

async function getTrainingStore(page) {
  return await readJsonFromStorage(page, 'cats_training_hours') || { forms: [], rosters: [] };
}

async function getSessionToken(page) {
  return page.evaluate(() => {
    const user = window._authModule && typeof window._authModule.currentUser === 'function'
      ? window._authModule.currentUser()
      : null;
    return String(user && user.sessionToken || '').trim();
  });
}

async function cleanupImportedRosters(page, prefix) {
  const token = await getSessionToken(page);
  if (!token) return;
  await page.evaluate(async ({ targetPrefix, sessionToken }) => {
    const response = await fetch('/api/training/rosters', {
      headers: { Authorization: `Bearer ${sessionToken}` }
    });
    const body = await response.json().catch(() => ({}));
    const items = []
      .concat(Array.isArray(body) ? body : [])
      .concat(Array.isArray(body?.items) ? body.items : [])
      .concat(Array.isArray(body?.value) ? body.value : []);
    const ids = items
      .filter((item) => String((item && item.name) || '').startsWith(targetPrefix))
      .map((item) => String(item.id || '').trim())
      .filter(Boolean);
    if (!ids.length) return;
    await fetch('/api/training/rosters/delete-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`
      },
      body: JSON.stringify({
        action: 'training.roster.delete-batch',
        requestId: `stress-cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        context: {
          contractVersion: '2026-03-12',
          source: 'stress-regression-cleanup',
          frontendOrigin: window.location.origin,
          frontendHash: window.location.hash || '',
          sentAt: new Date().toISOString()
        },
        payload: {
          ids,
          actorName: 'stress-regression-cleanup',
          actorUsername: 'admin'
        }
      })
    });
  }, { targetPrefix: prefix, sessionToken: token });
}

async function captureRosterBatchResponses(page, expectedCount, action) {
  const responses = [];
  let resolveDone;
  let rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  const timer = setTimeout(() => rejectDone(new Error(`timeout waiting for ${expectedCount} roster batch responses`)), 180000);
  const handler = async (response) => {
    if (!String(response.url() || '').includes('/api/training/rosters/upsert-batch')) return;
    try {
      const text = await response.text();
      responses.push({
        status: response.status(),
        ok: response.ok(),
        body: text
      });
      if (responses.length >= expectedCount) {
        clearTimeout(timer);
        page.off('response', handler);
        resolveDone(responses);
      }
    } catch (error) {
      responses.push({
        status: response.status(),
        ok: response.ok(),
        body: `__capture_error__: ${String(error && error.message || error || '')}`
      });
      if (responses.length >= expectedCount) {
        clearTimeout(timer);
        page.off('response', handler);
        resolveDone(responses);
      }
    }
  };
  page.on('response', handler);
  try {
    await action();
    return await done;
  } finally {
    clearTimeout(timer);
    page.off('response', handler);
  }
}

async function seedLongCase(page) {
  await page.evaluate(({ id, unit }) => {
    const raw = JSON.parse(localStorage.getItem('cats_data') || '{"version":1,"payload":{"items":[],"users":[],"nextId":1}}');
    const store = raw && typeof raw === 'object' && Number.isFinite(Number(raw.version)) && Object.prototype.hasOwnProperty.call(raw, 'payload')
      ? raw.payload
      : raw;
    const history = Array.from({ length: 140 }, (_, index) => ({
      time: new Date(Date.now() - (140 - index) * 3600000).toISOString(),
      action: `Stress history ${index + 1}`,
      user: index % 2 === 0 ? '王經理' : '李工程師'
    }));
    const evidence = Array.from({ length: 18 }, (_, index) => ({
      name: `stress-evidence-${String(index + 1).padStart(2, '0')}.pdf`,
      type: 'application/pdf',
      size: 1024 + index,
      data: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjEgMCBvYmoKPDw+PgplbmRvYmoKdHJhaWxlcgo8PD4+CnN0YXJ0eHJlZgo5CiUlRU9G'
    }));
    store.items = Array.isArray(store.items) ? store.items.filter((item) => item.id !== id) : [];
    store.items.push({
      id,
      proposerUnit: '稽核室',
      proposerName: '張稽核員',
      proposerDate: new Date().toISOString().slice(0, 10),
      handlerUnit: unit,
      handlerName: '王經理',
      handlerDate: new Date().toISOString().slice(0, 10),
      deficiencyType: '主要缺失',
      source: '內部稽核',
      category: ['資訊'],
      clause: 'A.12.1',
      problemDesc: 'Stress test case for long timeline and many attachments.',
      occurrence: 'Generated by stress regression.',
      correctiveAction: 'Under verification.',
      correctiveDueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      rootCause: 'Regression coverage.',
      rootElimination: 'Automated monitoring.',
      rootElimDueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      riskDesc: '',
      riskAcceptor: '',
      riskAcceptDate: null,
      riskAssessDate: null,
      reviewResult: '',
      reviewer: '',
      reviewDate: null,
      trackings: [],
      pendingTracking: null,
      status: '追蹤中',
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
      closedDate: null,
      evidence,
      history
    });
    localStorage.setItem('cats_data', JSON.stringify({ version: 1, payload: store }));
  }, { id: CASE_ID, unit: TARGET_UNIT });
}

(async () => {
  buildLargeCsv(320);
  const results = createResultEnvelope({
    steps: [],
    artifacts: [{ type: 'fixture', path: LARGE_CSV_PATH, kind: 'csv' }]
  });
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  attachDiagnostics(page, results);

  try {
    await resetApp(page);

    await runStep(results, 'STRESS-01', 'Admin', 'Import 320-row roster CSV', async () => {
      await login(page, 'admin', 'admin123');
      await cleanupImportedRosters(page, ROSTER_PREFIX);
      await gotoHash(page, 'training-roster');
      await page.click('#training-roster-toggle-import');
      await page.waitForSelector('#training-import-form', { state: 'visible', timeout: 15000 });
      await chooseUnit(page, 'training-import-unit', TARGET_UNIT);
      await page.setInputFiles('#training-import-file', LARGE_CSV_PATH);
      const responses = await captureRosterBatchResponses(page, Math.ceil(320 / TRAINING_IMPORT_CHUNK_SIZE), async () => {
        await page.click('[data-testid="training-import-submit"]');
      });
      const failedResponses = responses.filter((response) => !response.ok || response.status >= 400);
      if (failedResponses.length) {
        throw new Error(`training roster batch request failed: ${JSON.stringify(failedResponses.slice(0, 2), null, 2)}`);
      }
      await page.waitForFunction((prefix) => {
        return Array.from(document.querySelectorAll('tbody tr')).filter((row) => String(row.textContent || '').includes(prefix)).length >= 320;
      }, ROSTER_PREFIX, { timeout: 180000 });
      const store = await getTrainingStore(page);
      const imported = (store.rosters || []).filter((entry) => String(entry.name || '').startsWith(ROSTER_PREFIX));
      if (imported.length !== 320) throw new Error(`expected 320 imported rows, got ${imported.length}`);
      await saveScreenshot(results, page, 'stress-large-roster.png');
      return `${imported.length} rows imported`;
    });

    await runStep(results, 'STRESS-02', 'Admin', 'Render training fill with hundreds of rows', async () => {
      await gotoHash(page, 'training-fill');
      await page.waitForSelector('[data-testid="training-form"]');
      await page.fill('#tr-phone', '02-3366-9999');
      await page.fill('#tr-email', 'stress@g.ntu.edu.tw');
      await page.waitForFunction((prefix) => {
        return Array.from(document.querySelectorAll('#training-rows-body tr')).filter((row) => String(row.textContent || '').includes(prefix)).length >= 320;
      }, ROSTER_PREFIX, { timeout: 180000 });
      const rowCount = await page.locator('#training-rows-body tr').count();
      if (rowCount < 320) throw new Error(`expected at least 320 rows, got ${rowCount}`);
      await saveScreenshot(results, page, 'stress-training-fill.png');
      return `rendered ${rowCount} rows`;
    });

    await runStep(results, 'STRESS-03', 'Admin', 'Open long-history case detail with many attachments', async () => {
      await seedLongCase(page);
      await gotoHash(page, 'detail/' + CASE_ID);
      await page.waitForSelector('.timeline-item');
      await page.waitForSelector('.file-preview-item');
      const metrics = await page.evaluate(() => ({
        historyCount: document.querySelectorAll('.timeline-item').length,
        evidenceCount: document.querySelectorAll('.file-preview-item').length,
        scrollHeight: document.documentElement.scrollHeight
      }));
      if (metrics.historyCount < 120) throw new Error(`history too short: ${metrics.historyCount}`);
      if (metrics.evidenceCount < 18) throw new Error(`evidence too short: ${metrics.evidenceCount}`);
      await saveScreenshot(results, page, 'stress-case-detail.png');
      return JSON.stringify(metrics);
    });
  } finally {
    try {
      await login(page, 'admin', 'admin123');
      await cleanupImportedRosters(page, ROSTER_PREFIX);
    } catch (_) {}
    await browser.close();
    const finalized = finalizeResults(results);
    writeJson(RESULT_PATH, finalized);
    if (finalized.summary.failed || finalized.summary.pageErrors) process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});

