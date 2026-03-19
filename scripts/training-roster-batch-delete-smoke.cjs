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

async function getSessionToken(page) {
  return page.evaluate(() => {
    const currentUser = window._authModule && typeof window._authModule.currentUser === 'function'
      ? window._authModule.currentUser()
      : null;
    return String(currentUser && currentUser.sessionToken || '').trim();
  });
}

async function upsertRoster(page, payload) {
  const token = await getSessionToken(page);
  if (!token) throw new Error('missing session token for roster upsert');
  return page.evaluate(async ({ entry, sessionToken }) => {
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
        Authorization: `Bearer ${sessionToken}`
      },
      body: JSON.stringify(envelope)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      throw new Error(String(body.message || body.error || 'training roster upsert failed'));
    }
    return body;
  }, { entry: payload, sessionToken: token });
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
        actorUsername: 'admin'
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

async function expandRosterGroups(page) {
  await page.evaluate(() => {
    document.querySelectorAll('details.training-roster-group-card').forEach((element) => {
      element.open = true;
    });
  });
  await page.waitForTimeout(200);
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
      await page.waitForFunction(() => {
        const currentUser = window._authModule && typeof window._authModule.currentUser === 'function'
          ? window._authModule.currentUser()
          : null;
        return !!(currentUser && String(currentUser.sessionToken || '').trim());
      }, undefined, { timeout: 30000 });

      for (const row of TEST_ROWS) {
        await upsertRoster(page, row);
      }

      await gotoHash(page, 'training-roster');
      await page.waitForSelector('details.training-roster-group-card', { state: 'visible', timeout: 30000 });
      await expandRosterGroups(page);
      const groupCount = await page.locator('details.training-roster-group-card').count();
      if (groupCount < 1) {
        throw new Error('expected grouped roster cards to render');
      }

      const firstRow = page.locator(`tr[data-roster-name="${TEST_ROWS[0].name}"]`);
      await firstRow.waitFor({ state: 'visible', timeout: 30000 });
      const rowNumbers = await page.locator(`tr[data-roster-group="${TEST_UNIT}"] .training-roster-order`).allTextContents();
      if (rowNumbers.length < 2 || rowNumbers[0].trim() !== '1' || rowNumbers[1].trim() !== '2') {
        throw new Error(`expected per-group numbering to start at 1, got ${JSON.stringify(rowNumbers)}`);
      }

      await firstRow.locator('.training-roster-check').check();
      await page.locator(`tr[data-roster-name="${TEST_ROWS[1].name}"] .training-roster-check`).check();

      const selectedCountText = await page.locator('#training-roster-selected-count').textContent();
      if (!String(selectedCountText || '').includes('2')) {
        throw new Error(`expected selection count to show 2, got ${selectedCountText}`);
      }

      await page.click('#training-roster-delete-selected');
      await page.waitForSelector('.modal-card', { state: 'visible', timeout: 20000 });
      const modalText = await page.locator('.modal-card').textContent();
      if (!String(modalText || '').includes('確認刪除')) {
        throw new Error(`expected confirm modal to be visible, got ${modalText}`);
      }
      await page.locator('[data-modal-confirm="1"]').click();

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
