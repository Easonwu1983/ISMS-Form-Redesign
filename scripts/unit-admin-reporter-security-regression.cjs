const path = require('path');
const fs = require('fs');
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
function trace() {}
const TEMP_UNIT_ADMIN_ROLE = '單位管理員';
const TEMP_SECURITY_ROLE = '一級單位資安窗口';

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

async function hashPassword(page, password) {
  return await page.evaluate(async (value) => {
    const buffer = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
    return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }, password);
}

async function forceLocalEmulatorConfig(page) {
  await page.addInitScript(() => {
    const forceConfig = {
      authMode: 'local-emulator',
      checklistMode: 'local-emulator',
      trainingMode: 'local-emulator',
      systemUsersMode: 'local-emulator',
      reviewScopesMode: 'local-emulator',
      correctiveActionsMode: 'local-emulator',
      attachmentsMode: 'local-emulator',
      auditTrailMode: 'local-emulator'
    };
    try {
      Object.defineProperty(window, '__M365_UNIT_CONTACT_CONFIG__', {
        configurable: true,
        enumerable: true,
        get() {
          return forceConfig;
        },
        set() {
          // Keep the regression deterministic even if the page attempts to write remote config.
        }
      });
    } catch (_) {
      window.__M365_UNIT_CONTACT_CONFIG__ = forceConfig;
    }
  });
}

async function ensureLocalAdminAccount(page) {
  const state = await page.evaluate(() => {
    const authModule = window._authModule;
    const dataModule = window._dataModule;
    const hasLocalUsers = !!(authModule && typeof authModule.hasLocalUsers === 'function' && authModule.hasLocalUsers());
    const store = dataModule && typeof dataModule.loadData === 'function' ? dataModule.loadData() : null;
    const users = Array.isArray(store && store.users) ? store.users : [];
    const admin = users.find((user) => String(user && user.username || '').trim() === 'easonwu');
    return {
      hasLocalUsers,
      hasAdmin: !!admin
    };
  });

  if (state.hasAdmin) {
    return false;
  }

  const auth = await page.evaluate(async () => {
    const authModule = window._authModule;
    if (!authModule || typeof authModule.bootstrapLocalAdminAccount !== 'function') {
      throw new Error('missing auth module bootstrap');
    }
    const created = await authModule.bootstrapLocalAdminAccount({
      username: 'easonwu',
      password: 'Admin123A',
      name: '計算機及資訊網路中心',
      email: 'easonwu@g.ntu.edu.tw'
    });
    return {
      username: created && created.username ? String(created.username) : 'easonwu',
      email: created && created.email ? String(created.email) : 'easonwu@g.ntu.edu.tw'
    };
  });

  if (!auth || !auth.username) {
    throw new Error('failed to bootstrap local admin');
  }
  return true;
}

async function seedTempUnitManager(page, suffix, unit) {
  const username = `probe-unit-manager-${suffix}`;
  const password = `ProbePass${suffix}A1`;
  const passwordHash = await hashPassword(page, password);
  const created = await page.evaluate(async ({ username, passwordHash, unit, suffix, role, securityRole }) => {
    const dataModule = window._dataModule;
    if (!dataModule || typeof dataModule.addUser !== 'function' || typeof dataModule.findUser !== 'function') {
      throw new Error('missing data module');
    }
    const existing = dataModule.findUser(username);
    if (existing) return existing;
    dataModule.addUser({
      username,
      password: '',
      passwordHash,
      name: `Security Regression Manager ${suffix}`,
      email: `${username}@example.com`,
      role,
      securityRoles: [securityRole],
      unit,
      units: [unit],
      activeUnit: unit,
      forcePasswordChange: false,
      mustChangePassword: false
    });
    return dataModule.findUser(username);
  }, { username, passwordHash, unit, suffix, role: TEMP_UNIT_ADMIN_ROLE, securityRole: TEMP_SECURITY_ROLE });
  if (!created) {
    throw new Error(`failed to create temp unit manager: ${username}`);
  }
  return { username, password, unit };
}

async function deleteTempUnitManager(page, username) {
  if (!username) return;
  await page.evaluate(({ username }) => {
    const dataModule = window._dataModule;
    if (!dataModule || typeof dataModule.deleteUser !== 'function') return;
    dataModule.deleteUser(username);
  }, { username }).catch(() => {});
}

async function setLocalAuthSession(page, username) {
  await page.evaluate(async ({ username }) => {
    const dataModule = window._dataModule;
    if (!dataModule || typeof dataModule.loadData !== 'function') {
      throw new Error('missing data module');
    }
    const store = dataModule.loadData();
    const user = Array.isArray(store.users)
      ? store.users.find((entry) => String(entry && entry.username || '').trim() === String(username || '').trim())
      : null;
    if (!user) throw new Error(`missing local user ${username}`);
    const activeUnit = String(user.activeUnit || user.unit || (Array.isArray(user.units) ? user.units[0] : '') || '').trim();
    const session = {
      ...user,
      activeUnit,
      sessionToken: `LOCAL-${String(user.username || username).trim()}-${Date.now()}`,
      sessionExpiresAt: new Date(Date.now() + 3600000).toISOString()
    };
    try { sessionStorage.setItem('cats_auth', JSON.stringify(session)); } catch (_) {}
    try { localStorage.setItem('cats_auth', JSON.stringify(session)); } catch (_) {}
    try { sessionStorage.removeItem('__AUTH_VERIFY_CACHE__'); } catch (_) {}
  }, { username });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction((expectedUsername) => {
    const currentUser = window._authModule && typeof window._authModule.currentUser === 'function'
      ? window._authModule.currentUser()
      : null;
    return !!currentUser && String(currentUser.username || '').trim() === String(expectedUsername || '').trim();
  }, username, { timeout: 15000 });
}

async function signIn(page, account) {
  const username = String(account && account.username || '').trim();
  const password = String(account && account.password || '').trim();
  if (!username) throw new Error('missing account username');
  if (!password) throw new Error(`missing password for ${username}`);
  await login(page, username, password);
}

async function createCorrectiveActionViaApi(page, payload) {
  return await page.evaluate(async (input) => {
    const dataModule = window._dataModule;
    if (!dataModule || typeof dataModule.loadData !== 'function' || typeof dataModule.saveData !== 'function') {
      throw new Error('missing data module');
    }
    const store = dataModule.loadData();
    const nextItems = Array.isArray(store.items)
      ? store.items.filter((item) => String(item && item.id || '').trim() !== String(input && input.id || '').trim())
      : [];
    nextItems.push(input && typeof input === 'object' ? input : {});
    dataModule.saveData({ ...store, items: nextItems });
    return {
      ok: true,
      status: 200,
      parsed: { ok: true }
    };
  }, payload);
}

async function resolveTestContext(page) {
  const store = await getDataStore(page);
  const users = Array.isArray(store.users) ? store.users : [];
  const items = Array.isArray(store.items) ? store.items : [];
  const unitCandidates = ['主計室', '秘書室', '圖書館', '教務處', '總務處', '學務處', '人事室', '研究發展處'];
  const sameUnit = String((items.find((item) => String(item?.handlerUnit || '').trim()) || {}).handlerUnit || unitCandidates[0]).trim();
  const crossUnit = unitCandidates.find((entry) => String(entry).trim() !== sameUnit) || unitCandidates[1];

  const unitAdmin = users.find((user) => user.username === UNIT_ADMIN_USERNAME);
  const reporter = users.find((user) => user.username === REPORTER_USERNAME);
  const sameUnitCase = items.find((item) => String(item?.handlerUnit || '').trim() === sameUnit) || null;
  const crossUnitPendingCase = items.find((item) => String(item?.handlerUnit || '').trim() === crossUnit) || null;
  const crossUnitTrackingCase = crossUnitPendingCase;

  if (unitAdmin && reporter && sameUnitCase && crossUnitPendingCase) {
    const existingSameUnit = String((unitAdmin.activeUnit || unitAdmin.unit || (unitAdmin.units || [])[0] || '')).trim();
    if (!existingSameUnit || existingSameUnit !== String((reporter.activeUnit || reporter.unit || (reporter.units || [])[0] || '')).trim()) {
      throw new Error(`unit mismatch for test roles: ${existingSameUnit} vs ${reporter.activeUnit || reporter.unit || ''}`);
    }
    return {
      unitAdmin,
      reporter,
      sameUnit: existingSameUnit,
      sameUnitCaseId: sameUnitCase.id,
      crossUnitPendingCaseId: crossUnitPendingCase.id,
      crossUnitTrackingCaseId: crossUnitTrackingCase.id,
      tempAccounts: []
    };
  }

  const tempSuffix = String(Date.now());
  await ensureLocalAdminAccount(page);
  await seedTempUnitManager(page, `${tempSuffix}-adm`, sameUnit);
  const tempUnitAdmin = { username: `probe-unit-manager-${tempSuffix}-adm`, password: `ProbePass${tempSuffix}-admA1`, unit: sameUnit };
  await seedTempUnitManager(page, `${tempSuffix}-rp`, sameUnit);
  const tempReporter = { username: `probe-unit-manager-${tempSuffix}-rp`, password: `ProbePass${tempSuffix}-rpA1`, unit: sameUnit };
  await seedTempUnitManager(page, `${tempSuffix}-cross`, crossUnit);
  const tempCrossUnit = { username: `probe-unit-manager-${tempSuffix}-cross`, password: `ProbePass${tempSuffix}-crossA1`, unit: crossUnit };
  await logout(page).catch(() => {});
  const today = new Date().toISOString().slice(0, 10);
  const closeDate = new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10);
  const sameUnitId = `UAR-SEC-SAME-${tempSuffix}`;
  const crossUnitId = `UAR-SEC-CROSS-${tempSuffix}`;
  const sameUnitPayload = {
    id: sameUnitId,
    proposerUnit: sameUnit,
    proposerUnitCode: '',
    proposerName: 'Security Regression',
    proposerUsername: 'easonwu',
    proposerDate: today,
    handlerUnit: sameUnit,
    handlerUnitCode: '',
    handlerName: tempUnitAdmin.username,
    handlerUsername: tempUnitAdmin.username,
    handlerEmail: `${tempUnitAdmin.username}@example.com`,
    deficiencyType: '????',
    source: '????',
    category: ['??'],
    clause: '1.1',
    problemDesc: 'Security regression same-unit case',
    occurrence: 'Security regression same-unit case',
    correctiveDueDate: closeDate,
    notifyHandler: true,
    actorName: 'easonwu',
    actorUsername: 'easonwu'
  };
  const crossUnitPayload = {
    id: crossUnitId,
    proposerUnit: crossUnit,
    proposerUnitCode: '',
    proposerName: 'Security Regression',
    proposerUsername: 'easonwu',
    proposerDate: today,
    handlerUnit: crossUnit,
    handlerUnitCode: '',
    handlerName: tempCrossUnit.username,
    handlerUsername: tempCrossUnit.username,
    handlerEmail: `${tempCrossUnit.username}@example.com`,
    deficiencyType: '????',
    source: '????',
    category: ['??'],
    clause: '1.1',
    problemDesc: 'Security regression cross-unit case',
    occurrence: 'Security regression cross-unit case',
    correctiveDueDate: closeDate,
    notifyHandler: true,
    actorName: 'easonwu',
    actorUsername: 'easonwu'
  };
  const sameUnitCreated = await createCorrectiveActionViaApi(page, sameUnitPayload);
  if (!sameUnitCreated || !sameUnitCreated.ok) throw new Error('failed to create same-unit corrective action');
  const crossUnitCreated = await createCorrectiveActionViaApi(page, crossUnitPayload);
  if (!crossUnitCreated || !crossUnitCreated.ok) throw new Error('failed to create cross-unit corrective action');

  return {
    unitAdmin: tempUnitAdmin,
    reporter: tempReporter,
    sameUnit,
    sameUnitCaseId: sameUnitId,
    crossUnitPendingCaseId: crossUnitId,
    crossUnitTrackingCaseId: crossUnitId,
    tempAccounts: [tempUnitAdmin, tempReporter, tempCrossUnit]
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
  await forceLocalEmulatorConfig(page);

  let checklistId = null;
  let trainingId = null;
  let ctx = null;

  try {
    trace('resetApp start');
    await resetApp(page);
    trace('resetApp done');
    trace('ensureLocalAdminAccount start');
    const bootstrapped = await ensureLocalAdminAccount(page);
    trace(`ensureLocalAdminAccount done ${bootstrapped}`);
    if (bootstrapped) {
      trace('admin bootstrap reload wait start');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => {
        return window.__APP_READY__ === true
          || !!document.querySelector('[data-testid="login-form"]')
          || !!document.querySelector('.btn-logout');
      }, { timeout: 45000 });
      trace('admin bootstrap reload wait done');
    }
    trace('resolveTestContext start');
    ctx = await resolveTestContext(page);
    trace('resolveTestContext done');
    if (ctx && ctx.unitAdmin && ctx.reporter) {
      results.context.unitAdmin = { username: ctx.unitAdmin.username, password: ctx.unitAdmin.password };
      results.context.reporter = { username: ctx.reporter.username, password: ctx.reporter.password };
    }

    trace('runStep UAR-SEC-01 start');
    await runStep(results, 'UAR-SEC-01', '單位管理者', '單位管理者不可越權查看跨單位案件與管理頁', async () => {
      await signIn(page, results.context.unitAdmin);
      await assertBlockedRoutes(page, ['create', 'users', 'login-log', 'schema-health', 'checklist-manage', 'unit-review', 'training-roster']);
      await gotoHash(page, 'detail/' + ctx.sameUnitCaseId);
      if ((await currentHash(page)) !== '#detail/' + ctx.sameUnitCaseId) throw new Error('unit admin cannot open same-unit case');
      await assertBlockedCaseAccess(page, ctx.crossUnitPendingCaseId, 'detail');
      await assertBlockedCaseAccess(page, ctx.crossUnitPendingCaseId, 'respond');
      await assertBlockedCaseAccess(page, ctx.crossUnitTrackingCaseId, 'tracking');
      return 'blocked from admin-only routes and cross-unit corrective-action flows';
    });
    await logout(page);

    trace('runStep UAR-SEC-02 start');
    await runStep(results, 'UAR-SEC-02', '填報人', '填報人不可越權查看跨單位案件與管理頁', async () => {
      await signIn(page, results.context.reporter);
      await assertBlockedRoutes(page, ['create', 'users', 'login-log', 'schema-health', 'checklist-manage', 'unit-review', 'training-roster']);
      await gotoHash(page, 'detail/' + ctx.sameUnitCaseId);
      if ((await currentHash(page)) !== '#detail/' + ctx.sameUnitCaseId) throw new Error('reporter cannot open same-unit case');
      await assertBlockedCaseAccess(page, ctx.crossUnitPendingCaseId, 'detail');
      await assertBlockedCaseAccess(page, ctx.crossUnitPendingCaseId, 'respond');
      await assertBlockedCaseAccess(page, ctx.crossUnitTrackingCaseId, 'tracking');
      return 'blocked from admin-only routes and cross-unit corrective-action flows';
    });
    await logout(page);

    trace('runStep UAR-WF-01 start');
    await runStep(results, 'UAR-WF-01', '單位管理者', '單位管理者建立同單位檢核表草稿', async () => {
      await signIn(page, results.context.unitAdmin);
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

    trace('runStep UAR-WF-02 start');
    await runStep(results, 'UAR-WF-02', '填報人', '填報人可接續提交同單位檢核表', async () => {
      if (!checklistId) throw new Error('missing checklist draft id');
      await signIn(page, results.context.reporter);
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

    trace('runStep UAR-WF-03 start');
    await runStep(results, 'UAR-WF-03', '填報人', '填報人建立教育訓練草稿並新增手動名單', async () => {
      await signIn(page, results.context.reporter);
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

    trace('runStep UAR-WF-04 start');
    await runStep(results, 'UAR-WF-04', '單位管理者', '單位管理者可提交同單位教育訓練且不可刪除他人手動名單', async () => {
      if (!trainingId) throw new Error('missing training draft id');
      trace('UAR-WF-04 set session');
      await signIn(page, results.context.unitAdmin);
      trace('UAR-WF-04 goto training-fill');
      await gotoHash(page, 'training-fill/' + trainingId);
      trace('UAR-WF-04 after goto', await currentHash(page));
      if ((await currentHash(page)) !== '#training-fill/' + trainingId) throw new Error('unit admin cannot open same-unit training draft');

      const manualRow = page.locator('#training-rows-body tr', { hasText: MANUAL_ROW_NAME }).first();
      trace('UAR-WF-04 manual row count start');
      if (await manualRow.count() !== 1) throw new Error('manual row not visible to unit admin');
      trace('UAR-WF-04 manual row visible');
      if (await manualRow.locator('.training-row-delete').count() !== 0) {
        throw new Error('unit admin should not be able to delete reporter-owned manual row');
      }

      const rowCount = await page.locator('select[data-field="status"]').count();
      trace(`UAR-WF-04 rowCount ${rowCount}`);
      if (rowCount < 2) throw new Error(`expected seeded roster rows, got ${rowCount}`);
      for (let index = 0; index < rowCount; index += 1) {
        trace(`UAR-WF-04 row ${index} status`);
        await page.locator(`select[data-idx="${index}"][data-field="status"]`).selectOption({ label: '在職' });
        trace(`UAR-WF-04 row ${index} binary`);
        await page.click(`[data-testid="training-binary-completedgeneral-${index}-yes"]`);
        trace(`UAR-WF-04 row ${index} info`);
        await page.locator(`select[data-idx="${index}"][data-field="isInfoStaff"]`).selectOption({ label: '否' });
      }

      trace('UAR-WF-04 submit');
      await Promise.all([
        waitForHash(page, '#training-detail/' + trainingId),
        page.click('[data-testid="training-submit"]')
      ]);
      trace('UAR-WF-04 submitted', await currentHash(page));

      const store = await getTrainingStore(page);
      const form = (store.forms || []).find((entry) => entry.id === trainingId);
      if (!form) throw new Error('training form missing after submit');
      if (String(form.status || '').trim() !== '待簽核') throw new Error(`unexpected training status ${form.status}`);
      if (!form.stepOneSubmittedAt) throw new Error('stepOneSubmittedAt missing after submit');
      return trainingId;
    });
  } finally {
    trace('finally start');
    if (ctx && Array.isArray(ctx.tempAccounts) && ctx.tempAccounts.length) {
      trace('cleanup temp accounts start');
      await setLocalAuthSession(page, 'easonwu').catch(() => {});
      for (const account of ctx.tempAccounts) {
        await deleteTempUnitManager(page, account && account.username);
      }
      await logout(page).catch(() => {});
      trace('cleanup temp accounts done');
    }
    await browser.close();
    trace('browser closed');
    const finalized = finalizeResults(results);
    writeJson(RESULT_PATH, finalized);
    trace('results written');
    if (finalized.summary.failed || finalized.summary.pageErrors) {
      process.exitCode = 1;
    }
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});

