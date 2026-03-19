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
const ROLE_ADMIN = 'admin';
const TEST_UNIT = '資訊網路組';
const TEST_ROWS = [
  {
    name: `BatchDelete-A-${Date.now()}`,
    unit: TEST_UNIT,
    unitName: '資訊網路組',
    identity: '校聘人員',
    jobTitle: '行政專員'
  },
  {
    name: `BatchDelete-B-${Date.now()}`,
    unit: TEST_UNIT,
    unitName: '資訊網路組',
    identity: '校聘人員',
    jobTitle: '行政組員'
  }
];

async function upsertRoster(page, payload) {
  return page.evaluate(async (entry) => {
    const token = window._authModule?.currentUser?.()?.sessionToken || '';
    const envelope = {
      action: 'training.roster.upsert',
      requestId: `batch-delete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      context: {
        contractVersion: '2026-03-12',
        source: 'training-roster-batch-delete-smoke',
        frontendOrigin: window.location.origin,
        frontendHash: window.location.hash || '',
        sentAt: new Date().toISOString()
      },
      payload: {
        ...entry,
        source: 'manual',
        actorName: 'training-roster-batch-delete-smoke',
        actorUsername: 'admin'
      }
    };
    const response = await fetch('/api/training/rosters/upsert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(envelope)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      throw new Error(String(body.message || body.error || 'training roster upsert failed'));
    }
    return body;
  }, payload);
}

async function deleteRostersByNames(page, names) {
  return page.evaluate(async (targetNames) => {
    const token = window._authModule?.currentUser?.()?.sessionToken || '';
    const response = await fetch('/api/training/rosters', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
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
        actorUsername: 'admin'
      }
    };
    const del = await fetch('/api/training/rosters/delete-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(envelope)
    });
    return del.json().catch(() => ({ ok: false }));
  }, names);
}

(async () => {
  const results = createResultEnvelope({
    steps: [],
    context: {
      admin: { username: ROLE_ADMIN, password: 'admin123' },
      unit: TEST_UNIT,
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

      for (const row of TEST_ROWS) {
        await upsertRoster(page, row);
      }

      await gotoHash(page, 'training-roster');
      await page.waitForSelector('details.training-roster-group-card', { state: 'visible', timeout: 30000 });
      const groupCount = await page.locator('details.training-roster-group-card').count();
      if (groupCount < 1) {
        throw new Error('expected grouped roster cards to render');
      }
      const rowLocator = page.locator(`tr[data-roster-name="${TEST_ROWS[0].name}"]`);
      await rowLocator.waitFor({ state: 'visible', timeout: 30000 });
      const rowNumbers = await page.locator(`tr[data-roster-name^="BatchDelete-"] .training-roster-order`).allTextContents();
      if (rowNumbers.length < 2 || rowNumbers[0].trim() !== '1' || rowNumbers[1].trim() !== '2') {
        throw new Error(`expected per-group numbering to start at 1, got ${JSON.stringify(rowNumbers)}`);
      }
      await rowLocator.locator('.training-roster-check').check();
      await page.locator(`tr[data-roster-name="${TEST_ROWS[1].name}"] .training-roster-check`).check();

      const selectedCountText = await page.locator('#training-roster-selected-count').textContent();
      if (!String(selectedCountText || '').includes('2')) {
        throw new Error(`expected selection count to show 2, got ${selectedCountText}`);
      }

      await page.click('#training-roster-delete-selected');
      await page.waitForSelector('.modal-card', { state: 'visible', timeout: 20000 });
      const modalText = await page.locator('.modal-card').textContent();
      if (!String(modalText || '').includes('確認刪除所選')) {
        throw new Error(`expected confirm modal to be visible, got ${modalText}`);
      }
      await page.click('[data-modal-confirm="1"]');

      await page.waitForFunction((names) => names.every((name) => !document.querySelector(`tr[data-roster-name="${name.replace(/"/g, '\\"')}"]`)), TEST_ROWS.map((row) => row.name), { timeout: 30000 });

      const afterCountText = await page.locator('#training-roster-selected-count').textContent();
      if (!String(afterCountText || '').includes('尚未選取人員')) {
        throw new Error(`expected selection count to clear, got ${afterCountText}`);
      }
      return 'grouping, numbering, modal, and batch delete all worked';
    });
  } finally {
    try {
      await login(page, results.context.admin.username, results.context.admin.password);
      await page.waitForFunction(() => window.__REMOTE_BOOTSTRAP_STATE__ !== 'pending');
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
