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
  readJsonFromStorage,
  resetApp,
  runStep,
  writeJson
} = require('./_role-test-utils.cjs');

const runMeta = createArtifactRun('training-optimization-regression');
const RESULT_PATH = path.join(runMeta.outDir, 'training-optimization-regression.json');

function getTrainingStore(page) {
  return readJsonFromStorage(page, 'cats_training_hours');
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

  try {
    await resetApp(page);

    await runStep(results, 'OPT-01', '最高管理者', '單位選擇器支援 autocomplete 搜尋並自動帶入層級', async () => {
      await login(page, results.context.admin.username, results.context.admin.password);
      await gotoHash(page, 'training-roster');
      await page.waitForSelector('#training-import-unit-search');

      const target = await page.evaluate(() => {
        const categoryEl = document.getElementById('training-import-unit-category');
        const parentEl = document.getElementById('training-import-unit-parent');
        const childEl = document.getElementById('training-import-unit-child');
        const hiddenEl = document.getElementById('training-import-unit');
        if (!categoryEl || !parentEl || !childEl || !hiddenEl) {
          throw new Error('missing unit cascade controls');
        }

        const dispatch = (element) => element.dispatchEvent(new Event('change', { bubbles: true }));
        const values = (select) => Array.from(select.options).map((option) => String(option.value || '').trim()).filter(Boolean);

        for (const category of values(categoryEl)) {
          categoryEl.value = category;
          dispatch(categoryEl);
          for (const parent of values(parentEl)) {
            parentEl.value = parent;
            dispatch(parentEl);
            if (!childEl.disabled) {
              const children = values(childEl);
              if (children.length) {
                childEl.value = children[0];
                dispatch(childEl);
                return {
                  fullUnit: hiddenEl.value,
                  token: children[0].slice(0, 2) || parent.slice(0, 2)
                };
              }
            }
          }
        }

        throw new Error('unable to locate a searchable multi-level unit');
      });

      await page.fill('#training-import-unit-search', target.token);
      await page.waitForSelector('#training-import-unit-search-results [data-unit-value]');
      await page.click(`#training-import-unit-search-results [data-unit-value="${target.fullUnit}"]`);
      await page.waitForFunction((value) => {
        const hidden = document.getElementById('training-import-unit');
        return !!hidden && String(hidden.value || '').trim() === String(value || '').trim();
      }, target.fullUnit);

      const resolved = await page.evaluate(() => ({
        category: document.getElementById('training-import-unit-category')?.value || '',
        parent: document.getElementById('training-import-unit-parent')?.value || '',
        child: document.getElementById('training-import-unit-child')?.value || '',
        hidden: document.getElementById('training-import-unit')?.value || ''
      }));

      if (!resolved.category || !resolved.parent || !resolved.hidden) {
        throw new Error(`autocomplete did not populate hierarchy: ${JSON.stringify(resolved)}`);
      }

      return `autocomplete selected ${resolved.hidden}`;
    });

    await logout(page);

    await runStep(results, 'OPT-02', '填報人', '草稿可刪除自己手動新增的人員，流程一可撤回', async () => {
      await login(page, results.context.reporter.username, results.context.reporter.password);
      await gotoHash(page, 'training-fill');
      await page.waitForSelector('#training-form');

      await page.fill('#tr-phone', '02-3366-8888');
      await page.fill('#tr-email', 'unit1@g.ntu.edu.tw');
      await page.fill('#tr-year', '114');
      await page.fill('#tr-date', new Date().toISOString().slice(0, 10));

      await page.fill('#tr-new-name', '測試刪除人員');
      await page.fill('#tr-new-unit-name', '資訊網路組');
      await page.fill('#tr-new-identity', '職員');
      await page.fill('#tr-new-job-title', '工程師');
      await page.click('#training-add-person');
      await page.waitForFunction(() => Array.from(document.querySelectorAll('#training-rows-body tr')).some((row) => String(row.textContent || '').includes('測試刪除人員')));

      const deleteButtons = await page.locator('.training-row-delete').count();
      if (!deleteButtons) throw new Error('manual draft row does not expose delete action');
      await page.evaluate(() => { window.confirm = () => true; });
      await page.locator('.training-row-delete').first().click();
      await page.waitForFunction(() => !Array.from(document.querySelectorAll('#training-rows-body tr')).some((row) => String(row.textContent || '').includes('測試刪除人員')));

      await page.fill('#tr-new-name', '流程撤回人員');
      await page.fill('#tr-new-unit-name', '資訊網路組');
      await page.fill('#tr-new-identity', '職員');
      await page.fill('#tr-new-job-title', '分析師');
      await page.click('#training-add-person');
      await page.waitForFunction(() => Array.from(document.querySelectorAll('#training-rows-body tr')).some((row) => String(row.textContent || '').includes('流程撤回人員')));

      const rowCount = await page.locator('select[data-field="status"]').count();
      for (let index = 0; index < rowCount; index += 1) {
        await page.locator(`select[data-idx="${index}"][data-field="status"]`).selectOption({ index: 1 });
        await page.locator(`button[data-idx="${index}"][data-field="completedGeneral"][data-value="是"]`).click();
        await page.locator(`select[data-idx="${index}"][data-field="isInfoStaff"]`).selectOption({ index: 2 });
      }

      await page.click('#training-form button[type="submit"]');
      await page.waitForFunction(() => String(window.location.hash || '').startsWith('#training-detail/'));
      const trainingId = decodeURIComponent((await currentHash(page)).replace(/^#training-detail\//, ''));

      if (!await page.locator('#training-undo-step-one').count()) {
        throw new Error('undo button missing after flow one submission');
      }

      const pendingForm = await getTrainingStore(page);
      const pendingEntry = (pendingForm?.forms || []).find((item) => item.id === trainingId);
      if (!pendingEntry || pendingEntry.status !== '待簽核') {
        throw new Error('training form did not enter pending signoff state');
      }

      await page.evaluate(() => { window.confirm = () => true; });
      await page.click('#training-undo-step-one');
      await page.waitForSelector('#training-form', { timeout: 30000 });
      await page.waitForFunction((id) => window.location.hash === '#training-fill/' + id, trainingId);

      const storeAfterUndo = await getTrainingStore(page);
      const draftEntry = (storeAfterUndo?.forms || []).find((item) => item.id === trainingId);
      if (!draftEntry || draftEntry.status !== '暫存') {
        throw new Error('training form did not return to draft after undo');
      }
      if (draftEntry.stepOneSubmittedAt) {
        throw new Error('stepOneSubmittedAt should be cleared after undo');
      }

      const rosterRows = (storeAfterUndo?.rosters || []).filter((row) => row.name === '流程撤回人員');
      if (!rosterRows.length) {
        throw new Error('manually added row missing from roster after undo flow');
      }

      return `draft delete + undo verified on ${trainingId}`;
    });
  } finally {
    await browser.close();
    writeJson(RESULT_PATH, finalizeResults(results));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
