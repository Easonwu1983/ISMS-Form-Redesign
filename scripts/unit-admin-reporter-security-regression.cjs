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
  waitForHash,
  writeJson
} = require('./_role-test-utils.cjs');

const runMeta = createArtifactRun('unit-admin-reporter-security');
const RESULT_PATH = path.join(runMeta.outDir, 'unit-admin-reporter-security.json');
const UNIT_ADMIN_USERNAME = 'unit1';
const REPORTER_USERNAME = 'user1';
const MANUAL_ROW_NAME = 'Reporter Manual QA';

function isoDate(offsetDays) {
  const value = new Date(Date.now() + offsetDays * 86400000);
  return value.toISOString().slice(0, 10);
}

async function getDataStore(page) {
  return await readJsonFromStorage(page, 'cats_data') || { items: [], users: [] };
}

async function getChecklistStore(page) {
  return await readJsonFromStorage(page, 'cats_checklists') || { items: [] };
}

async function getTrainingStore(page) {
  return await readJsonFromStorage(page, 'cats_training_hours') || { forms: [], rosters: [], nextFormId: 1, nextRosterId: 1 };
}

async function resolveTestContext(page) {
  const store = await getDataStore(page);
  const users = Array.isArray(store.users) ? store.users : [];
  const items = Array.isArray(store.items) ? store.items : [];
  const unitAdmin = users.find((user) => user.username === UNIT_ADMIN_USERNAME);
  const reporter = users.find((user) => user.username === REPORTER_USERNAME);
  if (!unitAdmin || !reporter) {
    throw new Error(`missing seed users: ${JSON.stringify(users.map((user) => user.username))}`);
  }
  const sameUnit = String((unitAdmin.activeUnit || unitAdmin.unit || (unitAdmin.units || [])[0] || '')).trim();
  if (!sameUnit || sameUnit !== String((reporter.activeUnit || reporter.unit || (reporter.units || [])[0] || '')).trim()) {
    throw new Error(`unit mismatch for test roles: ${sameUnit} vs ${reporter.activeUnit || reporter.unit || ''}`);
  }

  const sameUnitCase = items.find((item) => String(item?.handlerUnit || '').trim() === sameUnit);
  const crossUnitPendingCase = items.find((item) => String(item?.handlerUnit || '').trim() !== sameUnit && String(item?.status || '').trim() === '待矯正');
  const crossUnitTrackingCase = items.find((item) => String(item?.handlerUnit || '').trim() !== sameUnit && String(item?.status || '').trim() === '追蹤中');

  if (!sameUnitCase || !crossUnitPendingCase || !crossUnitTrackingCase) {
    throw new Error(`unable to resolve case targets: ${JSON.stringify(items.map((item) => ({ id: item?.id, handlerUnit: item?.handlerUnit, status: item?.status })))}`);
  }

  return {
    unitAdmin,
    reporter,
    sameUnit,
    sameUnitCaseId: sameUnitCase.id,
    crossUnitPendingCaseId: crossUnitPendingCase.id,
    crossUnitTrackingCaseId: crossUnitTrackingCase.id
  };
}

async function ensureTrainingSeedRows(page, targetUnit) {
  await page.evaluate((unitValue) => {
    const raw = JSON.parse(localStorage.getItem('cats_training_hours') || '{"version":1,"payload":{"forms":[],"rosters":[],"nextFormId":1,"nextRosterId":1}}');
    const payload = raw && typeof raw === 'object' && Number.isFinite(Number(raw.version)) && Object.prototype.hasOwnProperty.call(raw, 'payload')
      ? raw.payload
      : raw;
    payload.forms = Array.isArray(payload.forms) ? payload.forms : [];
    payload.rosters = Array.isArray(payload.rosters) ? payload.rosters : [];
    payload.nextFormId = Number.isFinite(Number(payload.nextFormId)) ? Number(payload.nextFormId) : 1;
    payload.nextRosterId = Number.isFinite(Number(payload.nextRosterId)) ? Number(payload.nextRosterId) : 1;

    const keep = payload.rosters.filter((entry) => !(String(entry.unit || '').trim() === unitValue && /^SEC Imported /.test(String(entry.name || ''))));
    const nextId = payload.nextRosterId;
    const seededRows = [
      {
        id: 'RST-' + String(nextId).padStart(4, '0'),
        unit: unitValue,
        name: 'SEC Imported 1',
        unitName: unitValue,
        identity: '職員',
        jobTitle: '工程師',
        source: 'import',
        createdBy: 'security-regression',
        createdByUsername: 'security-regression',
        createdAt: new Date().toISOString()
      },
      {
        id: 'RST-' + String(nextId + 1).padStart(4, '0'),
        unit: unitValue,
        name: 'SEC Imported 2',
        unitName: unitValue,
        identity: '委外',
        jobTitle: '駐點工程師',
        source: 'import',
        createdBy: 'security-regression',
        createdByUsername: 'security-regression',
        createdAt: new Date().toISOString()
      }
    ];

    payload.rosters = keep.concat(seededRows);
    payload.nextRosterId = nextId + seededRows.length;
    localStorage.setItem('cats_training_hours', JSON.stringify({ version: 1, payload }));
  }, targetUnit);
}

async function assertBlockedRoutes(page, routes) {
  for (const route of routes) {
    await gotoHash(page, route);
    await page.waitForTimeout(220);
    const hash = await currentHash(page);
    if (hash === '#' + route || hash.startsWith('#' + route + '/')) {
      throw new Error(`unexpected route access: ${route}`);
    }
  }
}

async function assertBlockedCaseAccess(page, caseId, routePrefix) {
  await gotoHash(page, routePrefix + '/' + caseId);
  await page.waitForTimeout(220);
  const hash = await currentHash(page);
  if (hash === '#' + routePrefix + '/' + caseId) {
    throw new Error(`unexpected case access: ${routePrefix}/${caseId}`);
  }
}

(async () => {
  const results = createResultEnvelope({
    steps: [],
    context: {
      unitAdmin: { username: UNIT_ADMIN_USERNAME, password: 'unit123' },
      reporter: { username: REPORTER_USERNAME, password: 'user123' }
    }
  });

  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  attachDiagnostics(page, results);

  let checklistId = null;
  let trainingId = null;
  let ctx = null;

  try {
    await resetApp(page);
    ctx = await resolveTestContext(page);

    await runStep(results, 'UAR-SEC-01', '單位管理者', '單位管理者不可越權查看跨單位案件與管理頁', async () => {
      await login(page, results.context.unitAdmin.username, results.context.unitAdmin.password);
      await assertBlockedRoutes(page, ['create', 'users', 'login-log', 'schema-health', 'checklist-manage', 'unit-review', 'training-roster']);
      await gotoHash(page, 'detail/' + ctx.sameUnitCaseId);
      if ((await currentHash(page)) !== '#detail/' + ctx.sameUnitCaseId) throw new Error('unit admin cannot open same-unit case');
      await assertBlockedCaseAccess(page, ctx.crossUnitPendingCaseId, 'detail');
      await assertBlockedCaseAccess(page, ctx.crossUnitPendingCaseId, 'respond');
      await assertBlockedCaseAccess(page, ctx.crossUnitTrackingCaseId, 'tracking');
      return 'blocked from admin-only routes and cross-unit corrective-action flows';
    });
    await logout(page);

    await runStep(results, 'UAR-SEC-02', '填報人', '填報人不可越權查看跨單位案件與管理頁', async () => {
      await login(page, results.context.reporter.username, results.context.reporter.password);
      await assertBlockedRoutes(page, ['create', 'users', 'login-log', 'schema-health', 'checklist-manage', 'unit-review', 'training-roster']);
      await gotoHash(page, 'detail/' + ctx.sameUnitCaseId);
      if ((await currentHash(page)) !== '#detail/' + ctx.sameUnitCaseId) throw new Error('reporter cannot open same-unit case');
      await assertBlockedCaseAccess(page, ctx.crossUnitPendingCaseId, 'detail');
      await assertBlockedCaseAccess(page, ctx.crossUnitPendingCaseId, 'respond');
      await assertBlockedCaseAccess(page, ctx.crossUnitTrackingCaseId, 'tracking');
      return 'blocked from admin-only routes and cross-unit corrective-action flows';
    });
    await logout(page);

    await runStep(results, 'UAR-WF-01', '單位管理者', '單位管理者建立同單位檢核表草稿', async () => {
      await login(page, results.context.unitAdmin.username, results.context.unitAdmin.password);
      await gotoHash(page, 'checklist-fill');
      await page.waitForSelector('[data-testid="checklist-form"]');
      await page.fill('#cl-supervisor-name', '王經理');
      await page.fill('#cl-supervisor-title', '主管');
      await page.selectOption('#cl-sign-status', { index: 1 });
      await page.fill('#cl-sign-date', isoDate(0));
      await page.evaluate(() => {
        const names = Array.from(new Set(Array.from(document.querySelectorAll('.cl-radio-group input')).map((input) => input.name)));
        names.forEach((name) => {
          const target = document.querySelector(`input[name="${name}"]`);
          if (!target) throw new Error(`missing checklist radio ${name}`);
          target.checked = true;
          target.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
      await page.click('[data-testid="checklist-save-draft"]');
      await page.waitForFunction(() => String(window.location.hash || '').startsWith('#checklist-fill/'));
      checklistId = decodeURIComponent((await currentHash(page)).replace(/^#checklist-fill\//, ''));
      const store = await getChecklistStore(page);
      const item = (store.items || []).find((entry) => entry.id === checklistId);
      if (!item) throw new Error('checklist draft missing after save');
      if (item.fillerUsername !== results.context.unitAdmin.username) throw new Error('checklist owner mismatch after save');
      return checklistId;
    });
    await logout(page);

    await runStep(results, 'UAR-WF-02', '填報人', '填報人可接續提交同單位檢核表', async () => {
      if (!checklistId) throw new Error('missing checklist draft id');
      await login(page, results.context.reporter.username, results.context.reporter.password);
      await gotoHash(page, 'checklist-fill/' + checklistId);
      if ((await currentHash(page)) !== '#checklist-fill/' + checklistId) throw new Error('reporter cannot open same-unit checklist draft');
      await Promise.all([
        waitForHash(page, '#checklist-detail/' + checklistId),
        page.click('[data-testid="checklist-submit"]')
      ]);
      const store = await getChecklistStore(page);
      const item = (store.items || []).find((entry) => entry.id === checklistId);
      if (!item) throw new Error('checklist missing after submit');
      if (String(item.status || '').trim() === '暫存') throw new Error('checklist still in draft after submit');
      return checklistId;
    });
    await logout(page);

    await runStep(results, 'UAR-WF-03', '填報人', '填報人建立教育訓練草稿並新增手動名單', async () => {
      await login(page, results.context.reporter.username, results.context.reporter.password);
      await ensureTrainingSeedRows(page, ctx.sameUnit);
      await gotoHash(page, 'training-fill');
      await page.waitForSelector('[data-testid="training-form"]');
      await page.fill('#tr-phone', '02-3366-2222');
      await page.fill('#tr-email', 'user1@g.ntu.edu.tw');
      await page.fill('#tr-year', '114');
      await page.fill('#tr-date', isoDate(0));
      await page.fill('#tr-new-name', MANUAL_ROW_NAME);
      await page.fill('#tr-new-unit-name', ctx.sameUnit);
      await page.fill('#tr-new-identity', '職員');
      await page.fill('#tr-new-job-title', '分析師');
      await page.click('#training-add-person');
      await page.waitForFunction((manualName) => Array.from(document.querySelectorAll('#training-rows-body tr')).some((row) => String(row.textContent || '').includes(manualName)), MANUAL_ROW_NAME);
      await page.click('[data-testid="training-save-draft"]');
      await page.waitForFunction(() => String(window.location.hash || '').startsWith('#training-fill/'));
      trainingId = decodeURIComponent((await currentHash(page)).replace(/^#training-fill\//, ''));
      const store = await getTrainingStore(page);
      const form = (store.forms || []).find((entry) => entry.id === trainingId);
      const manualRow = (form?.records || []).find((entry) => entry.name === MANUAL_ROW_NAME);
      if (!form) throw new Error('training draft missing after save');
      if (!manualRow) throw new Error('manual row missing after save');
      if (manualRow.createdByUsername !== results.context.reporter.username) throw new Error('manual row owner mismatch');
      return trainingId;
    });
    await logout(page);

    await runStep(results, 'UAR-WF-04', '單位管理者', '單位管理者可提交同單位教育訓練且不可刪除他人手動名單', async () => {
      if (!trainingId) throw new Error('missing training draft id');
      await login(page, results.context.unitAdmin.username, results.context.unitAdmin.password);
      await gotoHash(page, 'training-fill/' + trainingId);
      if ((await currentHash(page)) !== '#training-fill/' + trainingId) throw new Error('unit admin cannot open same-unit training draft');

      const manualRow = page.locator('#training-rows-body tr', { hasText: MANUAL_ROW_NAME }).first();
      if (await manualRow.count() !== 1) throw new Error('manual row not visible to unit admin');
      if (await manualRow.locator('.training-row-delete').count() !== 0) {
        throw new Error('unit admin should not be able to delete reporter-owned manual row');
      }

      const rowCount = await page.locator('select[data-field="status"]').count();
      if (rowCount < 2) throw new Error(`expected seeded roster rows, got ${rowCount}`);
      for (let index = 0; index < rowCount; index += 1) {
        await page.locator(`select[data-idx="${index}"][data-field="status"]`).selectOption({ label: '在職' });
        await page.click(`[data-testid="training-binary-completedgeneral-${index}-yes"]`);
        await page.locator(`select[data-idx="${index}"][data-field="isInfoStaff"]`).selectOption({ label: '否' });
      }

      await Promise.all([
        waitForHash(page, '#training-detail/' + trainingId),
        page.click('[data-testid="training-submit"]')
      ]);

      const store = await getTrainingStore(page);
      const form = (store.forms || []).find((entry) => entry.id === trainingId);
      if (!form) throw new Error('training form missing after submit');
      if (String(form.status || '').trim() !== '待簽核') throw new Error(`unexpected training status ${form.status}`);
      if (!form.stepOneSubmittedAt) throw new Error('stepOneSubmittedAt missing after submit');
      return trainingId;
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
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
