const path = require('path');
const {
  attachDiagnostics,
  createArtifactRun,
  createResultEnvelope,
  finalizeResults,
  gotoHash,
  launchBrowser,
  resetApp,
  runStep,
  writeJson
} = require('./_role-test-utils.cjs');

const OUT_DIR = createArtifactRun('unit-contact-public-smoke').outDir;
const RESULT_PATH = path.join(OUT_DIR, 'unit-contact-public-smoke.json');

(async () => {
  const results = createResultEnvelope({ steps: [] });
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  attachDiagnostics(page, results);

  try {
    await resetApp(page);

    const uniqueEmail = `unit-contact-${Date.now()}@gmail.com`;
    let createdId = '';

    await runStep(results, 'UNIT-CONTACT-PUBLIC-1', 'public', '顯示公開申請頁', async () => {
      await gotoHash(page, 'apply-unit-contact', { handleUnsaved: false });
      await page.waitForSelector('[data-testid="unit-contact-apply-form"]', { timeout: 15000 });
      const title = await page.locator('.page-title').first().textContent();
      if (!String(title || '').includes('申請單位管理人帳號')) {
        throw new Error('apply title mismatch: ' + title);
      }
      return 'public application form visible';
    });

    await runStep(results, 'UNIT-CONTACT-PUBLIC-2', 'public', '送出公開申請', async () => {
      const categoryOptions = await page.locator('#uca-unit-category option').evaluateAll((options) => options.map((entry) => ({
        value: entry.value,
        text: String(entry.textContent || '').trim()
      })));
      const targetCategory = categoryOptions.find((entry) => entry.value);
      if (!targetCategory) throw new Error('no unit category options found');
      await page.selectOption('#uca-unit-category', targetCategory.value);
      await page.waitForTimeout(150);

      const parentOptions = await page.locator('#uca-unit-parent option').evaluateAll((options) => options.map((entry) => ({
        value: entry.value,
        text: String(entry.textContent || '').trim()
      })));
      const targetParent = parentOptions.find((entry) => entry.value);
      if (!targetParent) throw new Error('no primary unit options found');
      await page.selectOption('#uca-unit-parent', targetParent.value);
      await page.waitForTimeout(150);

      const childDisabled = await page.locator('#uca-unit-child').isDisabled();
      if (!childDisabled) {
        const childOptions = await page.locator('#uca-unit-child option').evaluateAll((options) => options.map((entry) => ({
          value: entry.value,
          text: String(entry.textContent || '').trim()
        })));
        const targetChild = childOptions.find((entry) => entry.value);
        if (targetChild) await page.selectOption('#uca-unit-child', targetChild.value);
      }

      await page.fill('[data-testid="unit-contact-name"]', '公開申請測試');
      await page.fill('[data-testid="unit-contact-extension"]', '61234');
      await page.fill('[data-testid="unit-contact-email"]', uniqueEmail);
      await page.fill('[data-testid="unit-contact-note"]', 'public smoke');
      await page.click('[data-testid="unit-contact-submit"]');
      await page.waitForURL(/#apply-unit-contact-success\//, { timeout: 15000 });
      createdId = await page.locator('.unit-contact-summary-grid strong').first().textContent();
      if (!String(createdId || '').startsWith('UCA-')) {
        throw new Error('application id not generated: ' + createdId);
      }
      return 'created ' + createdId;
    });

    await runStep(results, 'UNIT-CONTACT-PUBLIC-3', 'public', '查詢申請進度', async () => {
      await gotoHash(page, 'apply-unit-contact-status', { handleUnsaved: false });
      await page.waitForSelector('#uca-status-email', { timeout: 15000 });
      await page.fill('#uca-status-email', uniqueEmail);
      await page.locator('#unit-contact-status-form').evaluate((form) => form.requestSubmit());
      await page.waitForSelector('.unit-contact-status-card', { timeout: 15000 });
      const bodyText = await page.locator('.unit-contact-status-card').first().textContent();
      if (!String(bodyText || '').includes(createdId)) {
        throw new Error('status result does not contain application id');
      }
      return 'lookup returned ' + createdId;
    });
  } finally {
    await browser.close();
    writeJson(RESULT_PATH, finalizeResults(results));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
