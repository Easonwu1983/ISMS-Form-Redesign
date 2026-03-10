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
  resetApp,
  runStep,
  waitForHash,
  writeJson
} = require('./_role-test-utils.cjs');

const OUT_DIR = createArtifactRun('role-flow-focus').outDir;
const RESULT_PATH = path.join(OUT_DIR, 'admin-reporter-regression.json');
const FILE_PATH = path.join(process.cwd(), 'favicon.svg');

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
  try {
    await resetApp(page);

    await runStep(results, 'FOCUS-ADM-01', '最高管理者', '建立矯正單', async () => {
      await login(page, results.context.admin.username, results.context.admin.password);
      await gotoHash(page, 'create');
      await page.waitForSelector('#create-form');
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
        page.click('#create-form button[type="submit"]')
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
        page.click('#respond-form button[type="submit"]')
      ]);
      const item = await page.evaluate((id) => JSON.parse(localStorage.getItem('cats_data')).items.find((entry) => entry.id === id), carId);
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
      await page.locator('button.btn-primary[onclick*="_cs"]').first().click();
      await page.waitForTimeout(250);
      await page.locator('button.btn-warning[onclick*="_cs"]').first().click();
      await page.waitForTimeout(250);
      const item = await page.evaluate((id) => JSON.parse(localStorage.getItem('cats_data')).items.find((entry) => entry.id === id), carId);
      if (item.pendingTracking) throw new Error('pendingTracking should be empty before reporter submission');
      return carId;
    });
    await logout(page);

    await runStep(results, 'FOCUS-RP-02', '單位窗口', '送出追蹤提報', async () => {
      if (!carId) throw new Error('missing car id');
      await login(page, results.context.reporter.username, results.context.reporter.password);
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
      await Promise.all([
        waitForHash(page, '#detail/' + carId),
        page.click('#track-form button[type="submit"]')
      ]);
      const item = await page.evaluate((id) => JSON.parse(localStorage.getItem('cats_data')).items.find((entry) => entry.id === id), carId);
      if (!item.pendingTracking) throw new Error('pendingTracking missing after tracking submit');
      return carId;
    });
    await logout(page);

    await runStep(results, 'FOCUS-ADM-03', '最高管理者', '審核追蹤並結案', async () => {
      if (!carId) throw new Error('missing car id');
      await login(page, results.context.admin.username, results.context.admin.password);
      await gotoHash(page, 'detail/' + carId);
      await page.waitForSelector('.detail-header');
      await page.locator('button.btn-success[onclick*="_reviewTracking"]').first().click();
      await page.waitForTimeout(300);
      const item = await page.evaluate((id) => JSON.parse(localStorage.getItem('cats_data')).items.find((entry) => entry.id === id), carId);
      if (!item.closedDate) throw new Error('closedDate missing after final approval');
      if (item.pendingTracking) throw new Error('pendingTracking should be cleared after final approval');
      return carId;
    });
  } finally {
    await browser.close();
    writeJson(RESULT_PATH, finalizeResults(results));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
