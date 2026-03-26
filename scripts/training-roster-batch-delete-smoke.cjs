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

const runMeta = createArtifactRun('training-roster-batch-delete-smoke');
const RESULT_PATH = path.join(runMeta.outDir, 'training-roster-batch-delete-smoke.json');
const ROLE_ADMIN = 'easonwu';
const TEST_UNIT = `RosterBatchUnit-${Date.now()}`;
const TEST_ROWS = [
  {
    name: `BatchDelete-A-${Date.now()}`,
    unit: TEST_UNIT,
    unitName: TEST_UNIT,
    identity: '校聘人員',
    jobTitle: '工程師'
  },
  {
    name: `BatchDelete-B-${Date.now()}`,
    unit: TEST_UNIT,
    unitName: TEST_UNIT,
    identity: '校聘人員',
    jobTitle: '行政專員'
  }
];

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

async function getSessionToken(page) {
  return page.evaluate(() => {
    const currentUser = window._authModule && typeof window._authModule.currentUser === 'function'
      ? window._authModule.currentUser()
      : null;
    return String(currentUser && currentUser.sessionToken || '').trim();
  });
}

async function chooseTrainingImportUnit(page) {
  await page.waitForFunction(() => {
    const category = document.getElementById('training-import-unit-category');
    const parent = document.getElementById('training-import-unit-parent');
    const hidden = document.getElementById('training-import-unit');
    return !!category && Array.from(category.options || []).some((option) => String(option.value || '').trim()) && !!parent && !!hidden;
  }, undefined, { timeout: 15000 });
  await page.evaluate(() => {
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
            if (String(hidden.value || '').trim()) return;
          }
        } else if (String(hidden.value || '').trim()) {
          return;
        }
      }
    }
    throw new Error('Unable to select a valid training import unit');
  });
  return page.evaluate(() => String(document.getElementById('training-import-unit')?.value || '').trim());
}

async function deleteRostersByNames(page, names) {
  const token = await getSessionToken(page);
  if (!token) return { ok: true, deletedIds: [] };
  return page.evaluate(async ({ targetNames, sessionToken }) => {
    const response = await fetch('/api/training/rosters', {
      headers: { Authorization: `Bearer ${sessionToken}` }
    });
    const body = await response.json().catch(() => ({}));
    const items = []
      .concat(Array.isArray(body) ? body : [])
      .concat(Array.isArray(body?.items) ? body.items : [])
      .concat(Array.isArray(body?.value) ? body.value : []);
    const ids = items
      .filter((item) => targetNames.includes(String((item && item.name) || '').trim()))
      .map((item) => String(item.id || '').trim())
      .filter(Boolean);
    if (!ids.length) return { ok: true, deletedIds: [] };
    const envelope = {
      action: 'training.roster.delete-batch',
      requestId: `batch-delete-cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      context: {
        contractVersion: '2026-03-12',
        source: 'training-roster-batch-delete-smoke',
        frontendOrigin: window.location.origin,
        frontendHash: window.location.hash || '',
        sentAt: new Date().toISOString()
      },
      payload: {
        ids,
        actorName: 'training-roster-batch-delete-smoke',
        actorUsername: 'easonwu'
      }
    };
    const del = await fetch('/api/training/rosters/delete-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`
      },
      body: JSON.stringify(envelope)
    });
    return del.json().catch(() => ({ ok: false }));
  }, { targetNames: names, sessionToken: token });
}

async function listTrainingRostersByNames(page, names) {
  const token = await getSessionToken(page);
  if (!token) return [];
  return page.evaluate(async ({ targetNames, sessionToken }) => {
    const response = await fetch('/api/training/rosters', {
      headers: { Authorization: `Bearer ${sessionToken}` }
    });
    const body = await response.json().catch(() => ({}));
    const items = []
      .concat(Array.isArray(body) ? body : [])
      .concat(Array.isArray(body?.items) ? body.items : [])
      .concat(Array.isArray(body?.value) ? body.value : []);
    return items.filter((item) => targetNames.includes(String((item && item.name) || '').trim()));
  }, { targetNames: names, sessionToken: token });
}

async function expandRosterGroups(page) {
  await page.evaluate(() => {
    document.querySelectorAll('details.training-roster-group-card').forEach((element) => {
      element.open = true;
    });
  });
  await page.waitForTimeout(200);
}

async function waitForTrainingRosterGroupRows(page, names, timeout) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeout) {
    const rows = await listTrainingRostersByNames(page, names);
    const backendReady = names.every((name) => rows.some((row) => String((row && row.name) || '').trim() === name));
    if (backendReady) {
      try {
        await gotoHash(page, 'training-roster');
      } catch (_) {}
      const rosterFilterKeyword = String(TEST_UNIT || '').trim();
      if (rosterFilterKeyword) {
        const keyword = page.locator('#training-roster-keyword');
        if (await keyword.count()) {
          await keyword.fill(rosterFilterKeyword);
          await keyword.dispatchEvent('input');
          await page.waitForTimeout(800);
        }
      }
      await page.waitForFunction(() => document.querySelectorAll('details.training-roster-group-card').length > 0, undefined, { timeout: Math.min(30000, Math.max(5000, timeout)) });
      for (const name of names) {
        await page.locator(`details.training-roster-group-card tr[data-roster-name="${name.replace(/"/g, '\\"')}"]`).first().waitFor({ state: 'attached', timeout: Math.min(30000, Math.max(5000, timeout)) });
      }
      return rows;
    }
    await page.waitForTimeout(300);
  }
  throw new Error(`training roster group rows not rendered after ${timeout}ms: ${names.join(', ')}`);
}

(async () => {
  const results = createResultEnvelope({
    steps: [],
    context: {
      admin: { username: ROLE_ADMIN, password: '2wsx#EDC' },
      names: TEST_ROWS.map((row) => row.name)
    }
  });

  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  attachDiagnostics(page, results);

  try {
    await resetApp(page);

    await runStep(results, 'BATCH-01', 'training-roster', 'grouping and numbering', async () => {
      await login(page, results.context.admin.username, results.context.admin.password);
      await page.waitForFunction(() => window.__REMOTE_BOOTSTRAP_STATE__ !== 'pending');
      await page.waitForFunction(() => {
        const currentUser = window._authModule && typeof window._authModule.currentUser === 'function'
          ? window._authModule.currentUser()
          : null;
        return !!(currentUser && String(currentUser.sessionToken || '').trim());
      }, undefined, { timeout: 30000 });

      await gotoHash(page, 'training-roster');
      await page.waitForSelector('#training-roster-groups', { state: 'attached', timeout: 30000 });
      await ensureTrainingImportPanelVisible(page);
      await chooseTrainingImportUnit(page);
      await page.evaluate(({ rows }) => {
        document.getElementById('training-import-names').value = rows.map((row) => [row.name, row.unit, row.identity, row.jobTitle].join(',')).join('\n');
      }, { rows: TEST_ROWS });
      await waitForTrainingImportFormReady(page, 30000);
      await page.locator('#training-import-form').evaluate((form) => form.requestSubmit());
      await waitForTrainingRosterGroupRows(page, TEST_ROWS.map((row) => row.name), 240000);
      await page.waitForFunction(() => document.querySelectorAll('details.training-roster-group-card').length > 0, undefined, { timeout: 30000 });
      await expandRosterGroups(page);
      const groupCount = await page.locator('details.training-roster-group-card').count();
      if (groupCount < 1) {
        throw new Error('expected grouped roster cards to render');
      }
      const actualGroupKey = await page.evaluate((targetName) => {
        const row = Array.from(document.querySelectorAll('details.training-roster-group-card tr[data-roster-name]'))
          .find((item) => String(item.dataset?.rosterName || '').trim() === targetName);
        return String(row && row.dataset && row.dataset.rosterGroup || '').trim();
      }, TEST_ROWS[0].name);
      if (!actualGroupKey) {
        throw new Error('unable to resolve actual roster group key');
      }

      const firstRow = page.locator(`details.training-roster-group-card tr[data-roster-name="${TEST_ROWS[0].name}"]`).first();
      await firstRow.waitFor({ state: 'visible', timeout: 30000 });
      const rowNumbers = await page.locator(`details.training-roster-group-card tr[data-roster-group="${actualGroupKey}"] .training-roster-order`).allTextContents();
      if (rowNumbers.length < 2 || rowNumbers[0].trim() !== '1' || rowNumbers[1].trim() !== '2') {
        throw new Error(`expected per-group numbering to start at 1, got ${JSON.stringify(rowNumbers)}`);
      }

      return 'grouping and numbering all worked';
    });
  } finally {
    try {
      await deleteRostersByNames(page, results.context.names);
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
