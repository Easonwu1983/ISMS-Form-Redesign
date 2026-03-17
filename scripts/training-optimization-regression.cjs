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
const IMPORT_IDENTITY_MANAGER = '\u4e3b\u7ba1';
const IMPORT_IDENTITY_REPORTER = '\u586b\u5831\u4eba';
const IMPORT_TITLE_MANAGER = '\u7d44\u9577';
const IMPORT_TITLE_ENGINEER = '\u5de5\u7a0b\u5e2b';

function getTrainingStore(page) {
  return readJsonFromStorage(page, 'cats_training_hours');
}

async function ensureTrainingImportPanelVisible(page) {
  await page.waitForSelector('#training-roster-toggle-import');
  const toggle = page.locator('#training-roster-toggle-import');
  if (await toggle.count()) {
    let formVisible = await page.locator('#training-import-form').isVisible().catch(() => false);
    if (!formVisible) {
      await toggle.click();
      await page.waitForTimeout(250);
      formVisible = await page.locator('#training-import-form').isVisible().catch(() => false);
    }
    if (!formVisible) {
      await toggle.click();
      await page.waitForTimeout(250);
    }
  }
  await page.waitForSelector('#training-import-form', { state: 'visible' });
}

async function pickImportTargetUnit(page) {
  return await page.evaluate(() => {
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
              token: children[0].slice(0, 2) || parent.slice(0, 2),
              category,
              parent,
              child: children[0]
            };
          }
        }
      }
    }

    throw new Error('unable to locate a searchable multi-level unit');
  });
}

async function selectImportTargetUnit(page, target) {
  await page.fill('#training-import-unit-search', target.token);
  await page.waitForSelector('#training-import-unit-search-results [data-unit-value]');
  await page.click(`#training-import-unit-search-results [data-unit-value="${target.fullUnit}"]`);
  await page.waitForFunction((value) => {
    const hidden = document.getElementById('training-import-unit');
    return !!hidden && String(hidden.value || '').trim() === String(value || '').trim();
  }, target.fullUnit);
}

async function deleteRosterRowsByNames(page, names) {
  await gotoHash(page, 'training-roster');
  await page.waitForSelector('[data-testid^="training-roster-delete-"]');
  await page.evaluate(() => { window.confirm = () => true; });
  for (const name of names) {
    const row = page.locator('tbody tr').filter({ hasText: name }).first();
    if (!(await row.count())) continue;
    const button = row.locator('[data-testid^="training-roster-delete-"]').first();
    if (!(await button.count())) continue;
    await button.click();
    await page.waitForTimeout(250);
  }
}

(async () => {
  const results = createResultEnvelope({
    steps: [],
    context: {
      admin: { username: 'admin', password: 'admin123' },
      reporter: { username: 'unit1', password: 'unit123' },
      importNames: [
        `ImportDiag${Date.now()}A`,
        `ImportDiag${Date.now()}B`
      ],
      importTargetUnit: ''
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
      await ensureTrainingImportPanelVisible(page);

      const target = await pickImportTargetUnit(page);
      await selectImportTargetUnit(page, target);
      results.context.importTargetUnit = target.fullUnit;

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
        await page.click(`[data-testid="training-binary-completedgeneral-${index}-yes"]`);
        await page.locator(`select[data-idx="${index}"][data-field="isInfoStaff"]`).selectOption({ index: 2 });
      }

      await page.click('[data-testid="training-submit"]');
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

    await logout(page);

    await runStep(results, 'OPT-03', '教育訓練名單匯入', '匯入後需同步到遠端，換新瀏覽器仍可讀回', async () => {
      await login(page, results.context.admin.username, results.context.admin.password);
      await gotoHash(page, 'training-roster');
      await ensureTrainingImportPanelVisible(page);

      const target = results.context.importTargetUnit
        ? {
            fullUnit: results.context.importTargetUnit,
            token: String(results.context.importTargetUnit).split('／').slice(-1)[0].slice(0, 2)
          }
        : await pickImportTargetUnit(page);

      await selectImportTargetUnit(page, target);

      await page.fill(
        '#training-import-names',
        `${results.context.importNames[0]},InfoGroup,${IMPORT_IDENTITY_MANAGER},${IMPORT_TITLE_MANAGER}\n${results.context.importNames[1]},InfoGroup,${IMPORT_IDENTITY_REPORTER},${IMPORT_TITLE_ENGINEER}`
      );
      await page.click('[data-testid="training-import-submit"]');
      await page.waitForFunction((names) => {
        const rows = Array.from(document.querySelectorAll('tbody tr')).map((row) => row.textContent || '');
        return names.every((name) => rows.some((text) => text.includes(name)));
      }, results.context.importNames);

      const currentRows = await page.$$eval('tbody tr', (rows, names) => rows
        .map((row) => row.textContent || '')
        .filter((text) => names.some((name) => text.includes(name))), results.context.importNames);
      if (currentRows.length !== results.context.importNames.length) {
        throw new Error(`expected ${results.context.importNames.length} visible imported rows, got ${currentRows.length}`);
      }

      const verifyContext = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
      const verifyPage = await verifyContext.newPage();
      try {
        await login(verifyPage, results.context.admin.username, results.context.admin.password);
        await gotoHash(verifyPage, 'training-roster');
        await verifyPage.waitForFunction((names) => {
          const rows = Array.from(document.querySelectorAll('tbody tr')).map((row) => row.textContent || '');
          return names.every((name) => rows.some((text) => text.includes(name)));
        }, results.context.importNames);
      } finally {
        await verifyContext.close();
      }

      await deleteRosterRowsByNames(page, results.context.importNames);
      await page.waitForFunction((names) => {
        const rows = Array.from(document.querySelectorAll('tbody tr')).map((row) => row.textContent || '');
        return names.every((name) => !rows.some((text) => text.includes(name)));
      }, results.context.importNames);

      return `import persisted across sessions for ${target.fullUnit}`;
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
