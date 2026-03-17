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
const ROLE_ADMIN = '\u6700\u9ad8\u7ba1\u7406\u8005';
const TITLE_IMPORT_PERSIST = '\u8cbc\u4e0a\u532f\u5165\u5f8c\uff0c\u8cc7\u6599\u6703\u5beb\u5165\u9060\u7aef roster \u4e14 id \u552f\u4e00';
const TITLE_IMPORT_RESYNC = '\u63db\u65b0\u700f\u89bd\u5668 session \u5f8c\u4ecd\u80fd\u8b80\u56de\u525b\u532f\u5165\u7684\u4eba\u54e1';
const IMPORT_IDENTITY_MANAGER = '\u4e3b\u7ba1';
const IMPORT_IDENTITY_REPORTER = '\u586b\u5831\u4eba';
const IMPORT_TITLE_MANAGER = '\u7d44\u9577';
const IMPORT_TITLE_ENGINEER = '\u5de5\u7a0b\u5e2b';
const IMPORT_TARGET_UNIT = '\u8a08\u7b97\u6a5f\u53ca\u8cc7\u8a0a\u7db2\u8def\u4e2d\u5fc3\uff0f\u8cc7\u8a0a\u7db2\u8def\u7d44';

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

async function listTrainingRostersByNames(page, names) {
  return await page.evaluate(async (targetNames) => {
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

async function waitForTrainingRostersByNames(page, names, timeout) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeout) {
    const rows = await listTrainingRostersByNames(page, names);
    if (names.every((name) => rows.some((row) => String((row && row.name) || '').trim() === name))) {
      return rows;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`training rosters not visible after ${timeout}ms: ${names.join(', ')}`);
}

async function waitForTrainingRosterRowsByNames(page, names, timeout) {
  await page.waitForFunction((targetNames) => {
    const rows = Array.from(document.querySelectorAll('tr[data-roster-name]')).map((row) => String(row.dataset.rosterName || '').trim());
    return targetNames.every((name) => rows.includes(name));
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
    const token = window._authModule?.currentUser?.()?.sessionToken || '';
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

    await runStep(results, 'IMP-01', ROLE_ADMIN, TITLE_IMPORT_PERSIST, async () => {
      await login(page, results.context.admin.username, results.context.admin.password);
      await page.waitForFunction(() => window.__REMOTE_BOOTSTRAP_STATE__ !== 'pending');
      await gotoHash(page, 'training-roster');
      await ensureTrainingImportPanelVisible(page);
      results.context.importUnit = IMPORT_TARGET_UNIT;
      await page.evaluate(({ unit, managerName, reporterName, managerIdentity, managerTitle, reporterIdentity, reporterTitle }) => {
        document.getElementById('training-import-unit').value = unit;
        document.getElementById('training-import-names').value = `${managerName},InfoGroup,${managerIdentity},${managerTitle}\n${reporterName},InfoGroup,${reporterIdentity},${reporterTitle}`;
      }, {
        unit: IMPORT_TARGET_UNIT,
        managerName: names[0],
        reporterName: names[1],
        managerIdentity: IMPORT_IDENTITY_MANAGER,
        managerTitle: IMPORT_TITLE_MANAGER,
        reporterIdentity: IMPORT_IDENTITY_REPORTER,
        reporterTitle: IMPORT_TITLE_ENGINEER
      });
      await page.click('[data-testid="training-import-submit"]');
      await waitForTrainingRostersByNames(page, names, 30000);
      await waitForTrainingRosterRowsByNames(page, names, 30000);
      const importedRows = await listTrainingRostersByNames(page, names);
      const importedIds = importedRows.map((item) => String((item && item.id) || '').trim()).filter(Boolean);
      if (importedRows.length !== names.length) {
        throw new Error(`expected ${names.length} imported rows but found ${importedRows.length}`);
      }
      if (new Set(importedIds).size !== names.length) {
        throw new Error(`duplicate roster ids detected: ${importedIds.join(', ')}`);
      }
      return `imported ${names.join(', ')} into ${results.context.importUnit}`;
    });

    await runStep(results, 'IMP-02', ROLE_ADMIN, TITLE_IMPORT_RESYNC, async () => {
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
