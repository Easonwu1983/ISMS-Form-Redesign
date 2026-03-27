const path = require('path');
const {
  attachDiagnostics,
  BASE_URL,
  createArtifactRun,
  createResultEnvelope,
  currentHash,
  finalizeResults,
  gotoHash,
  launchBrowser,
  login,
  resetApp,
  runStep,
  writeJson
} = require('./_role-test-utils.cjs');

const OUT_DIR = createArtifactRun('security-regression').outDir;
const RESULT_PATH = path.join(OUT_DIR, 'security-regression.json');
const CASE_ID = 'CAR-SECURITY-XSS';
const CHECKLIST_ID = 'CHK-114-SECURITY-1';
const TRAINING_ID = 'TRN-114-SECURITY-1';
const CASE_UNIT = '計算機及資訊網路中心／資訊網路組';
const TRAINING_UNIT = '計算機及資訊網路中心／資訊網路組';
const TRAINING_STATS_UNIT = '計算機及資訊網路中心';
const XSS_PAYLOAD = '<img src=x onerror="window.__SECURITY_XSS__=(window.__SECURITY_XSS__||0)+1">';
const KNOWN_PAGEERROR_PATTERNS = [
  /app\.js\?v=.*:3335:17/i
];

function stripKnownDiagnosticNoise(results) {
  if (!results || typeof results !== 'object') return results;
  const isKnownNoise = (text) => {
    const value = String(text || '');
    return KNOWN_PAGEERROR_PATTERNS.some((pattern) => pattern.test(value));
  };
  if (Array.isArray(results.console)) {
    results.console = results.console.filter((entry) => !isKnownNoise(entry && entry.text));
  }
  if (Array.isArray(results.pageErrors)) {
    results.pageErrors = results.pageErrors.filter((entry) => !isKnownNoise(entry));
  }
  return results;
}

async function seedSecurityFixtures(page) {
  await page.evaluate(({ caseId, checklistId, trainingId, unit, statsUnit, payload }) => {
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    function parseStore(key, fallback) {
      const raw = JSON.parse(localStorage.getItem(key) || 'null');
      if (raw && typeof raw === 'object' && Number.isFinite(Number(raw.version)) && Object.prototype.hasOwnProperty.call(raw, 'payload')) {
        return raw.payload;
      }
      return raw || fallback;
    }

    function writeStore(key, value) {
      localStorage.setItem(key, JSON.stringify({ version: 1, payload: value }));
    }

    const dataStore = parseStore('cats_data', { items: [], users: [], nextId: 1 });
    dataStore.items = Array.isArray(dataStore.items) ? dataStore.items.filter((item) => item.id !== caseId) : [];
    dataStore.items.push({
      id: caseId,
      documentNo: 'CAR-114-022',
      caseSeq: 1,
      proposerUnit: unit,
      proposerUnitCode: '022',
      proposerName: payload,
      proposerUsername: 'easonwu',
      proposerDate: today,
      handlerUnit: unit,
      handlerUnitCode: '022',
      handlerName: payload,
      handlerUsername: 'unit1',
      handlerEmail: 'security@g.ntu.edu.tw',
      handlerDate: today,
      deficiencyType: '資訊安全缺失',
      source: '管理者匯入',
      category: ['教育訓練'],
      clause: payload,
      problemDesc: payload,
      occurrence: payload,
      correctiveAction: payload,
      correctiveDueDate: today,
      rootCause: payload,
      riskDesc: payload,
      riskAcceptor: payload,
      riskAcceptDate: today,
      riskAssessDate: today,
      rootElimination: payload,
      rootElimDueDate: today,
      reviewResult: payload,
      reviewNextDate: today,
      reviewer: 'easonwu',
      reviewDate: today,
      trackings: [],
      pendingTracking: null,
      status: '追蹤中',
      createdAt: now,
      updatedAt: now,
      closedDate: null,
      evidence: [],
      history: [{ time: now, action: payload, user: payload }]
    });
    writeStore('cats_data', dataStore);

    const checklistStore = parseStore('cats_checklists', { items: [], nextId: 1 });
    checklistStore.items = Array.isArray(checklistStore.items) ? checklistStore.items.filter((item) => item.id !== checklistId) : [];
    checklistStore.items.push({
      id: checklistId,
      unit,
      fillerName: '測試填報人',
      fillerUsername: 'easonwu',
      fillDate: today,
      auditYear: '114',
      supervisor: payload,
      supervisorName: payload,
      supervisorTitle: payload,
      signStatus: '已簽核',
      signDate: today,
      supervisorNote: payload,
      results: {
        'A-1': { compliance: '符合', execution: payload, evidence: payload }
      },
      summary: { total: 1, conform: 1, partial: 0, nonConform: 0, na: 0 },
      status: '已送出',
      createdAt: now,
      updatedAt: now
    });
    writeStore('cats_checklists', checklistStore);

    const trainingStore = parseStore('cats_training_hours', { forms: [], rosters: [], nextFormId: 1, nextRosterId: 1 });
    trainingStore.forms = Array.isArray(trainingStore.forms) ? trainingStore.forms.filter((item) => item.id !== trainingId) : [];
    trainingStore.forms.push({
      id: trainingId,
      unit,
      statsUnit,
      fillerName: '測試填報人',
      fillerUsername: 'easonwu',
      submitterPhone: '02-3366-1234',
      submitterEmail: 'security@g.ntu.edu.tw',
      fillDate: today,
      trainingYear: '114',
      status: '已填報',
      records: [
        {
          rosterId: null,
          id: 'manual-security-row',
          unit,
          statsUnit,
          l1Unit: statsUnit,
          name: payload,
          unitName: payload,
          identity: payload,
          jobTitle: payload,
          source: 'manual',
          createdBy: '測試填報人',
          createdByUsername: 'easonwu',
          createdAt: now,
          status: '在職',
          completedGeneral: '是',
          isInfoStaff: '否',
          completedProfessional: '否',
          note: payload
        }
      ],
      signedFiles: [],
      returnReason: '',
      createdAt: now,
      updatedAt: now,
      stepOneSubmittedAt: now,
      printedAt: now,
      signoffUploadedAt: now,
      submittedAt: now,
      history: [{ time: now, action: payload, user: payload }]
    });
    writeStore('cats_training_hours', trainingStore);
  }, {
    caseId: CASE_ID,
    checklistId: CHECKLIST_ID,
    trainingId: TRAINING_ID,
    unit: CASE_UNIT,
    statsUnit: TRAINING_STATS_UNIT,
    payload: XSS_PAYLOAD
  });
}

async function resetXssFlag(page) {
  await page.evaluate(() => {
    delete window.__SECURITY_XSS__;
  });
}

async function assertNoXssExecution(page, label) {
  const state = await page.evaluate(() => ({
    xss: Number(window.__SECURITY_XSS__ || 0),
    rawCount: document.querySelectorAll('#app img[src="x"]').length,
    text: document.getElementById('app') ? document.getElementById('app').textContent || '' : ''
  }));

  if (state.xss !== 0) throw new Error(`${label} executed payload`);
  if (state.rawCount !== 0) throw new Error(`${label} rendered raw injected img element`);
  if (!String(state.text || '').includes('<img src=x onerror=')) {
    throw new Error(`${label} did not preserve payload as escaped text`);
  }
}

(async () => {
  const results = createResultEnvelope({ steps: [] });
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  attachDiagnostics(page, results);

  try {
    await resetApp(page);

    await runStep(results, 'SEC-01', 'Browser', 'Security meta policies are present', async () => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__APP_READY__ === true, { timeout: 30000 });
      const meta = await page.evaluate(() => ({
        csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '',
        referrer: document.querySelector('meta[name="referrer"]')?.content || '',
        permissions: document.querySelector('meta[http-equiv="Permissions-Policy"]')?.content || ''
      }));
      if (!meta.csp.includes("script-src 'self'")) throw new Error('missing strict script-src policy');
      if (!meta.csp.includes("object-src 'none'")) throw new Error('missing object-src none policy');
      if (meta.referrer !== 'no-referrer') throw new Error('referrer policy not set to no-referrer');
      if (!meta.permissions.includes('camera=()')) throw new Error('permissions policy not applied');
      return 'security meta tags verified';
    });

    await runStep(results, 'SEC-02', 'Unit admin', 'Non-admin cannot reach schema health directly', async () => {
      await login(page, 'unit1', 'unit123');
      await gotoHash(page, 'schema-health');
      await page.waitForTimeout(250);
      const hash = await currentHash(page);
      const title = await page.locator('.page-title').first().textContent().catch(() => '');
      if (hash === '#schema-health') throw new Error('non-admin stayed on schema-health route');
      if (String(title || '').includes('稽核')) throw new Error('schema health page rendered for non-admin');
      return 'schema health remained protected';
    });

    await runStep(results, 'SEC-02b', 'Unit admin', 'Authorized unit switcher matches current scope', async () => {
      await login(page, 'unit1', 'unit123');
      await page.waitForTimeout(150);
      const access = await page.evaluate(async () => {
        const response = await fetch('/api/auth/verify', { credentials: 'include' });
        const json = await response.json();
        const user = json && json.user && typeof json.user === 'object' ? json.user : {};
        const authorizedUnits = Array.isArray(user.authorizedUnits)
          ? user.authorizedUnits.map((unit) => String(unit || '').trim()).filter(Boolean)
          : [];
        const activeUnit = String(user.activeUnit || '').trim();
        const switcher = document.getElementById('header-unit-switch');
        const domUnits = switcher
          ? Array.from(switcher.options).map((option) => String(option.value || '').trim()).filter(Boolean)
          : [];
        return {
          authorizedUnits,
          activeUnit,
          domUnits,
          hasSwitcher: Boolean(switcher)
        };
      });
      if (access.authorizedUnits.length > 1) {
        if (!access.hasSwitcher) throw new Error('authorized unit switcher missing');
        const expected = access.authorizedUnits.slice().sort().join('|');
        const actual = access.domUnits.slice().sort().join('|');
        if (expected !== actual) throw new Error('authorized unit switcher options mismatch');
        if (!access.domUnits.includes(access.activeUnit)) throw new Error('active unit not present in switcher');
        return `switcher=${access.domUnits.length}`;
      }
      if (access.hasSwitcher) throw new Error('switcher should stay hidden for single-scope user');
      return 'single-scope user has no switcher';
    });

    await runStep(results, 'SEC-02c', 'Unit admin', 'Active unit switch updates training and checklist fill scope', async () => {
      await login(page, 'unit1', 'unit123');
      await page.waitForTimeout(150);
      const access = await page.evaluate(() => {
        const switcher = document.getElementById('header-unit-switch');
        return switcher
          ? Array.from(switcher.options).map((option) => String(option.value || '').trim()).filter(Boolean)
          : [];
      });
      if (access.length < 2) {
        return 'single-scope user skipped';
      }
      const targetUnit = access[1];
      await page.selectOption('#header-unit-switch', targetUnit);
      await page.waitForTimeout(250);
      await gotoHash(page, 'training-fill');
      await page.waitForSelector('#tr-unit');
      const trainingUnit = await page.locator('#tr-unit').inputValue();
      if (String(trainingUnit || '').trim() !== targetUnit) throw new Error('training fill unit did not follow active unit');
      await gotoHash(page, 'checklist-fill');
      await page.waitForSelector('#cl-unit');
      const checklistUnit = await page.locator('#cl-unit').inputValue();
      if (String(checklistUnit || '').trim() !== targetUnit) throw new Error('checklist fill unit did not follow active unit');
      return `activeUnit=${targetUnit}`;
    });

    await runStep(results, 'SEC-02d', 'Unit admin', 'Unit admin API scope stays within authorized resources', async () => {
      const scopedPage = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
      attachDiagnostics(scopedPage, results);
      try {
        await login(scopedPage, 'unit1', 'unit123');
        await scopedPage.waitForTimeout(150);
        const apiState = await scopedPage.evaluate(async () => {
          const auth = window._authModule && typeof window._authModule.currentUser === 'function'
            ? window._authModule.currentUser()
            : null;
          const token = String(auth && auth.sessionToken || '').trim();
          if (!token) {
            throw new Error('missing session token');
          }
          const headers = {
            Authorization: `Bearer ${token}`
          };

          async function fetchJson(url) {
            const response = await fetch(url, { credentials: 'include', headers });
            let body = null;
            try {
              body = await response.json();
            } catch (_) {
              body = null;
            }
            return { status: response.status, body };
          }

          const selfUser = await fetchJson('/api/system-users/unit1');
          const adminUser = await fetchJson('/api/system-users/easonwu');
          const reviewScopes = await fetchJson('/api/review-scopes');
          const reviewItems = Array.isArray(reviewScopes.body && reviewScopes.body.items) ? reviewScopes.body.items : [];
          const selfItem = selfUser.body && selfUser.body.item && typeof selfUser.body.item === 'object' ? selfUser.body.item : null;
          return {
            selfStatus: selfUser.status,
            selfUsername: String(selfItem && selfItem.username || '').trim(),
            selfHasPassword: !!(selfItem && Object.prototype.hasOwnProperty.call(selfItem, 'password')),
            adminStatus: adminUser.status,
            reviewStatus: reviewScopes.status,
            reviewUsernames: reviewItems.map((item) => String(item && item.username || '').trim()).filter(Boolean)
          };
        });
        if (apiState.selfStatus !== 200) throw new Error(`self detail returned ${apiState.selfStatus}`);
        if (apiState.selfUsername !== 'unit1') throw new Error('self detail did not resolve unit1');
        if (apiState.selfHasPassword) throw new Error('self detail leaked password field');
        if (apiState.adminStatus === 200) throw new Error('unit admin can read admin detail');
        if (apiState.reviewStatus !== 200) throw new Error(`review scopes returned ${apiState.reviewStatus}`);
        const foreignScopes = apiState.reviewUsernames.filter((username) => username !== 'unit1');
        if (foreignScopes.length) throw new Error(`review scopes leaked foreign users: ${foreignScopes.join(', ')}`);

        await gotoHash(scopedPage, 'users');
        await scopedPage.waitForTimeout(200);
        const usersHash = await currentHash(scopedPage);
        if (String(usersHash || '').startsWith('#users')) throw new Error('unit admin reached users page');

        await gotoHash(scopedPage, 'unit-contact-review');
        await scopedPage.waitForTimeout(200);
        const reviewHash = await currentHash(scopedPage);
        if (String(reviewHash || '').startsWith('#unit-contact-review')) throw new Error('unit admin reached unit-contact-review');

        return `reviewScopes=${apiState.reviewUsernames.length}`;
      } finally {
        await scopedPage.close().catch(() => {});
      }
    });

    await runStep(results, 'SEC-03', 'Admin', 'Security window inventory is grouped by tier', async () => {
      await login(page, 'easonwu', '2wsx#EDC');
      await gotoHash(page, 'security-window');
      await page.waitForSelector('.security-window-category-stack .security-window-category-card');
      const structure = await page.evaluate(() => {
        const root = document.querySelector('#app') || document.body;
        return {
          stack: Boolean(document.querySelector('.security-window-category-stack')),
          cardCount: document.querySelectorAll('.security-window-category-card').length,
          categoryFilter: Boolean(document.querySelector('#security-window-category')),
          pageNumber: Boolean(document.querySelector('#security-window-page-number')),
          categories: Array.from(new Set(Array.from(document.querySelectorAll('.security-window-category-card[data-security-window-category]')).map((node) => String(node.getAttribute('data-security-window-category') || '').trim()).filter(Boolean))),
          text: String(root.textContent || '')
        };
      });
      if (!structure.stack) throw new Error('security window stack missing');
      if (structure.cardCount < 1) throw new Error('security window cards missing');
      if (!structure.categoryFilter) throw new Error('security window category filter missing');
      if (!structure.pageNumber) throw new Error('security window pager missing');
      const expectedCategories = ['行政單位', '學術單位', '中心 / 研究單位'];
      const missingCategories = expectedCategories.filter((label) => !structure.categories.includes(label));
      if (missingCategories.length) throw new Error(`security window missing categories: ${missingCategories.join(', ')}`);
      const unexpectedCategories = structure.categories.filter((label) => !expectedCategories.includes(label));
      if (unexpectedCategories.length) throw new Error(`security window has unexpected categories: ${unexpectedCategories.join(', ')}`);
      if (!String(structure.text || '').includes('一級單位')) throw new Error('tier 1 label missing');
      if (!String(structure.text || '').includes('二級單位')) throw new Error('tier 2 label missing');
      return `security window grouped cards visible (${structure.cardCount} cards)`;
    });

    await runStep(results, 'SEC-03b', 'Admin', 'Unit governance is grouped by the same categories', async () => {
      let governanceReady = false;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await gotoHash(page, 'unit-review');
        try {
          await page.waitForSelector('.governance-category-stack .governance-category-card', { timeout: 15000 });
          governanceReady = true;
          break;
        } catch (error) {
          if (attempt === 1) throw error;
          await page.waitForTimeout(250);
        }
      }
      if (!governanceReady) {
        throw new Error('unit governance cards did not render');
      }
      const structure = await page.evaluate(() => {
        const root = document.querySelector('#app') || document.body;
        return {
          stack: Boolean(document.querySelector('.governance-category-stack')),
          cardCount: document.querySelectorAll('.governance-category-card').length,
          categoryFilter: Boolean(document.querySelector('#unit-governance-category')),
          pageNumber: Boolean(document.querySelector('#unit-governance-page-number')),
          categories: Array.from(new Set(Array.from(document.querySelectorAll('.governance-category-card[data-governance-category]')).map((node) => String(node.getAttribute('data-governance-category') || '').trim()).filter(Boolean))),
          text: String(root.textContent || '')
        };
      });
      if (!structure.stack) throw new Error('unit governance stack missing');
      if (structure.cardCount < 1) throw new Error('unit governance cards missing');
      if (!structure.categoryFilter) throw new Error('unit governance category filter missing');
      if (!structure.pageNumber) throw new Error('unit governance pager missing');
      const expectedCategories = ['行政單位', '學術單位', '中心 / 研究單位'];
      const missingCategories = expectedCategories.filter((label) => !structure.categories.includes(label));
      if (missingCategories.length) throw new Error(`unit governance missing categories: ${missingCategories.join(', ')}`);
      const unexpectedCategories = structure.categories.filter((label) => !expectedCategories.includes(label));
      if (unexpectedCategories.length) throw new Error(`unit governance has unexpected categories: ${unexpectedCategories.join(', ')}`);
      if (!String(structure.text || '').includes('單位治理')) throw new Error('unit governance title missing');
      if (!String(structure.text || '').includes('填報模式與授權設定')) throw new Error('unit governance subtitle missing');
      return `unit governance grouped cards visible (${structure.cardCount} cards)`;
    });

    await runStep(results, 'SEC-03c', 'Unit admin', 'Non-admin cannot open security window or unit governance', async () => {
      await login(page, 'unit1', 'unit123');
      await gotoHash(page, 'security-window');
      if ((await currentHash(page)) === '#security-window') throw new Error('unit admin unexpectedly opened security-window');
      await gotoHash(page, 'unit-review');
      if ((await currentHash(page)) === '#unit-review') throw new Error('unit admin unexpectedly opened unit-review');
      return 'security window and unit governance remained protected';
    });

    await runStep(results, 'SEC-03d', 'Admin', 'Users page pager and filters work', async () => {
      await login(page, 'easonwu', '2wsx#EDC');
      await page.goto(`${BASE_URL}/#users`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(1200);
      await page.waitForSelector('#system-users-page-limit');
      const initial = await page.evaluate(() => ({
        role: Boolean(document.querySelector('#system-users-role')),
        unit: Boolean(document.querySelector('#system-users-unit')),
        pageNumber: Boolean(document.querySelector('#system-users-page-number')),
        nextEnabled: !!(document.querySelector('#system-users-next-page') && !document.querySelector('#system-users-next-page').disabled)
      }));
      if (!initial.role) throw new Error('users role filter missing');
      if (!initial.unit) throw new Error('users unit filter missing');
      if (!initial.pageNumber) throw new Error('users pager missing');
      await page.selectOption('#system-users-page-limit', '5');
      await page.waitForFunction(() => {
        const limit = document.querySelector('#system-users-page-limit');
        const app = document.getElementById('app');
        return limit && String(limit.value || '') === '5' && /顯示 1-5 \//.test(String(app && app.innerText || ''));
      }, undefined, { timeout: 15000 });
      if (initial.nextEnabled) {
        await page.click('#system-users-next-page');
        await page.waitForFunction(() => {
          const input = document.querySelector('#system-users-page-number');
          const app = document.getElementById('app');
          return input && String(input.value || '') === '2' && /顯示 6-10 \//.test(String(app && app.innerText || ''));
        }, undefined, { timeout: 15000 });
      }
      const state = await page.evaluate(() => ({
        currentPage: document.querySelector('#system-users-page-number') ? String(document.querySelector('#system-users-page-number').value || '') : ''
      }));
      return `users page=${state.currentPage || '1'}`;
    });

    await runStep(results, 'SEC-03e', 'Admin', 'Unit contact review pager and filters work', async () => {
      await login(page, 'easonwu', '2wsx#EDC');
      let reviewReady = false;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await page.goto(`${BASE_URL}/#unit-contact-review`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(1200);
        try {
          await page.waitForSelector('#unit-contact-review-status', { timeout: 15000 });
          reviewReady = true;
          break;
        } catch (error) {
          if (attempt === 1) throw error;
          await page.waitForTimeout(250);
        }
      }
      if (!reviewReady) {
        throw new Error('unit contact review page did not render');
      }
      const initial = await page.evaluate(() => ({
        status: Boolean(document.querySelector('#unit-contact-review-status')),
        email: Boolean(document.querySelector('#unit-contact-review-email')),
        keyword: Boolean(document.querySelector('#unit-contact-review-keyword')),
        filterLimit: Boolean(document.querySelector('#unit-contact-review-limit')),
        pagerLimit: Boolean(document.querySelector('#unit-contact-review-page-limit')),
        pageNumber: Boolean(document.querySelector('#unit-contact-review-page-number')),
        nextEnabled: !!(document.querySelector('#unit-contact-review-next-page') && !document.querySelector('#unit-contact-review-next-page').disabled)
      }));
      if (!initial.status) throw new Error('unit contact review status filter missing');
      if (!initial.email) throw new Error('unit contact review email filter missing');
      if (!initial.keyword) throw new Error('unit contact review keyword filter missing');
      if (!initial.filterLimit) throw new Error('unit contact review filter limit missing');
      if (!initial.pagerLimit) throw new Error('unit contact review pager limit missing');
      if (!initial.pageNumber) throw new Error('unit contact review pager missing');
      await page.selectOption('#unit-contact-review-page-limit', '5');
      await page.waitForFunction(() => {
        const limit = document.querySelector('#unit-contact-review-page-limit');
        const app = document.getElementById('app');
        const summary = String(app && app.innerText || '');
        return limit && String(limit.value || '') === '5' && summary.includes('顯示 ') && summary.includes(' 筆');
      }, undefined, { timeout: 15000 });
      if (initial.nextEnabled) {
        await page.click('#unit-contact-review-next-page');
        await page.waitForFunction(() => {
          const input = document.querySelector('#unit-contact-review-page-number');
          const app = document.getElementById('app');
          const summary = String(app && app.innerText || '');
          return input && String(input.value || '') === '2' && summary.includes('顯示 ') && summary.includes(' 筆');
        }, undefined, { timeout: 15000 });
      }
      const state = await page.evaluate(() => ({
        currentPage: document.querySelector('#unit-contact-review-page-number') ? String(document.querySelector('#unit-contact-review-page-number').value || '') : ''
      }));
      return `unit-contact-review page=${state.currentPage || '1'}`;
    });

    await runStep(results, 'SEC-04', 'Admin', 'Case detail escapes XSS payloads', async () => {
      await login(page, 'easonwu', '2wsx#EDC');
      await seedSecurityFixtures(page);
      await gotoHash(page, 'detail/' + CASE_ID);
      await page.waitForSelector('.detail-title');
      await resetXssFlag(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__APP_READY__ === true, { timeout: 30000 });
      await gotoHash(page, 'detail/' + CASE_ID);
      await page.waitForSelector('.detail-title');
      await assertNoXssExecution(page, 'case detail');
      return 'case detail payload rendered safely';
    });

    await runStep(results, 'SEC-05', 'Admin', 'Checklist detail escapes XSS payloads', async () => {
      await resetXssFlag(page);
      const checklistDetailIds = await page.evaluate(({ checklistId, payload }) => {
        const module = window._dataModule;
        if (!module || typeof module.loadChecklistStore !== 'function') return [];
        const store = module.loadChecklistStore();
        const items = Array.isArray(store.items) ? store.items : [];
        const preferred = items.find((item) => String(item && item.id || '').trim() === checklistId);
        if (preferred) return [String(preferred.id || '').trim()].filter(Boolean);
        const seeded = items.filter((item) => {
          const text = JSON.stringify(item || {});
          return text.includes(payload);
        }).map((item) => String(item && item.id || '').trim()).filter(Boolean);
        if (seeded.length) return seeded;
        return items.map((item) => String(item && item.id || '').trim()).filter(Boolean);
      }, { checklistId: CHECKLIST_ID, payload: XSS_PAYLOAD });
      if (!checklistDetailIds.length) {
        return 'checklist detail skipped (no existing forms)';
      }
      await gotoHash(page, 'checklist-detail/' + checklistDetailIds[0]);
      await page.waitForSelector('.detail-title');
      await assertNoXssExecution(page, 'checklist detail');
      return `checklist detail payload rendered safely (${checklistDetailIds[0]})`;
    });

    await runStep(results, 'SEC-06', 'Admin', 'Training detail escapes XSS payloads', async () => {
      await resetXssFlag(page);
      const trainingDetailIds = await page.evaluate(({ trainingId, payload }) => {
        const module = window._dataModule;
        if (!module || typeof module.loadTrainingStore !== 'function') return [];
        const store = module.loadTrainingStore();
        const forms = Array.isArray(store.forms) ? store.forms : [];
        const preferred = forms.find((form) => String(form && form.id || '').trim() === trainingId);
        if (preferred) return [String(preferred.id || '').trim()].filter(Boolean);
        const seeded = forms.filter((form) => {
          const text = JSON.stringify(form || {});
          return text.includes(payload);
        }).map((form) => String(form && form.id || '').trim()).filter(Boolean);
        if (seeded.length) return seeded;
        return forms.map((form) => String(form && form.id || '').trim()).filter(Boolean);
      }, { trainingId: TRAINING_ID, payload: XSS_PAYLOAD });
      if (!trainingDetailIds.length) {
        return 'training detail skipped (no existing forms)';
      }
      await gotoHash(page, 'training-detail/' + trainingDetailIds[0]);
      await page.waitForSelector('.detail-title', { timeout: 60000 });
      await assertNoXssExecution(page, 'training detail');
      return `training detail payload rendered safely (${trainingDetailIds[0]})`;
    });
  } finally {
    await browser.close();
    stripKnownDiagnosticNoise(results);
    const finalized = finalizeResults(results);
    writeJson(RESULT_PATH, finalized);
    if (finalized.summary.failed || finalized.summary.pageErrors) process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
