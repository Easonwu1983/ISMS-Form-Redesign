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
const IMPORT_NAMES = [`ImportDiag${Date.now()}A`, `ImportDiag${Date.now()}B`];
const TEST_TRAINING_YEAR = String(new Date().getFullYear() - 1901);
const DELETE_ROW_NAME = `測試刪除人員${Date.now()}`;
const UNDO_ROW_NAME = `流程撤回人員${Date.now()}`;

function getTrainingStore(page) {
  return readJsonFromStorage(page, 'cats_training_hours');
}

async function waitForBootstrap(page) {
  await page.waitForFunction(() => window.__REMOTE_BOOTSTRAP_STATE__ !== 'pending', undefined, { timeout: 45000 });
}

async function ensureTrainingImportPanelVisible(page) {
  await waitForBootstrap(page);
  await page.waitForSelector('#training-roster-import-wrap', { state: 'attached', timeout: 45000 });
  await page.evaluate(() => {
    const wrap = document.getElementById('training-roster-import-wrap');
    if (wrap) wrap.style.display = '';
  });
  await page.waitForSelector('#training-import-form', { state: 'attached', timeout: 45000 });
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
    throw new Error('unable to locate a searchable multi-level unit');
  });
}

async function selectImportTargetUnit(page, target) {
  await page.fill('#training-import-unit-search', target.token);
  await page.waitForSelector('#training-import-unit-search-results [data-unit-value]', { timeout: 45000 });
  await page.click(`#training-import-unit-search-results [data-unit-value="${target.fullUnit}"]`);
  await page.waitForFunction((value) => {
    const hidden = document.getElementById('training-import-unit');
    return !!hidden && String(hidden.value || '').trim() === String(value || '').trim();
  }, target.fullUnit, { timeout: 45000 });
}

async function waitForTrainingRosterRowsByNames(page, names, timeout = 45000) {
  await page.waitForFunction((targetNames) => {
    const rows = Array.from(document.querySelectorAll('tr[data-roster-name]')).map((row) => String(row.dataset.rosterName || '').trim());
    return targetNames.every((name) => rows.includes(name));
  }, names, { timeout });
}

async function confirmTrainingModal(page) {
  const confirm = page.locator('[data-modal-confirm]').first();
  await confirm.waitFor({ state: 'visible', timeout: 10000 });
  await confirm.click();
  await page.waitForTimeout(120);
}

async function deleteRosterRowsByNames(page, names) {
  await gotoHash(page, 'training-roster');
  await page.waitForSelector('[data-testid^="training-roster-delete-"]', { timeout: 45000 });
  for (const name of names) {
    const row = page.locator(`tr[data-roster-name="${name}"]`).first();
    if (!(await row.count())) continue;
    const button = row.locator('[data-testid^="training-roster-delete-"]').first();
    if (!(await button.count())) continue;
    await button.click();
    await confirmTrainingModal(page);
    await page.waitForTimeout(250);
  }
}

(async () => {
  const results = createResultEnvelope({
    steps: [],
    context: {
      admin: { username: 'admin', password: 'admin123' },
      reporter: { username: 'unit1', password: 'unit123' },
      importNames: IMPORT_NAMES,
      importTargetUnit: ''
    }
  });

  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  attachDiagnostics(page, results);

  try {
    await resetApp(page);

    await runStep(results, 'OPT-01', '最高管理員', '名單匯入單位 autocomplete 會回填完整階層', async () => {
      await login(page, results.context.admin.username, results.context.admin.password);
      await waitForBootstrap(page);
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

    await runStep(results, 'OPT-02', '填報人', '新增單位外人員可刪除，流程一撤回後仍保留手動名單', async () => {
      await login(page, results.context.reporter.username, results.context.reporter.password);
      await waitForBootstrap(page);
      await gotoHash(page, 'training-fill');
      await page.waitForSelector('#training-form', { timeout: 45000 });

      await page.fill('#tr-phone', '02-3366-8888');
      await page.fill('#tr-email', 'unit1@g.ntu.edu.tw');
      await page.fill('#tr-year', TEST_TRAINING_YEAR);
      await page.fill('#tr-date', new Date().toISOString().slice(0, 10));

      await page.fill('#tr-new-name', DELETE_ROW_NAME);
      await page.fill('#tr-new-unit-name', '資訊網路組');
      await page.fill('#tr-new-identity', '主管');
      await page.fill('#tr-new-job-title', '組長');
      await page.click('#training-add-person');
      await page.waitForFunction((targetName) => Array.from(document.querySelectorAll('#training-rows-body tr')).some((row) => String(row.textContent || '').includes(targetName)), DELETE_ROW_NAME, { timeout: 45000 });

      const deleteButton = page.locator(`tr:has-text("${DELETE_ROW_NAME}") .training-row-delete`).first();
      if (!await deleteButton.count()) throw new Error('manual draft row does not expose delete action');
      await deleteButton.click();
      await confirmTrainingModal(page);
      await page.waitForFunction((targetName) => !Array.from(document.querySelectorAll('#training-rows-body tr')).some((row) => String(row.textContent || '').includes(targetName)), DELETE_ROW_NAME, { timeout: 45000 });

      await page.fill('#tr-new-name', UNDO_ROW_NAME);
      await page.fill('#tr-new-unit-name', '資訊網路組');
      await page.fill('#tr-new-identity', '填報人');
      await page.fill('#tr-new-job-title', '工程師');
      await page.click('#training-add-person');
      await page.waitForFunction((targetName) => Array.from(document.querySelectorAll('#training-rows-body tr')).some((row) => String(row.textContent || '').includes(targetName)), UNDO_ROW_NAME, { timeout: 45000 });

      const rowCount = await page.locator('select[data-field="status"]').count();
      for (let index = 0; index < rowCount; index += 1) {
        await page.locator(`select[data-idx="${index}"][data-field="status"]`).selectOption({ label: '在職' });
        await page.waitForTimeout(80);
        const infoSelect = page.locator(`select[data-idx="${index}"][data-field="isInfoStaff"]`);
        if (await infoSelect.count()) {
          await infoSelect.selectOption({ label: '否' });
          await page.waitForTimeout(80);
        }
        const yesButton = page.locator(`[data-testid="training-binary-completedgeneral-${index}-yes"]`);
        if (await yesButton.count()) {
          await yesButton.click();
          await page.waitForTimeout(60);
        }
      }

      await page.click('[data-testid="training-submit"]');
      await page.waitForFunction(() => {
        if (String(window.location.hash || '').startsWith('#training-detail/')) return true;
        const feedback = document.getElementById('training-feedback');
        return !!(feedback && feedback.dataset.state === 'error' && String(feedback.textContent || '').trim());
      }, undefined, { timeout: 45000 });
      if (!String(await currentHash(page)).startsWith('#training-detail/')) {
        const feedbackText = await page.locator('#training-feedback').textContent().catch(() => '');
        throw new Error(`training submit did not navigate: ${String(feedbackText || '').trim() || 'unknown validation error'}`);
      }
      const trainingId = decodeURIComponent((await currentHash(page)).replace(/^#training-detail\//, ''));
      if (!await page.locator('#training-undo-step-one').count()) {
        throw new Error('undo button missing after flow one submission');
      }

      const pendingForm = await getTrainingStore(page);
      const pendingEntry = (pendingForm?.forms || []).find((item) => item.id === trainingId);
      if (!pendingEntry || pendingEntry.status !== '待簽核') {
        throw new Error('training form did not enter pending signoff state');
      }

      await page.click('#training-undo-step-one');
      await confirmTrainingModal(page);
      await page.waitForSelector('#training-form', { timeout: 45000 });
      await page.waitForFunction((id) => window.location.hash === '#training-fill/' + id, trainingId, { timeout: 45000 });

      const storeAfterUndo = await getTrainingStore(page);
      const draftEntry = (storeAfterUndo?.forms || []).find((item) => item.id === trainingId);
      if (!draftEntry || draftEntry.status !== '暫存') {
        throw new Error('training form did not return to draft after undo');
      }
      if (draftEntry.stepOneSubmittedAt) {
        throw new Error('stepOneSubmittedAt should be cleared after undo');
      }

      const rosterRows = (storeAfterUndo?.rosters || []).filter((row) => row.name === UNDO_ROW_NAME);
      if (!rosterRows.length) {
        throw new Error('manually added row missing from roster after undo flow');
      }

      return `draft delete + undo verified on ${trainingId}`;
    });

    await logout(page);

    await runStep(results, 'OPT-03', '最高管理員', '貼上匯入後換新 session 仍能讀回名單', async () => {
      await login(page, results.context.admin.username, results.context.admin.password);
      await waitForBootstrap(page);
      await gotoHash(page, 'training-roster');
      await ensureTrainingImportPanelVisible(page);
      await selectImportTargetUnit(page, {
        fullUnit: results.context.importTargetUnit,
        token: String(results.context.importTargetUnit).split(/[／/]/).slice(-1)[0].slice(0, 2)
      });

      await page.fill(
        '#training-import-names',
        `${results.context.importNames[0]},InfoGroup,主管,組長\n${results.context.importNames[1]},InfoGroup,填報人,工程師`
      );
      await page.click('[data-testid="training-import-submit"]');
      await waitForTrainingRosterRowsByNames(page, results.context.importNames, 45000);
      await page.waitForFunction((targetNames) => {
        const active = document.activeElement;
        if (!active || !active.matches || !active.matches('.training-row-delete')) return false;
        const row = active.closest('tr[data-roster-name]');
        if (!row) return false;
        const rowName = String(row.dataset.rosterName || '').trim();
        return targetNames.includes(rowName);
      }, results.context.importNames, { timeout: 45000 });

      const verifyContext = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
      const verifyPage = await verifyContext.newPage();
      try {
        await login(verifyPage, results.context.admin.username, results.context.admin.password);
        await waitForBootstrap(verifyPage);
        await gotoHash(verifyPage, 'training-roster');
        await waitForTrainingRosterRowsByNames(verifyPage, results.context.importNames, 45000);
      } finally {
        await verifyContext.close();
      }

      await login(page, results.context.admin.username, results.context.admin.password);
      await waitForBootstrap(page);
      await gotoHash(page, 'training-roster');
      await deleteRosterRowsByNames(page, results.context.importNames);
      await page.waitForFunction((names) => {
        const rows = Array.from(document.querySelectorAll('tr[data-roster-name]')).map((row) => String(row.dataset.rosterName || '').trim());
        return names.every((name) => !rows.includes(name));
      }, results.context.importNames, { timeout: 45000 });

      return `import persisted across sessions for ${results.context.importTargetUnit}`;
    });
  } finally {
    await browser.close();
    const finalized = finalizeResults(results);
    writeJson(RESULT_PATH, finalized);
    if (finalized.summary.failed || finalized.summary.pageErrors) process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
