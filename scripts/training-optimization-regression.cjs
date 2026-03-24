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
const TEST_TRAINING_YEAR = String((new Date().getFullYear() - 1911) + 50);
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
  await page.waitForFunction(() => {
    const title = Array.from(document.querySelectorAll('body *'))
      .some((node) => String(node.textContent || '').includes('教育訓練名單管理'));
    return title && !!document.getElementById('training-roster-toggle-import');
  }, undefined, { timeout: 45000 });

  const importWrap = page.locator('#training-roster-import-wrap');
  const importForm = page.locator('#training-import-form');
  const toggle = page.locator('#training-roster-toggle-import');
  if (!(await importForm.count()) || !(await importForm.isVisible().catch(() => false))) {
    if (await toggle.count()) {
      await toggle.click();
    }
  }
  await importForm.waitFor({ state: 'visible', timeout: 45000 });
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
  await page.waitForSelector('#training-import-unit-category', { timeout: 45000 });
  await page.evaluate((fullUnit) => {
    const categoryEl = document.getElementById('training-import-unit-category');
    const parentEl = document.getElementById('training-import-unit-parent');
    const childEl = document.getElementById('training-import-unit-child');
    const customEl = document.getElementById('training-import-unit-custom');
    const hiddenEl = document.getElementById('training-import-unit');
    if (!categoryEl || !parentEl || !childEl || !hiddenEl) {
      throw new Error('missing unit cascade controls');
    }

    const dispatch = (element) => element.dispatchEvent(new Event('change', { bubbles: true }));
    const selectableOptions = (select) => Array.from(select.options).filter((entry) => String(entry.value || '').trim());
    const normalize = (value) => String(value || '').trim();
    const target = normalize(fullUnit);

    if (customEl) customEl.value = '';

    for (const categoryOption of selectableOptions(categoryEl)) {
      categoryEl.value = categoryOption.value;
      dispatch(categoryEl);
      for (const parentOption of selectableOptions(parentEl)) {
        parentEl.value = parentOption.value;
        dispatch(parentEl);
        const childOptions = selectableOptions(childEl);
        if (childOptions.length) {
          for (const childOption of childOptions) {
            childEl.value = childOption.value;
            dispatch(childEl);
            if (normalize(hiddenEl.value) === target) return;
          }
        } else if (normalize(hiddenEl.value) === target) {
          return;
        }
      }
    }

    const snapshot = {
      categories: selectableOptions(categoryEl).map((entry) => normalize(entry.textContent)),
      parents: selectableOptions(parentEl).map((entry) => normalize(entry.textContent)),
      children: selectableOptions(childEl).map((entry) => normalize(entry.textContent)),
      target
    };
    throw new Error(`Unable to select target unit: ${JSON.stringify(snapshot)}`);
  }, target.fullUnit);
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

async function waitForTrainingRosterStoreNames(page, names, timeout = 45000) {
  await page.waitForFunction((targetNames) => {
    try {
      const raw = window.localStorage.getItem('cats_training_hours');
      if (!raw) return false;
      const store = JSON.parse(raw);
      const rosters = Array.isArray(store && store.rosters) ? store.rosters : [];
      return targetNames.every((name) => rosters.some((row) => String(row && row.name || '').trim() === String(name || '').trim()));
    } catch (_) {
      return false;
    }
  }, names, { timeout });
}

async function confirmTrainingModal(page) {
  const confirm = page.locator('[data-modal-confirm]').first();
  await confirm.waitFor({ state: 'visible', timeout: 10000 });
  await confirm.evaluate((element) => {
    if (element && typeof element.click === 'function') element.click();
  });
  await page.waitForTimeout(120);
}

async function waitForTrainingSubmitReady(page, timeout = 45000) {
  await page.waitForFunction(() => {
    const submit = document.querySelector('[data-testid="training-submit"]');
    return !!submit && !submit.disabled;
  }, undefined, { timeout });
}

async function deleteTrainingFormById(page, id) {
  const result = await page.evaluate(async (formId) => {
    const currentUser = window._authModule && typeof window._authModule.currentUser === 'function'
      ? window._authModule.currentUser()
      : null;
    const sessionToken = String(currentUser && currentUser.sessionToken || '').trim();
    const activeUnit = String(currentUser && currentUser.activeUnit || '').trim();
    if (!sessionToken) {
      throw new Error('missing session token for training form cleanup');
    }
    const response = await fetch(`/api/training/forms/${encodeURIComponent(formId)}/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...(activeUnit ? { 'X-ISMS-Active-Unit': encodeURIComponent(activeUnit) } : {}),
      body: JSON.stringify({
        action: 'training.form.delete',
        payload: {
          id: formId,
          actorName: 'training smoke cleanup',
          actorUsername: 'training-smoke'
        }
      })
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  }, id);
  if (!result.ok) {
    throw new Error(`failed to delete training form ${id}: ${result.status} ${result.text}`);
  }
  return result;
}

async function collectRosterNamesByPrefixes(page, prefixes) {
  const targetPrefixes = Array.isArray(prefixes) ? prefixes.map((value) => String(value || '').trim()).filter(Boolean) : [];
  if (!targetPrefixes.length) return [];
  return await page.evaluate((items) => {
    const names = Array.from(document.querySelectorAll('tr[data-roster-name]'))
      .map((row) => String(row.dataset.rosterName || '').trim())
      .filter(Boolean);
    return names.filter((name) => items.some((prefix) => name.startsWith(prefix)));
  }, targetPrefixes);
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
      admin: { username: 'easonwu', password: '2wsx#EDC' },
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
      const staleRosterNames = await collectRosterNamesByPrefixes(page, ['ImportPersist', 'ImportDiag', 'FocusProbe', 'Opt02Probe']);
      if (staleRosterNames.length) {
        await deleteRosterRowsByNames(page, staleRosterNames);
      }
      return `autocomplete selected ${resolved.hidden}`;
    });

    await logout(page);

    await runStep(results, 'OPT-02', '填報人', '新增單位外人員可刪除，流程一撤回後仍保留手動名單', async () => {
      await login(page, results.context.reporter.username, results.context.reporter.password);
      await waitForBootstrap(page);
      const reporterUnit = await page.evaluate(() => {
        const current = window._authModule && typeof window._authModule.currentUser === 'function'
          ? window._authModule.currentUser()
          : null;
        return String((current && (current.unit || current.activeUnit)) || '').trim();
      });
      if (!reporterUnit) {
        throw new Error('missing reporter unit');
      }
      await gotoHash(page, `training-fill/unit:${encodeURIComponent(reporterUnit)}`);
      await page.waitForSelector('#training-form', { timeout: 45000 });
      await page.waitForFunction(() => {
        const unit = document.getElementById('tr-unit');
        const add = document.getElementById('training-add-person');
        return !!unit && String(unit.value || '').trim() && !!add && !add.disabled;
      }, undefined, { timeout: 45000 });

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
      await waitForTrainingSubmitReady(page, 45000);
      await page.waitForFunction((targetName) => {
        const row = Array.from(document.querySelectorAll('#training-rows-body tr'))
          .find((entry) => String(entry.textContent || '').includes(targetName));
        if (!row) return false;
        const checkbox = row.querySelector('.training-row-check[data-key]');
        return !!checkbox && String(checkbox.dataset.key || '').trim();
      }, UNDO_ROW_NAME, { timeout: 45000 });

      const draftRowCheckbox = page.locator(`tr:has-text("${UNDO_ROW_NAME}") .training-row-check`).first();
      if (!await draftRowCheckbox.count()) throw new Error('manual draft row does not expose a selectable checkbox');
      await draftRowCheckbox.check();
      await page.evaluate(() => {
        const bulk = document.getElementById('training-bulk-status');
        if (!bulk) throw new Error('missing bulk status');
        bulk.selectedIndex = 2;
        bulk.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.locator('#training-apply-bulk').click();
      await page.waitForFunction(() => {
        const rows = Array.from(document.querySelectorAll('#training-rows-body tr'));
        return rows.length > 0 && rows.every((row) => {
          const status = String(row.querySelector('select[data-field="status"]')?.value || '').trim();
          return status === '離職';
        });
      }, undefined, { timeout: 15000 });
      await waitForTrainingSubmitReady(page, 45000);

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

      await deleteTrainingFormById(page, trainingId);

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
        const row = Array.from(document.querySelectorAll('tr[data-roster-name]'))
          .find((entry) => targetNames.includes(String(entry.dataset.rosterName || '').trim()));
        if (!row) return false;
        return row.classList.contains('training-roster-row-focused');
      }, results.context.importNames, { timeout: 45000 });

      const verifyContext = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
      const verifyPage = await verifyContext.newPage();
      try {
        await login(verifyPage, results.context.admin.username, results.context.admin.password);
        await waitForBootstrap(verifyPage);
        await gotoHash(verifyPage, 'training-roster');
        await waitForTrainingRosterStoreNames(verifyPage, results.context.importNames, 45000);
        await verifyPage.waitForTimeout(500);
      } finally {
        await verifyContext.close();
      }

      await login(page, results.context.admin.username, results.context.admin.password);
      await waitForBootstrap(page);
      await gotoHash(page, 'training-roster');
      await page.waitForTimeout(500);
      await page.evaluate(async (names) => {
        const currentUser = window._authModule && typeof window._authModule.currentUser === 'function'
          ? window._authModule.currentUser()
          : null;
        const sessionToken = String(currentUser && currentUser.sessionToken || '').trim();
        const activeUnit = String(currentUser && currentUser.activeUnit || '').trim();
        const store = window._dataModule && typeof window._dataModule.loadData === 'function'
          ? window._dataModule.loadData()
          : null;
        const rosters = Array.isArray(store && store.rosters) ? store.rosters : [];
        const ids = Array.from(new Set(rosters
          .filter((row) => names.includes(String(row && row.name || '').trim()))
          .map((row) => String(row && row.id || '').trim())
          .filter(Boolean)));
        if (!sessionToken) {
          throw new Error('missing session token for training roster cleanup');
        }
        if (!ids.length) {
          throw new Error('missing imported roster ids for cleanup');
        }
        const response = await fetch('/api/training/rosters/delete-batch', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
            ...(activeUnit ? { 'X-ISMS-Active-Unit': encodeURIComponent(activeUnit) } : {})
          },
          body: JSON.stringify({
            action: 'training.roster.delete-batch',
            payload: {
              ids,
              actorName: currentUser && currentUser.name || '',
              actorUsername: currentUser && currentUser.username || ''
            }
          })
        });
        const text = await response.text();
        if (!response.ok) {
          throw new Error(`cleanup delete failed: ${response.status} ${text}`);
        }
      }, results.context.importNames);
      await page.waitForFunction((names) => {
        const store = window._dataModule && typeof window._dataModule.loadData === 'function'
          ? window._dataModule.loadData()
          : null;
        const rosters = Array.isArray(store && store.rosters) ? store.rosters : [];
        return names.every((name) => !rosters.some((row) => String(row && row.name || '').trim() === String(name).trim()));
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
