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
const ROLE_ADMIN = 'admin';
const TITLE_ROSTER_RENDER = 'training roster focus restore on delete rerender';
const TITLE_ROSTER_CLEANUP = 'training roster focus cleanup';
const IMPORT_TARGET_UNIT = '計算機及資訊網路中心／資訊網路組';
const IMPORT_TARGET_TITLE = '工程師';
const IMPORT_TARGET_IDENTITY = '校聘人員';

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
          actorUsername: 'admin'
        }))
      });
    }
  }, names);
}

async function waitForTrainingRostersByNames(page, names, timeout) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeout) {
    const rows = await listTrainingRostersByNames(page, names);
    if (names.every((name) => rows.some((row) => String((row && row.name) || '').trim() === name))) {
      return rows;
    }
    await page.waitForTimeout(400);
  }
  throw new Error(`training rosters not visible after ${timeout}ms: ${names.join(', ')}`);
}

async function waitForRosterRowByName(page, name, timeout) {
  const selector = `tr[data-roster-name="${name.replace(/"/g, '\\"')}"]`;
  await page.waitForSelector(selector, { timeout });
  return page.locator(selector);
}

(async () => {
  const names = [`FocusProbe-${Date.now()}`];
  const results = createResultEnvelope({
    steps: [],
    context: {
      admin: { username: ROLE_ADMIN, password: 'admin123' },
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
      await gotoHash(page, 'training-roster');
      await ensureTrainingImportPanelVisible(page);

      await page.evaluate(({ unit, name, identity, jobTitle }) => {
        document.getElementById('training-import-unit').value = unit;
        document.getElementById('training-import-names').value = `${name},InfoGroup,${identity},${jobTitle}`;
      }, {
        unit: IMPORT_TARGET_UNIT,
        name: names[0],
        identity: IMPORT_TARGET_IDENTITY,
        jobTitle: IMPORT_TARGET_TITLE
      });

      await page.click('[data-testid="training-import-submit"]');
      await waitForTrainingRostersByNames(page, names, 30000);
      await waitForRosterRowByName(page, names[0], 30000);

      const row = page.locator(`tr[data-roster-name="${names[0]}"]`);
      const deleteButton = row.locator('button[data-testid^="training-roster-delete-"]');
      await deleteButton.focus();
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

      await deleteButton.click();
      await page.waitForSelector('[data-modal-confirm="1"]', { state: 'visible', timeout: 20000 });
      await page.locator('[data-modal-confirm="1"]').evaluate((element) => {
        if (element && typeof element.click === 'function') {
          element.click();
        }
      });
      await page.waitForFunction((deletedName) => !document.querySelector(`tr[data-roster-name="${deletedName.replace(/"/g, '\\"')}"]`), names[0], { timeout: 30000 });
      await page.waitForFunction(() => {
        const active = document.activeElement;
        return !!active && typeof active.matches === 'function' && active.matches('button[data-testid^="training-roster-delete-"]');
      }, undefined, { timeout: 30000 });

      const after = await page.evaluate(() => {
        const active = document.activeElement;
        const row = active && typeof active.closest === 'function' ? active.closest('tr[data-roster-id]') : null;
        return {
          activeTestId: String(active && active.getAttribute ? active.getAttribute('data-testid') : ''),
          rowId: String(row && row.dataset ? row.dataset.rosterId : ''),
          rowName: String(row && row.dataset ? row.dataset.rosterName : '')
        };
      });
      if (!String(after.activeTestId || '').startsWith('training-roster-delete-')) {
        throw new Error(`expected delete button focus after delete, got ${JSON.stringify(after)}`);
      }
      if (after.rowName === names[0]) {
        throw new Error('focus still attached to deleted roster row');
      }
      return `focus restored to ${after.activeTestId}`;
    });
  } finally {
    try {
      await login(page, results.context.admin.username, results.context.admin.password);
      await page.waitForFunction(() => window.__REMOTE_BOOTSTRAP_STATE__ !== 'pending');
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
