const fs = require('fs');
const path = require('path');
const {
  attachDiagnostics,
  chooseUnitForHandlerUsername,
  createArtifactRun,
  createResultEnvelope,
  currentHash,
  finalizeResults,
  gotoHash,
  launchBrowser,
  login,
  logout,
  readJsonFromStorage,
  resetApp,
  runStep,
  waitForHash,
  writeJson
} = require('./_role-test-utils.cjs');

const OUT_DIR = createArtifactRun('role-flow-focus').outDir;
const RESULT_PATH = path.join(OUT_DIR, 'admin-reporter-regression.json');
const FILE_PATH = path.join(process.cwd(), 'local-preview.png');

async function getDataStore(page) {
  return await readJsonFromStorage(page, 'cats_data') || { items: [] };
}

async function confirmNextModal(page, timeout = 8000) {
  const confirm = page.locator('[data-modal-confirm]');
  await confirm.waitFor({ state: 'visible', timeout });
  await confirm.click();
  await page.waitForTimeout(180);
}

async function waitForCaseStatus(page, caseId, expectedStatus, timeout = 15000) {
  await page.waitForFunction(({ storageKey, targetId, status }) => {
    try {
      const dataModule = window._dataModule;
      const parsed = dataModule && typeof dataModule.loadData === 'function'
        ? dataModule.loadData()
        : null;
      const items = Array.isArray(parsed && parsed.items) ? parsed.items : [];
      const item = items.find((entry) => entry && entry.id === targetId);
      return !!item && String(item.status || '').trim() === status;
    } catch (error) {
      return false;
    }
  }, { storageKey: 'cats_data', targetId: caseId, status: expectedStatus }, { timeout });
}

(async () => {
  const results = createResultEnvelope({
    steps: [],
    context: {
      admin: { username: 'admin', password: 'admin123' },
      reporter: { username: 'unit1', password: 'unit123' }
    }
  });
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  attachDiagnostics(page, results);
  let carId = null;
  const uniqueCarId = `CAR-777-FOCUS-${Date.now()}`;
  try {
    await resetApp(page);

    await runStep(results, 'FOCUS-ADM-01', '最高管理者', '建立矯正單', async () => {
      await login(page, results.context.admin.username, results.context.admin.password);
      await gotoHash(page, 'create');
      await page.waitForSelector('#create-form');
      await page.fill('#f-id', uniqueCarId);
      await chooseUnitForHandlerUsername(page, 'f-hunit', 'f-hname', 'unit1');
      await page.evaluate(() => {
        const select = document.querySelector('#f-hname');
        const target = Array.from(select.options).find((option) => option.dataset.username === 'unit1');
        if (!target) throw new Error('missing handler option unit1');
        select.value = target.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.fill('#f-problem', '焦點回歸：管理者開單與填報者回填主線。');
      await page.fill('#f-occurrence', '驗證最關鍵的開單、回填、追蹤與結案流程。');
      await page.fill('#f-due', new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10));
      await page.evaluate(() => {
        ['defType', 'source', 'category'].forEach((name) => {
          const input = document.querySelector(`input[name="${name}"]`);
          if (!input) throw new Error('missing ' + name);
          input.checked = true;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
      await Promise.all([
        page.waitForFunction(() => window.location.hash.startsWith('#detail/'), { timeout: 8000 }),
        page.click('[data-testid="create-submit"]')
      ]);
      carId = decodeURIComponent((await currentHash(page)).replace(/^#detail\//, ''));
      if (!/^CAR-\d{3}-[A-Z0-9]+-\d+$/.test(carId)) {
        throw new Error('unexpected generated car id ' + carId);
      }
      return carId;
    });
    await logout(page);

    await runStep(results, 'FOCUS-RP-01', '單位窗口', '回填矯正措施', async () => {
      if (!carId) throw new Error('missing car id');
      await login(page, results.context.reporter.username, results.context.reporter.password);
      await gotoHash(page, 'respond/' + carId);
      await page.waitForSelector('#respond-form');
      await page.fill('#r-action', '單位窗口完成矯正措施填報');
      await page.fill('#r-due', new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10));
      await page.fill('#r-root', '根因分析測試資料');
      await page.fill('#r-elim', '根因消除措施測試資料');
      await Promise.all([
        waitForHash(page, '#detail/' + carId),
        page.click('[data-testid="respond-submit"]')
      ]);
      const item = (await getDataStore(page)).items.find((entry) => entry.id === carId);
      if (!item.correctiveAction || !item.rootCause || !item.rootElimination) {
        throw new Error('response fields were not persisted');
      }
      return carId;
    });
    await logout(page);

    await runStep(results, 'FOCUS-ADM-02', '最高管理者', '進入審核並轉為追蹤', async () => {
      if (!carId) throw new Error('missing car id');
      await login(page, results.context.admin.username, results.context.admin.password);
      await gotoHash(page, 'detail/' + carId);
      await page.waitForSelector('.detail-header');
      await page.click('[data-testid="case-transition-review"]');
      await confirmNextModal(page);
      await page.waitForSelector('[data-testid="case-transition-tracking"]', { state: 'visible', timeout: 15000 });
      await page.click('[data-testid="case-transition-tracking"]');
      await confirmNextModal(page);
      await waitForCaseStatus(page, carId, '追蹤中', 15000);
      const item = (await getDataStore(page)).items.find((entry) => entry.id === carId);
      if (item.pendingTracking) throw new Error('pendingTracking should be empty before reporter submission');
      return carId;
    });
    await logout(page);

    await runStep(results, 'FOCUS-RP-02', '單位窗口', '送出追蹤提報', async () => {
      if (!carId) throw new Error('missing car id');
      await login(page, results.context.reporter.username, results.context.reporter.password);
      await waitForCaseStatus(page, carId, '追蹤中', 15000);
      await gotoHash(page, 'tracking/' + carId);
      await page.waitForSelector('#track-form');
      await page.fill('#tk-exec', '追蹤執行情形測試資料');
      await page.fill('#tk-note', '建議結案');
      await page.evaluate(() => {
        const option = document.querySelector('input[name="tkResult"]');
        if (!option) throw new Error('missing tkResult');
        option.checked = true;
        option.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.setInputFiles('#tk-file-input', FILE_PATH);
      await page.waitForFunction(() => document.querySelectorAll('#tk-file-previews .file-preview-item').length === 1);
      await Promise.all([
        waitForHash(page, '#detail/' + carId),
        page.click('[data-testid="tracking-submit"]')
      ]);
      await waitForCaseStatus(page, carId, '追蹤中', 15000);
      await page.waitForFunction(({ targetId }) => {
        try {
          const dataModule = window._dataModule;
          const parsed = dataModule && typeof dataModule.loadData === 'function'
            ? dataModule.loadData()
            : null;
          const items = Array.isArray(parsed && parsed.items) ? parsed.items : [];
          const item = items.find((entry) => entry && entry.id === targetId);
          return !!item && !!item.pendingTracking;
        } catch (error) {
          return false;
        }
      }, { targetId: carId }, { timeout: 15000 });
      const item = (await getDataStore(page)).items.find((entry) => entry.id === carId);
      if (!item.pendingTracking) throw new Error('pendingTracking missing after tracking submit');
      return carId;
    });
    await logout(page);

    await runStep(results, 'FOCUS-ADM-03', '最高管理者', '審核追蹤並結案', async () => {
      if (!carId) throw new Error('missing car id');
      await login(page, results.context.admin.username, results.context.admin.password);
      await gotoHash(page, 'detail/' + carId);
      await page.waitForSelector('.detail-header');
      await page.waitForSelector('[data-testid="case-tracking-approve-close"]', { state: 'visible', timeout: 15000 });
      const reviewResponsePromise = page.waitForResponse((response) => {
        return response.request().method() === 'POST'
          && response.url().includes('/tracking-review');
      }, { timeout: 15000 });
      await page.click('[data-testid="case-tracking-approve-close"]');
      const reviewResponse = await reviewResponsePromise;
      if (!reviewResponse.ok()) throw new Error(`tracking-review failed with ${reviewResponse.status()}`);
      const reviewPayload = await reviewResponse.json().catch(() => null);
      const reviewedItem = reviewPayload && (reviewPayload.item || reviewPayload.data || reviewPayload.result || reviewPayload);
      if (!reviewedItem || !reviewedItem.closedDate) throw new Error('closedDate missing in tracking-review response');
      await gotoHash(page, 'detail/' + carId);
      await page.waitForSelector('.detail-header');
      const item = (await getDataStore(page)).items.find((entry) => entry.id === carId);
      if (item && item.pendingTracking) throw new Error('pendingTracking should be cleared after final approval');
      return carId;
    });
  } finally {
    await browser.close();
    const finalized = finalizeResults(results);
    writeJson(RESULT_PATH, finalized);
    if (finalized.summary.failed || finalized.summary.pageErrors) {
      process.exitCode = 1;
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
