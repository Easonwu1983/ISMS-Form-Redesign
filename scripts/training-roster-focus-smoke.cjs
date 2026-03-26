const path = require('path');
const {
  attachDiagnostics,
  createArtifactRun,
  createResultEnvelope,
  finalizeResults,
  gotoHash,
  launchBrowser,
  login,
  resetApp,
  runStep,
  writeJson
} = require('./_role-test-utils.cjs');

const runMeta = createArtifactRun('training-roster-focus-smoke');
const RESULT_PATH = path.join(runMeta.outDir, 'training-roster-focus-smoke.json');
const ROLE_ADMIN = 'easonwu';
const TITLE_ROSTER_RENDER = 'training roster focus restore on delete rerender';
const IMPORT_TARGET_UNIT = `RosterFocusUnit-${Date.now()}`;
const IMPORT_TARGET_TITLE = 'Engineer';
const IMPORT_TARGET_IDENTITY = 'Staff';

async function ensureTrainingImportPanelVisible(page) {
  await page.waitForSelector('#training-roster-toggle-import');
  const toggle = page.locator('#training-roster-toggle-import');
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
  await page.waitForSelector('#training-import-form', { state: 'visible' });
}

async function waitForTrainingImportFormReady(page, timeout = 15000) {
  await page.waitForFunction(() => {
    const form = document.getElementById('training-import-form');
    const names = document.getElementById('training-import-names');
    const unit = document.getElementById('training-import-unit');
    if (!form || !names || !unit) return false;
    const style = window.getComputedStyle(form);
    const rect = form.getBoundingClientRect();
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0 &&
      String(names.value || '').trim().length > 0 &&
      String(unit.value || '').trim().length > 0
    );
  }, { timeout });
}

async function chooseTrainingImportUnit(page) {
  await page.waitForFunction(() => {
    const category = document.getElementById('training-import-unit-category');
    const parent = document.getElementById('training-import-unit-parent');
    const hidden = document.getElementById('training-import-unit');
    return !!category && Array.from(category.options || []).some((option) => String(option.value || '').trim()) && !!parent && !!hidden;
  }, undefined, { timeout: 15000 });
  const result = await page.evaluate(() => {
    const baseId = 'training-import-unit';
    const categorySelect = document.getElementById(baseId + '-category');
    const parentSelect = document.getElementById(baseId + '-parent');
    const childSelect = document.getElementById(baseId + '-child');
    const hidden = document.getElementById(baseId);
    if (!categorySelect || !parentSelect || !childSelect || !hidden) {
      throw new Error('Missing training import unit controls');
    }
    const dispatch = (element) => element.dispatchEvent(new Event('change', { bubbles: true }));
    const selectableOptions = (select) => Array.from(select.options || []).filter((option) => String(option.value || '').trim());
    const snapshot = {
      categories: selectableOptions(categorySelect).map((entry) => String(entry.textContent || '').trim()),
      parents: selectableOptions(parentSelect).map((entry) => String(entry.textContent || '').trim()),
      children: selectableOptions(childSelect).map((entry) => String(entry.textContent || '').trim())
    };
    for (const categoryOption of selectableOptions(categorySelect)) {
      categorySelect.value = categoryOption.value;
      dispatch(categorySelect);
      for (const parentOption of selectableOptions(parentSelect)) {
        parentSelect.value = parentOption.value;
        dispatch(parentSelect);
        const childOptions = childSelect.disabled ? [] : selectableOptions(childSelect);
        if (childOptions.length) {
          for (const childOption of childOptions) {
            childSelect.value = childOption.value;
            dispatch(childSelect);
            if (String(hidden.value || '').trim()) {
              return { selected: String(hidden.value || '').trim(), snapshot };
            }
          }
        } else if (String(hidden.value || '').trim()) {
          return { selected: String(hidden.value || '').trim(), snapshot };
        }
      }
    }
    throw new Error(`Unable to select training import unit: ${JSON.stringify({ hidden: String(hidden.value || '').trim(), ...snapshot })}`);
  });
  await page.waitForFunction(({ value }) => {
    const hidden = document.getElementById('training-import-unit');
    return !!hidden && String(hidden.value || '').trim() === String(value || '').trim();
  }, { value: result.selected }, { timeout: 15000 });
}

async function waitForTrainingRosterTableReady(page, timeout = 90000) {
  await page.waitForSelector('#training-roster-groups', { state: 'visible', timeout });
  await page.waitForFunction(() => {
    const groups = document.getElementById('training-roster-groups');
    const toggle = document.getElementById('training-roster-toggle-import');
    return !!groups && !!toggle && document.readyState !== 'loading';
  }, undefined, { timeout });
}

async function expandRosterGroups(page) {
  await page.evaluate(() => {
    document.querySelectorAll('details.training-roster-group-card').forEach((element) => {
      element.open = true;
    });
  });
  await page.waitForTimeout(200);
}

async function listTrainingRostersByNames(page, names) {
  return page.evaluate(async (targetNames) => {
    const token = window._authModule?.currentUser?.()?.sessionToken || '';
    const response = await fetch('/api/training/rosters', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const body = await response.json();
    const items = []
      .concat(Array.isArray(body) ? body : [])
      .concat(Array.isArray(body?.items) ? body.items : [])
      .concat(Array.isArray(body?.value) ? body.value : []);
    return items.filter((item) => targetNames.includes(String((item && item.name) || '').trim()));
  }, names);
}

async function waitForTrainingRosterRowsInDom(page, names, timeout) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeout) {
    const present = await page.evaluate((targetNames) => {
      const rows = Array.from(document.querySelectorAll('tr[data-roster-name]'))
        .map((row) => String(row.dataset?.rosterName || '').trim())
        .filter(Boolean);
      return targetNames.filter((name) => rows.includes(name));
    }, names);
    if (names.every((name) => present.includes(name))) {
      return present;
    }
    await page.waitForTimeout(300);
  }
  throw new Error(`training roster rows not rendered after ${timeout}ms: ${names.join(', ')}`);
}

async function deleteTrainingRostersByNames(page, names) {
  await page.evaluate(async (targetNames) => {
    const token = window._authModule?.currentUser?.()?.sessionToken || '';
    const buildEnvelope = (action, payload) => ({
      action,
      requestId: `focus-cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      context: {
        contractVersion: '2026-03-12',
        source: 'training-roster-focus-smoke',
        frontendOrigin: window.location.origin,
        frontendHash: window.location.hash || '',
        sentAt: new Date().toISOString()
      },
      payload
    });
    const response = await fetch('/api/training/rosters', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) return;
    const body = await response.json();
    const items = []
      .concat(Array.isArray(body) ? body : [])
      .concat(Array.isArray(body?.items) ? body.items : [])
      .concat(Array.isArray(body?.value) ? body.value : []);
    const matches = items.filter((item) => targetNames.includes(String((item && item.name) || '').trim()));
    for (const item of matches) {
      await fetch(`/api/training/rosters/${encodeURIComponent(item.id)}/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(buildEnvelope('training.roster.delete', {
          id: item.id,
          actorName: 'training-roster-focus-smoke',
          actorUsername: 'easonwu'
        }))
  });
}
  }, names);
}

async function waitForTrainingRostersByNames(page, names, timeout) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeout) {
    const rows = await listTrainingRostersByNames(page, names);
    const backendReady = names.every((name) => rows.some((row) => String((row && row.name) || '').trim() === name));
    if (backendReady) {
      try {
        await gotoHash(page, 'training-roster');
      } catch (_) {}
      const primaryName = String(names[0] || '').trim();
      if (primaryName) {
        const keyword = page.locator('#training-roster-keyword');
        if (await keyword.count()) {
          await keyword.fill(primaryName);
          await keyword.dispatchEvent('input');
          await page.waitForTimeout(800);
        }
      }
      const perRowTimeout = Math.max(3000, Math.min(30000, timeout - (Date.now() - startedAt)));
      await page.locator(`tr[data-roster-name="${String(names[0] || '').replace(/"/g, '\\"')}"]`).first().waitFor({ state: 'attached', timeout: perRowTimeout });
      return rows;
    }
    await page.waitForTimeout(400);
  }
  throw new Error(`training roster rows not rendered after ${timeout}ms: ${names.join(', ')}`);
}

(async () => {
  const names = [`FocusProbe-A-${Date.now()}`, `FocusProbe-B-${Date.now()}`];
  const results = createResultEnvelope({
    steps: [],
    context: {
      admin: { username: ROLE_ADMIN, password: '2wsx#EDC' },
      names,
      importUnit: IMPORT_TARGET_UNIT
    }
  });

  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  attachDiagnostics(page, results);

  try {
    await resetApp(page);

    await runStep(results, 'M8-01', 'training', TITLE_ROSTER_RENDER, async () => {
      await login(page, results.context.admin.username, results.context.admin.password);
      await page.waitForFunction(() => window.__REMOTE_BOOTSTRAP_STATE__ !== 'pending');
      await page.waitForFunction(() => {
        const currentUser = window._authModule && typeof window._authModule.currentUser === 'function'
          ? window._authModule.currentUser()
          : null;
        return !!(currentUser && String(currentUser.sessionToken || '').trim());
      }, undefined, { timeout: 30000 });
      await gotoHash(page, 'training-roster');
      await waitForTrainingRosterTableReady(page);
      await ensureTrainingImportPanelVisible(page);
      await chooseTrainingImportUnit(page);

      await page.evaluate(({ unit, nameA, nameB, identity, jobTitle }) => {
        document.getElementById('training-import-names').value = [
          `${nameA},${unit},${identity},${jobTitle}`,
          `${nameB},${unit},${identity},${jobTitle}`
        ].join('\n');
      }, {
        unit: await page.evaluate(() => String(document.getElementById('training-import-unit')?.value || '').trim()),
        nameA: names[0],
        nameB: names[1],
        identity: IMPORT_TARGET_IDENTITY,
        jobTitle: IMPORT_TARGET_TITLE
      });

      await ensureTrainingImportPanelVisible(page);
      await waitForTrainingImportFormReady(page);
      await page.locator('#training-import-form').evaluate((form) => form.requestSubmit());
      await waitForTrainingRostersByNames(page, names, 240000);
      await page.waitForSelector('details.training-roster-group-card', { state: 'visible', timeout: 30000 });
      await expandRosterGroups(page);

      const targetRow = page.locator(`tr[data-roster-name="${names[0]}"]`).first();
      await targetRow.waitFor({ state: 'visible', timeout: 30000 });
      const targetDeleteButton = targetRow.locator('button[data-testid^="training-roster-delete-"]');
      await targetDeleteButton.focus();
      const before = await page.evaluate(() => {
        const active = document.activeElement;
        const row = active && typeof active.closest === 'function' ? active.closest('tr[data-roster-id]') : null;
        return {
          activeTestId: String(active && active.getAttribute ? active.getAttribute('data-testid') : ''),
          rowId: String(row && row.dataset ? row.dataset.rosterId : ''),
          rowName: String(row && row.dataset ? row.dataset.rosterName : '')
        };
      });
      if (!String(before.activeTestId || '').startsWith('training-roster-delete-')) {
        throw new Error(`expected delete button focus before delete, got ${JSON.stringify(before)}`);
      }

      await targetDeleteButton.click();
      await page.waitForSelector('[data-modal-confirm="1"]', { state: 'visible', timeout: 20000 });
      await page.locator('[data-modal-confirm="1"]').click();
      await page.waitForTimeout(500);
      return 'focus before delete and confirm modal worked';
    });
  } finally {
    try {
      await deleteTrainingRostersByNames(page, names);
    } catch (_) {}
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
