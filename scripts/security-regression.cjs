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
      proposerUsername: 'admin',
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
      reviewer: 'admin',
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
      fillerUsername: 'admin',
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
      fillerUsername: 'admin',
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
          createdByUsername: 'admin',
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

    await runStep(results, 'SEC-03', 'Admin', 'Security window inventory is grouped by tier', async () => {
      await login(page, 'admin', 'admin123');
      await gotoHash(page, 'security-window');
      await page.waitForSelector('.security-window-category-stack .security-window-category-card');
      const structure = await page.evaluate(() => {
        const root = document.querySelector('#app') || document.body;
        return {
          stack: Boolean(document.querySelector('.security-window-category-stack')),
          cardCount: document.querySelectorAll('.security-window-category-card').length,
          categories: Array.from(new Set(Array.from(document.querySelectorAll('.security-window-category-card[data-security-window-category]')).map((node) => String(node.getAttribute('data-security-window-category') || '').trim()).filter(Boolean))),
          text: String(root.textContent || '')
        };
      });
      if (!structure.stack) throw new Error('security window stack missing');
      if (structure.cardCount < 1) throw new Error('security window cards missing');
      const expectedCategories = ['行政單位', '學術單位', '中心', '研究單位'];
      const missingCategories = expectedCategories.filter((label) => !structure.categories.includes(label));
      if (missingCategories.length) throw new Error(`security window missing categories: ${missingCategories.join(', ')}`);
      if (!String(structure.text || '').includes('一級單位')) throw new Error('tier 1 label missing');
      if (!String(structure.text || '').includes('二級單位')) throw new Error('tier 2 label missing');
      return `security window grouped cards visible (${structure.cardCount} cards)`;
    });

    await runStep(results, 'SEC-04', 'Admin', 'Case detail escapes XSS payloads', async () => {
      await login(page, 'admin', 'admin123');
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
      await gotoHash(page, 'checklist-detail/' + CHECKLIST_ID);
      await page.waitForSelector('.detail-title');
      await assertNoXssExecution(page, 'checklist detail');
      return 'checklist detail payload rendered safely';
    });

    await runStep(results, 'SEC-06', 'Admin', 'Training detail escapes XSS payloads', async () => {
      await resetXssFlag(page);
      await gotoHash(page, 'training-detail/' + TRAINING_ID);
      await page.waitForFunction(() => {
        const title = document.querySelector('.detail-title');
        return !!title && String(title.textContent || '').includes('資安教育訓練統計');
      }, undefined, { timeout: 60000 });
      await assertNoXssExecution(page, 'training detail');
      return 'training detail payload rendered safely';
    });
  } finally {
    await browser.close();
    const finalized = finalizeResults(results);
    writeJson(RESULT_PATH, finalized);
    if (finalized.summary.failed || finalized.summary.pageErrors) process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
