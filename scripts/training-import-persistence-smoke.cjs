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

const runMeta = createArtifactRun('training-import-persistence-smoke');
const RESULT_PATH = path.join(runMeta.outDir, 'training-import-persistence-smoke.json');
const IMPORT_IDENTITY_MANAGER = '\u4e3b\u7ba1';
const IMPORT_IDENTITY_REPORTER = '\u586b\u5831\u4eba';
const IMPORT_TITLE_MANAGER = '\u7d44\u9577';
const IMPORT_TITLE_ENGINEER = '\u5de5\u7a0b\u5e2b';

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
              token: children[0].slice(0, 2) || parent.slice(0, 2)
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

async function listTrainingRostersByNames(page, names) {
  return await page.evaluate(async (targetNames) => {
    const response = await fetch('/api/training/rosters');
    const body = await response.json();
    const items = []
      .concat(Array.isArray(body) ? body : [])
      .concat(Array.isArray(body?.items) ? body.items : [])
      .concat(Array.isArray(body?.value) ? body.value : []);
    return items.filter((item) => targetNames.includes(String(item && item.name || '').trim()));
  }, names);
}

async function waitForTrainingRostersByNames(page, names, timeout) {
  await page.waitForFunction(async (targetNames) => {
    const response = await fetch('/api/training/rosters');
    if (!response.ok) return false;
    const body = await response.json();
    const items = []
      .concat(Array.isArray(body) ? body : [])
      .concat(Array.isArray(body?.items) ? body.items : [])
      .concat(Array.isArray(body?.value) ? body.value : []);
    return targetNames.every((name) => items.some((item) => String(item && item.name || '').trim() === name));
  }, names, { timeout });
}

async function deleteTrainingRostersByNames(page, names) {
  await page.evaluate(async (targetNames) => {
    const buildEnvelope = (action, payload) => ({
      action,
      requestId: `trn-cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      context: {
        contractVersion: '2026-03-12',
        source: 'training-import-persistence-smoke',
        frontendOrigin: window.location.origin,
        frontendHash: window.location.hash || '',
        sentAt: new Date().toISOString()
      },
      payload
    });
    const response = await fetch('/api/training/rosters');
    if (!response.ok) return;
    const body = await response.json();
    const items = []
      .concat(Array.isArray(body) ? body : [])
      .concat(Array.isArray(body?.items) ? body.items : [])
      .concat(Array.isArray(body?.value) ? body.value : []);
    const matches = items.filter((item) => targetNames.includes(String(item && item.name || '').trim()));
    for (const item of matches) {
      await fetch(`/api/training/rosters/${encodeURIComponent(item.id)}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildEnvelope('training.roster.delete', {
          id: item.id,
          actorName: 'training-import-persistence-smoke',
          actorUsername: 'admin'
        }))
      });
    }
  }, names);
}

(async () => {
  const names = [
    `ImportPersist${Date.now()}A`,
    `ImportPersist${Date.now()}B`
  ];
  const results = createResultEnvelope({
    steps: [],
    context: {
      admin: { username: 'admin', password: 'admin123' },
      names,
      importUnit: ''
    }
  });

  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  attachDiagnostics(page, results);

  try {
    await resetApp(page);

    await runStep(results, 'IMP-01', '管理者', '匯入名單後需可在同一瀏覽器看見', async () => {
      await login(page, results.context.admin.username, results.context.admin.password);
      await page.waitForFunction(() => window.__REMOTE_BOOTSTRAP_STATE__ !== 'pending');
      await gotoHash(page, 'training-roster');
      await ensureTrainingImportPanelVisible(page);
      const target = await pickImportTargetUnit(page);
      results.context.importUnit = target.fullUnit;
      await selectImportTargetUnit(page, target);
      await page.fill(
        '#training-import-names',
        `${names[0]},InfoGroup,${IMPORT_IDENTITY_MANAGER},${IMPORT_TITLE_MANAGER}\n${names[1]},InfoGroup,${IMPORT_IDENTITY_REPORTER},${IMPORT_TITLE_ENGINEER}`
      );
      await page.click('[data-testid="training-import-submit"]');
      await waitForTrainingRostersByNames(page, names, 30000);
      const importedRows = await listTrainingRostersByNames(page, names);
      const importedIds = importedRows.map((item) => String(item && item.id || '').trim()).filter(Boolean);
      if (importedRows.length !== names.length) {
        throw new Error(`expected ${names.length} imported rows but found ${importedRows.length}`);
      }
      if (new Set(importedIds).size !== names.length) {
        throw new Error(`duplicate roster ids detected: ${importedIds.join(', ')}`);
      }
      return `imported ${names.join(', ')} into ${target.fullUnit}`;
    });

    await runStep(results, 'IMP-02', '管理者', '換新瀏覽器 session 仍可從遠端讀回匯入名單', async () => {
      const verifyContext = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
      const verifyPage = await verifyContext.newPage();
      attachDiagnostics(verifyPage, results);
      try {
        await login(verifyPage, results.context.admin.username, results.context.admin.password);
        await verifyPage.waitForFunction(() => window.__REMOTE_BOOTSTRAP_STATE__ !== 'pending');
        await gotoHash(verifyPage, 'training-roster');
        await waitForTrainingRostersByNames(verifyPage, names, 30000);
      } finally {
        await verifyContext.close();
      }
      return `remote sync visible in fresh session for ${results.context.importUnit}`;
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
