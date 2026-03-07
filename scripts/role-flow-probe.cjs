const path = require('path');
const {
  attachDiagnostics,
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

const OUT_DIR = path.join(process.cwd(), 'test-artifacts', 'role-flow-round3-2026-03-07');
const RESULT_PATH = path.join(OUT_DIR, 'flow-probe.json');

async function setChoice(page, testId, checked = true) {
  await page.evaluate(({ testId, checked }) => {
    const input = document.querySelector(`[data-testid="${testId}"]`);
    if (!input) throw new Error(`missing choice ${testId}`);
    input.checked = checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, { testId, checked });
}

(async () => {
  const results = createResultEnvelope({
    steps: [],
    context: {
      admin: { username: 'admin', password: 'admin123' },
      unitAdmin: { username: 'unit1', password: 'unit123' },
      reporter: { username: 'user1', password: 'user123' }
    }
  });
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  attachDiagnostics(page, results);
  let carId = null;
  try {
    await resetApp(page);

    await runStep(results, 'PROBE-UA-01', '單位管理員', '建立矯正單', async () => {
      await login(page, results.context.unitAdmin.username, results.context.unitAdmin.password);
      await gotoHash(page, 'create');
      await page.waitForSelector('[data-testid="create-form"]');
      await page.fill('[data-testid="create-id"]', 'CAR-PROBE-' + Date.now());
      await page.selectOption('#f-hunit-parent', '計算機及資訊網路中心');
      await page.waitForTimeout(120);
      await page.selectOption('#f-hunit-child', '資訊網路組');
      await page.waitForTimeout(120);
      await page.evaluate(() => {
        const select = document.querySelector('[data-testid="create-handler-name"]');
        const target = Array.from(select.options).find((option) => option.dataset.username === 'user1');
        if (!target) throw new Error('missing handler option user1');
        select.value = target.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await setChoice(page, 'defType-input-0');
      await setChoice(page, 'source-input-0');
      await setChoice(page, 'category-input-0', true);
      await page.fill('[data-testid="create-problem"]', 'Flow probe problem');
      await page.fill('[data-testid="create-occurrence"]', 'Flow probe occurrence');
      await page.fill('[data-testid="create-due"]', new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0]);
      await Promise.all([
        page.waitForFunction(() => window.location.hash.startsWith('#detail/'), { timeout: 8000 }),
        page.click('[data-testid="create-submit"]')
      ]);
      carId = (await currentHash(page)).split('/')[1];
      if (!carId) throw new Error('missing created car id');
      await logout(page);
      return carId;
    });

    await runStep(results, 'PROBE-RP-01', '填報者', '回填矯正措施', async () => {
      if (!carId) throw new Error('missing car id from create step');
      await login(page, results.context.reporter.username, results.context.reporter.password);
      await gotoHash(page, 'respond/' + carId);
      await page.waitForSelector('[data-testid="respond-form"]');
      await page.fill('[data-testid="respond-action"]', 'Flow probe corrective action');
      await page.fill('[data-testid="respond-due"]', new Date(Date.now() + 86400000 * 10).toISOString().split('T')[0]);
      await page.fill('[data-testid="respond-root-cause"]', 'Flow probe root cause');
      await page.fill('[data-testid="respond-root-elimination"]', 'Flow probe elimination');
      await Promise.all([
        waitForHash(page, '#detail/' + carId),
        page.click('[data-testid="respond-submit"]')
      ]);
      await logout(page);
      return carId;
    });

    await runStep(results, 'PROBE-ADM-01', '最高管理者', '管理頁與案件查核', async () => {
      if (!carId) throw new Error('missing car id from previous steps');
      await login(page, results.context.admin.username, results.context.admin.password);
      await gotoHash(page, 'detail/' + carId);
      await page.waitForTimeout(220);
      const detailHash = await currentHash(page);
      if (detailHash !== '#detail/' + carId) throw new Error('admin cannot open detail hash: ' + detailHash);
      await gotoHash(page, 'users');
      if ((await currentHash(page)) !== '#users') throw new Error('admin cannot open users route');
      await gotoHash(page, 'training-roster');
      if ((await currentHash(page)) !== '#training-roster') throw new Error('admin cannot open training-roster route');
      await logout(page);
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
