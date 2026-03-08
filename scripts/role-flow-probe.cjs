const path = require('path');
const {
  attachDiagnostics,
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

const OUT_DIR = createArtifactRun('role-flow-regression').outDir;
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

async function chooseUnitForHandlerUsername(page, baseId, handlerSelectId, username) {
  await page.evaluate(({ baseId, handlerSelectId, username }) => {
    const parentSelect = document.getElementById(baseId + '-parent');
    const childSelect = document.getElementById(baseId + '-child');
    const handlerSelect = document.getElementById(handlerSelectId);
    if (!parentSelect || !childSelect || !handlerSelect) {
      throw new Error(`Missing create-form selects for ${baseId}`);
    }
    const optionsWithoutPlaceholder = (select) => Array.from(select.options).filter((entry) => entry.value);
    for (const parentOption of optionsWithoutPlaceholder(parentSelect)) {
      parentSelect.value = parentOption.value;
      parentSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const childOptions = optionsWithoutPlaceholder(childSelect);
      if (!childOptions.length) {
        const handlerOption = Array.from(handlerSelect.options).find((entry) => entry.dataset.username === username);
        if (handlerOption) return;
      }
      for (const childOption of childOptions) {
        childSelect.value = childOption.value;
        childSelect.dispatchEvent(new Event('change', { bubbles: true }));
        const handlerOption = Array.from(handlerSelect.options).find((entry) => entry.dataset.username === username);
        if (handlerOption) return;
      }
    }
    const availableHandlers = Array.from(handlerSelect.options).map((entry) => ({
      text: entry.textContent || '',
      username: entry.dataset.username || ''
    }));
    throw new Error(`Unable to find handler ${username}: ${JSON.stringify(availableHandlers)}`);
  }, { baseId, handlerSelectId, username });
  await page.waitForTimeout(180);
}

(async () => {
  const results = createResultEnvelope({
    steps: [],
    context: {
      admin: { username: 'admin', password: 'admin123' },
      reporter: { username: 'unit1', password: 'unit123' },
      proxyReporter: { username: 'user1', password: 'user123' },
      viewer: { username: 'viewer1', password: 'viewer123' }
    }
  });
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  attachDiagnostics(page, results);
  let carId = null;
  try {
    await resetApp(page);

    await runStep(results, 'PROBE-ADM-01', '最高管理者', '建立矯正單', async () => {
      await login(page, results.context.admin.username, results.context.admin.password);
      await gotoHash(page, 'create');
      await page.waitForSelector('[data-testid="create-form"]');
      await chooseUnitForHandlerUsername(page, 'f-hunit', 'f-hname', 'unit1');
      await page.evaluate(() => {
        const select = document.querySelector('[data-testid="create-handler-name"]');
        const target = Array.from(select.options).find((option) => option.dataset.username === 'unit1');
        if (!target) throw new Error('missing handler option unit1');
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
      carId = decodeURIComponent((await currentHash(page)).replace(/^#detail\//, ''));
      if (!carId) throw new Error('missing created car id');
      if (!/^CAR-\d{3}-[A-Z0-9]+-\d+$/.test(carId)) throw new Error('unexpected generated car id ' + carId);
      await logout(page);
      return carId;
    });

    await runStep(results, 'PROBE-RP-01', '單位窗口', '回填矯正措施', async () => {
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

    await runStep(results, 'PROBE-RP-02', '單位窗口代理', '可檢視同單位案件', async () => {
      if (!carId) throw new Error('missing car id from previous steps');
      await login(page, results.context.proxyReporter.username, results.context.proxyReporter.password);
      await gotoHash(page, 'detail/' + carId);
      if ((await currentHash(page)) !== '#detail/' + carId) throw new Error('proxy reporter cannot open same-unit case');
      await logout(page);
      return carId;
    });

    await runStep(results, 'PROBE-VW-01', '跨單位檢視者', '可唯讀檢視並被阻擋填報', async () => {
      if (!carId) throw new Error('missing car id from previous steps');
      await login(page, results.context.viewer.username, results.context.viewer.password);
      await gotoHash(page, 'detail/' + carId);
      if ((await currentHash(page)) !== '#detail/' + carId) throw new Error('viewer cannot open cross-unit case');
      await gotoHash(page, 'checklist-fill');
      if ((await currentHash(page)) === '#checklist-fill') throw new Error('viewer reached checklist-fill');
      await gotoHash(page, 'training-fill');
      if ((await currentHash(page)) === '#training-fill') throw new Error('viewer reached training-fill');
      await logout(page);
      return carId;
    });

    await runStep(results, 'PROBE-ADM-02', '最高管理者', '可檢視案件與管理頁', async () => {
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
