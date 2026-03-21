const fs = require('fs');
const path = require('path');
const {
  attachDiagnostics,
  createArtifactRun,
  createResultEnvelope,
  finalizeResults,
  gotoHash,
  launchBrowser,
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
const ROSTER_PREFIX = 'STRESS-ROSTER-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6) + '-';
const CASE_ID = 'CAR-STRESS-LONG';
const TRAINING_IMPORT_CHUNK_SIZE = 40;
const BASE_URL = process.env.TEST_BASE_URL || process.env.ISMS_LIVE_BASE || 'http://127.0.0.1:8088/';

fs.mkdirSync(SHOT_DIR, { recursive: true });

function buildLargeCsv(rowCount) {
  const lines = ['姓名,本職單位,身分別,職稱,填報單位'];
  for (let index = 1; index <= rowCount; index += 1) {
    const name = `${ROSTER_PREFIX}${String(index).padStart(3, '0')}`;
    lines.push(`${name},${TARGET_UNIT},職員,工程師,${TARGET_UNIT}`);
  }
  fs.writeFileSync(LARGE_CSV_PATH, lines.join('\r\n'));
}

async function saveScreenshot(results, page, fileName, options) {
  const filePath = path.join(SHOT_DIR, fileName);
  const shotOptions = Object.assign({ path: filePath, fullPage: false }, options || {});
  await page.screenshot(shotOptions);
  results.artifacts.push({ type: 'screenshot', path: filePath });
}

async function chooseUnit(page, baseId, fullUnit) {
  const query = String(fullUnit || '').trim();
  if (!query) throw new Error(`missing unit value for ${baseId}`);

  await page.waitForSelector(`#${baseId}`, { state: 'attached', timeout: 30000 });

  const directSelected = await page.evaluate(({ baseId: inputId, query: targetValue }) => {
    const hidden = document.getElementById(inputId);
    const search = document.getElementById(`${inputId}-search`);
    const searchResults = document.getElementById(`${inputId}-search-results`);
    const category = document.getElementById(`${inputId}-category`);
    const parent = document.getElementById(`${inputId}-parent`);
    const child = document.getElementById(`${inputId}-child`);
    if (!hidden) return false;

    const unitModule = window._unitModule;
    if (unitModule && typeof unitModule.splitUnitValue === 'function' && typeof unitModule.categorizeTopLevelUnit === 'function' && typeof unitModule.composeUnitValue === 'function') {
      const parsed = unitModule.splitUnitValue(targetValue);
      const categoryValue = parsed.parent ? unitModule.categorizeTopLevelUnit(parsed.parent) : '';
      if (category && categoryValue) category.value = categoryValue;
      if (parent && parsed.parent) parent.value = parsed.parent;
      if (child && parsed.child) child.value = parsed.child;
      if (parent) parent.dispatchEvent(new Event('change', { bubbles: true }));
      if (child) child.dispatchEvent(new Event('change', { bubbles: true }));
      hidden.value = unitModule.composeUnitValue(parsed.parent, parsed.child);
    } else {
      hidden.value = targetValue;
    }

    if (search) search.value = targetValue;
    if (searchResults) searchResults.hidden = true;
    hidden.dispatchEvent(new Event('input', { bubbles: true }));
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
    return String(hidden.value || '').trim() === targetValue;
  }, { baseId, query });
  if (!directSelected) throw new Error(`unable to select unit ${query} in ${baseId}`);

  await page.waitForFunction(({ baseId, fullUnit }) => {
    const hidden = document.getElementById(baseId);
    return !!hidden && String(hidden.value || '').trim() === String(fullUnit || '').trim();
  }, { baseId, fullUnit }, { timeout: 30000 });
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

async function loginDirect(page, username, password) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="login-form"]', { timeout: 30000 });
  await page.fill('[data-testid="login-user"]', username);
  await page.fill('[data-testid="login-pass"]', password);
  await Promise.all([
    page.waitForFunction(() => !!window._authModule?.currentUser?.()?.sessionToken, { timeout: 30000 }),
    page.locator('[data-testid="login-form"]').evaluate((form) => form.requestSubmit())
  ]);
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

async function waitForTrainingRosterImport(page, expectedCount, action) {
  await page.evaluate(() => {
    if (window.__stressRosterFetchPatched) return;
    window.__stressRosterFetchPatched = true;
    window.__stressRosterFetchLogs = [];
    const origFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const [input, init] = args;
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = String(init && init.method || 'GET').toUpperCase();
      if (String(url).includes('/api/training/rosters')) {
        window.__stressRosterFetchLogs.push({ phase: 'request', url, method, at: Date.now() });
      }
      const response = await origFetch(...args);
      if (String(url).includes('/api/training/rosters')) {
        window.__stressRosterFetchLogs.push({ phase: 'response', url, method, status: response.status, ok: response.ok, at: Date.now() });
      }
      return response;
    };
  });
  await action();
  await page.waitForTimeout(5000);
  return await page.evaluate(() => Array.isArray(window.__stressRosterFetchLogs) ? window.__stressRosterFetchLogs.slice() : []);
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
      await loginDirect(page, 'admin', 'admin123');
      await cleanupImportedRosters(page, ROSTER_PREFIX);
      await gotoHash(page, 'training-roster');
      await page.waitForSelector('#training-roster-toggle-import', { state: 'visible', timeout: 30000 });
      await page.waitForFunction(() => !!window._m365ApiClient, { timeout: 30000 });
      const csvText = fs.readFileSync(LARGE_CSV_PATH, 'utf8');
      const csvRows = csvText.trim().split(/\r?\n/);
      const dataRows = csvRows.slice(1).filter(Boolean).map((line) => {
        const parts = line.split(',');
        return {
          name: String(parts[0] || '').trim(),
          unitName: String(parts[1] || '').trim(),
          identity: String(parts[2] || '').trim(),
          jobTitle: String(parts[3] || '').trim(),
          unit: String(parts[4] || TARGET_UNIT).trim() || TARGET_UNIT
        };
      });
      const batchResults = await page.evaluate(async ({ items, actorName, actorUsername, chunkSize, concurrency }) => {
        const client = window._m365ApiClient;
        if (!client || typeof client.upsertTrainingRosterBatch !== 'function') {
          throw new Error('training client API unavailable');
        }
        const chunks = [];
        for (let start = 0; start < items.length; start += chunkSize) {
          chunks.push({
            index: chunks.length,
            items: items.slice(start, start + chunkSize)
          });
        }
        const results = new Array(chunks.length);
        let nextIndex = 0;
        const limit = Math.max(1, Number(concurrency) || 1);
        async function next() {
          while (nextIndex < chunks.length) {
            const currentIndex = nextIndex++;
            const chunk = chunks[currentIndex];
            try {
              const response = await client.upsertTrainingRosterBatch({
                items: chunk.items,
                actorName,
                actorUsername
              });
              results[currentIndex] = response;
            } catch (error) {
              results[currentIndex] = { error: String(error && error.message || error || '匯入失敗') };
            }
          }
        }
        await Promise.all(Array.from({ length: Math.min(limit, chunks.length) }, next));
        return results.map((item) => item && item.error
          ? { error: item.error }
          : ({
              mode: item && item.mode || '',
              added: Number(item && item.summary && item.summary.added || 0),
              updated: Number(item && item.summary && item.summary.updated || 0),
              skipped: Number(item && item.summary && item.summary.skipped || 0),
              failed: Number(item && item.summary && item.summary.failed || 0),
              items: Array.isArray(item && item.items) ? item.items.length : 0
            }));
      }, { items: dataRows, actorName: 'admin', actorUsername: 'admin', chunkSize: TRAINING_IMPORT_CHUNK_SIZE, concurrency: 2 });
      if (!Array.isArray(batchResults) || !batchResults.length) {
        throw new Error('training roster batch import returned no results');
      }
      const remoteCalls = batchResults.filter((item) => item.mode === 'm365-api');
      if (!remoteCalls.length) {
        throw new Error(`training roster batch import did not hit remote path: ${JSON.stringify(batchResults, null, 2)}`);
      }
      const failedBatches = batchResults.filter((item) => item.error || Number(item.failed || 0) > 0);
      if (failedBatches.length) {
        throw new Error(`training roster batch import reported failures: ${JSON.stringify(failedBatches.slice(0, 2), null, 2)}`);
      }
      const totalAdded = batchResults.reduce((sum, item) => sum + Number(item.added || 0), 0);
      const totalUpdated = batchResults.reduce((sum, item) => sum + Number(item.updated || 0), 0);
      const totalSkipped = batchResults.reduce((sum, item) => sum + Number(item.skipped || 0), 0);
      await saveScreenshot(results, page, 'stress-large-roster.png', { fullPage: false });
      return `batches=${batchResults.length}, added=${totalAdded}, updated=${totalUpdated}, skipped=${totalSkipped}`;
    });

    await runStep(results, 'STRESS-02', 'Admin', 'Render training fill with hundreds of rows', async () => {
      await gotoHash(page, 'training-fill/unit:' + encodeURIComponent(TARGET_UNIT));
      await page.waitForFunction(() => {
        const form = document.querySelector('[data-testid="training-form"]');
        const title = String(document.querySelector('.page-title')?.textContent || '');
        return !!form && title.includes('填報資安教育訓練統計');
      }, { timeout: 120000 });
      await page.waitForFunction((targetUnit) => {
        const hidden = document.getElementById('tr-unit');
        return !!hidden && String(hidden.value || '').trim() === String(targetUnit || '').trim();
      }, TARGET_UNIT, { timeout: 60000 });
      const currentUnit = await page.evaluate(() => String(document.getElementById('tr-unit')?.value || '').trim());
      if (currentUnit !== TARGET_UNIT) {
        await chooseUnit(page, 'tr-unit', TARGET_UNIT);
      }
      await page.fill('#tr-phone', '02-3366-9999');
      await page.fill('#tr-email', 'stress@g.ntu.edu.tw');
      await page.fill('#training-search', ROSTER_PREFIX);
      await page.waitForFunction((prefix) => {
        const rows = Array.from(document.querySelectorAll('#training-rows-body tr'));
        return rows.filter((row) => String(row.textContent || '').includes(prefix)).length >= 320;
      }, ROSTER_PREFIX, { timeout: 180000 });
      const rowCount = await page.locator('#training-rows-body tr').count();
      if (rowCount < 320) throw new Error(`expected at least 320 rows, got ${rowCount}`);
      await saveScreenshot(results, page, 'stress-training-fill.png');
      return `rendered ${rowCount} rows`;
    });

    await runStep(results, 'STRESS-03', 'Admin', 'Open long-history case detail with many attachments', async () => {
      await seedLongCase(page);
      await gotoHash(page, 'detail/' + CASE_ID);
      await page.waitForSelector('.timeline-item', { state: 'visible', timeout: 120000 });
      await page.waitForSelector('.file-preview-item', { state: 'visible', timeout: 120000 });
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
      await loginDirect(page, 'admin', 'admin123');
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

