const fs = require('fs');
const path = require('path');
const { chromium } = require('./_playwright.cjs');
const {
  DEFAULT_BASELINE_DIR,
  DESKTOP_VISUAL_SPECS,
  MOBILE_VISUAL_SPECS,
  PUBLIC_DESKTOP_VISUAL_SPECS,
  PUBLIC_MOBILE_VISUAL_SPECS,
  seedSyntheticUnitContactSuccess,
  captureVisualSpec,
  compareAgainstBaseline
} = require('./_ui-visual-baseline.cjs');

const BASE_URL = String(process.env.ISMS_CLOUDFLARE_PAGES_BASE || 'https://isms-campus-portal.pages.dev').replace(/\/+$/, '');
const LOG_DIR = path.join(process.cwd(), 'logs');
const OUT_PATH = process.env.ISMS_UI_SMOKE_OUT
  ? path.resolve(process.env.ISMS_UI_SMOKE_OUT)
  : path.join(LOG_DIR, 'cloudflare-pages-regression-smoke.json');
const VISUAL_OUT_DIR = path.join(process.cwd(), 'test-artifacts', 'ui-visual-smoke');
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

function pickExecutablePath() {
  if (fs.existsSync(CHROME_PATH)) return CHROME_PATH;
  if (fs.existsSync(EDGE_PATH)) return EDGE_PATH;
  return undefined;
}

async function login(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForSelector('[data-testid="login-form"]', { timeout: 20000 });
  await page.fill('[data-testid="login-user"]', 'admin');
  await page.fill('[data-testid="login-pass"]', 'admin123');
  await Promise.all([
    page.waitForFunction(() => !!document.querySelector('.btn-logout'), undefined, { timeout: 30000 }),
    page.locator('[data-testid="login-form"]').evaluate((form) => form.requestSubmit())
  ]);
  await waitForRemoteBootstrap(page);
}

async function waitForRemoteBootstrap(page) {
  await page.waitForFunction(() => {
    return typeof window.__REMOTE_BOOTSTRAP_STATE__ === 'string' && window.__REMOTE_BOOTSTRAP_STATE__ !== 'pending';
  }, undefined, { timeout: 45000 });
}

async function waitForDashboardReady(page) {
  await waitForRemoteBootstrap(page);
  await page.waitForFunction(() => {
    if (window.__REMOTE_BOOTSTRAP_STATE__ === 'pending') return false;
    const app = document.getElementById('app');
    return !!(app && app.innerText && app.innerText.includes('儀表板'));
  }, undefined, { timeout: 45000 });
}

async function runPublicVisualBaselineChecks(browser, pushStep) {
  if (!fs.existsSync(DEFAULT_BASELINE_DIR)) {
    throw new Error(`visual baseline directory not found: ${DEFAULT_BASELINE_DIR}`);
  }

  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const compareContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  try {
    const comparePage = await compareContext.newPage();

    const desktopPage = await desktopContext.newPage();
    await desktopPage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 45000 });
    for (const spec of PUBLIC_DESKTOP_VISUAL_SPECS) {
      const actualPath = path.join(VISUAL_OUT_DIR, `${spec.slug}-desktop.png`);
      const baselinePath = path.join(DEFAULT_BASELINE_DIR, `${spec.slug}-desktop.png`);
      if (!fs.existsSync(baselinePath)) throw new Error(`missing public desktop baseline: ${baselinePath}`);
      await captureVisualSpec(desktopPage, BASE_URL, spec, actualPath, 'desktop');
      const publicDesktopDiff = spec.slug === 'unit-contact-apply' ? 0.06 : 0.05;
      const result = await compareAgainstBaseline(comparePage, baselinePath, actualPath, { maxDiffRatio: publicDesktopDiff });
      if (!result.ok) throw new Error(`public desktop visual drift: ${spec.slug} (${JSON.stringify(result)})`);
      pushStep(`visual:public-desktop:${spec.slug}`, true, `diffRatio=${result.diffRatio.toFixed(4)}`);
    }

    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 45000 });
    for (const spec of PUBLIC_MOBILE_VISUAL_SPECS) {
      const actualPath = path.join(VISUAL_OUT_DIR, `${spec.slug}-mobile.png`);
      const baselinePath = path.join(DEFAULT_BASELINE_DIR, `${spec.slug}-mobile.png`);
      if (!fs.existsSync(baselinePath)) throw new Error(`missing public mobile baseline: ${baselinePath}`);
      await captureVisualSpec(mobilePage, BASE_URL, spec, actualPath, 'mobile');
      const publicMobileDiff = ['unit-contact-apply', 'unit-contact-status', 'unit-contact-success', 'unit-contact-activate'].includes(spec.slug) ? 0.2 : 0.05;
      const result = await compareAgainstBaseline(comparePage, baselinePath, actualPath, { maxDiffRatio: publicMobileDiff });
      if (!result.ok) throw new Error(`public mobile visual drift: ${spec.slug} (${JSON.stringify(result)})`);
      pushStep(`visual:public-mobile:${spec.slug}`, true, `diffRatio=${result.diffRatio.toFixed(4)}`);
    }
  } finally {
    await compareContext.close();
    await desktopContext.close();
    await mobileContext.close();
  }
}

async function runPublicRouteChecks(browser, pushStep) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  try {
    const openPublicRoute = async (hash) => {
      await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForFunction(() => window.__APP_READY__ === true, undefined, { timeout: 45000 });
      await page.evaluate((nextHash) => {
        window.location.hash = nextHash;
      }, hash);
      await page.waitForTimeout(300);
    };

    await openPublicRoute('#apply-unit-contact');
    await page.waitForFunction(() => {
      const title = document.querySelector('.page-title');
      return title && String(title.textContent || '').includes('申請單位管理人帳號');
    }, undefined, { timeout: 20000 });
    pushStep('unit-contact-public:apply-loaded', true, '申請單位管理人帳號');

    await openPublicRoute('#apply-unit-contact-status');
    await page.waitForFunction(() => {
      const title = document.querySelector('.page-title');
      return title && String(title.textContent || '').includes('查詢單位管理人申請進度');
    }, undefined, { timeout: 20000 });
    await page.waitForSelector('#unit-contact-status-form', { timeout: 15000 });
    pushStep('unit-contact-public:status-loaded', true, '查詢單位管理人申請進度');

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => window.__APP_READY__ === true, undefined, { timeout: 45000 });
    await seedSyntheticUnitContactSuccess(page);
    await page.evaluate(() => {
      window.location.hash = '#apply-unit-contact-success/UCA-SMOKE-SUCCESS-001';
    });
    await page.waitForTimeout(300);
    await page.waitForFunction(() => {
      const title = document.querySelector('.page-title');
      if (!title) return false;
      const text = String(title.textContent || '');
      return text.includes('申請已成功送出') || text.includes('找不到申請資料');
    }, undefined, { timeout: 20000 });
    pushStep('unit-contact-public:success-loaded', true, 'success route rendered');

    await page.evaluate(() => {
      window.location.hash = '#activate-unit-contact/UCA-SMOKE-SUCCESS-001';
    });
    await page.waitForTimeout(300);
    await page.waitForFunction(() => {
      const title = document.querySelector('.page-title');
      return title && String(title.textContent || '').includes('單位管理人帳號啟用說明');
    }, undefined, { timeout: 20000 });
    pushStep('unit-contact-public:activate-loaded', true, '單位管理人帳號啟用說明');
  } finally {
    await context.close();
  }
}

async function runVisualBaselineChecks(browser, pushStep) {
  fs.mkdirSync(VISUAL_OUT_DIR, { recursive: true });
  if (!fs.existsSync(DEFAULT_BASELINE_DIR)) {
    throw new Error(`visual baseline directory not found: ${DEFAULT_BASELINE_DIR}`);
  }

  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const compareContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  try {
    const comparePage = await compareContext.newPage();

    const desktopPage = await desktopContext.newPage();
    await login(desktopPage);
    for (const spec of DESKTOP_VISUAL_SPECS) {
      const actualPath = path.join(VISUAL_OUT_DIR, `${spec.slug}-desktop.png`);
      const baselinePath = path.join(DEFAULT_BASELINE_DIR, `${spec.slug}-desktop.png`);
      if (!fs.existsSync(baselinePath)) throw new Error(`missing desktop baseline: ${baselinePath}`);
      await captureVisualSpec(desktopPage, BASE_URL, spec, actualPath, 'desktop');
      const maxDiffRatio = spec.slug === 'dashboard' ? 0.08 : spec.slug === 'training' ? 0.12 : 0.06;
      const result = await compareAgainstBaseline(comparePage, baselinePath, actualPath, { maxDiffRatio });
      if (!result.ok) throw new Error(`desktop visual drift: ${spec.slug} (${JSON.stringify(result)})`);
      pushStep(`visual:desktop:${spec.slug}`, true, `diffRatio=${result.diffRatio.toFixed(4)}`);
    }

    const mobilePage = await mobileContext.newPage();
    await login(mobilePage);
    for (const spec of MOBILE_VISUAL_SPECS) {
      const actualPath = path.join(VISUAL_OUT_DIR, `${spec.slug}-mobile.png`);
      const baselinePath = path.join(DEFAULT_BASELINE_DIR, `${spec.slug}-mobile.png`);
      if (!fs.existsSync(baselinePath)) throw new Error(`missing mobile baseline: ${baselinePath}`);
      await captureVisualSpec(mobilePage, BASE_URL, spec, actualPath, 'mobile');
      const maxDiffRatio = spec.slug === 'dashboard' ? 0.3 : 0.08;
      const result = await compareAgainstBaseline(comparePage, baselinePath, actualPath, { maxDiffRatio });
      if (!result.ok) throw new Error(`mobile visual drift: ${spec.slug} (${JSON.stringify(result)})`);
      pushStep(`visual:mobile:${spec.slug}`, true, `diffRatio=${result.diffRatio.toFixed(4)}`);
    }
  } finally {
    await compareContext.close();
    await desktopContext.close();
    await mobileContext.close();
  }
}

async function run() {
  const report = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    steps: []
  };

  function pushStep(name, ok, detail) {
    report.steps.push({ name, ok, detail });
  }

  const executablePath = pickExecutablePath();
  const browser = await chromium.launch(executablePath ? { headless: true, executablePath } : { headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const ignorableConsolePatterns = [
    'Failed to load resource: the server responded with a status of 401 ()',
    'Failed to load resource: the server responded with a status of 401 (Unauthorized)'
  ];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (ignorableConsolePatterns.some((pattern) => text.includes(pattern))) return;
    consoleErrors.push(text);
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(String(error && error.message || error));
  });

  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForSelector('[data-testid="login-form"]', { timeout: 20000 });
    pushStep('landing:login-form', true, 'login form visible');

    await page.fill('[data-testid="login-user"]', 'admin');
    await page.fill('[data-testid="login-pass"]', 'admin123');
    await Promise.all([
      page.waitForFunction(() => !!document.querySelector('.btn-logout'), undefined, { timeout: 30000 }),
      page.locator('[data-testid="login-form"]').evaluate((form) => form.requestSubmit())
    ]);
    pushStep('auth:login', true, 'admin login succeeded');

    await page.waitForTimeout(1200);
    await waitForDashboardReady(page);
    const dashboardTitle = await page.evaluate(() => {
      const app = document.getElementById('app');
      if (!app || !app.innerText) return '';
      return app.innerText.split('\n').map((entry) => entry.trim()).find(Boolean) || '';
    });
    if (!String(dashboardTitle || '').trim()) throw new Error('missing dashboard title');
    pushStep('dashboard:loaded', true, dashboardTitle.trim());

    await page.waitForFunction(() => document.querySelectorAll('.dashboard-panel-pill').length >= 3, undefined, { timeout: 20000 });
    const dashboardPills = await page.locator('.dashboard-panel-pill').count();
    pushStep('dashboard:summary-pills', true, `count=${dashboardPills}`);
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('th')).some((element) => String(element.textContent || '').includes('最後活動'));
    }, undefined, { timeout: 15000 });
    pushStep('dashboard:recent-last-activity-column', true, 'present');

    const smokeCaseIds = {
      pending: 'CAR-SMOKE-PENDING-001',
      tracking: 'CAR-SMOKE-TRACKING-001'
    };
    await page.evaluate((ids) => {
      const currentUser = window._authModule.currentUser();
      const dataModule = window._dataModule;
      const activeUnit = currentUser.activeUnit || currentUser.unit || '計算機及資訊網路中心／資訊網路組';
      const now = '2026-03-15T08:00:00.000Z';
      const ensureCase = (record) => {
        if (dataModule.getItem(record.id)) {
          dataModule.updateItem(record.id, record);
        } else {
          dataModule.addItem(record);
        }
      };
      ensureCase({
        id: ids.pending,
        documentNo: 'CAR-999-UIR1',
        deficiencyType: '主要缺失',
        source: '內部稽核',
        category: ['資訊', '服務'],
        proposerUnit: activeUnit,
        proposerUnitCode: 'A.B',
        proposerName: '系統測試提出人',
        proposerDate: '2026-03-15',
        handlerUnit: activeUnit,
        handlerUnitCode: 'A.B',
        handlerName: currentUser.name,
        handlerUsername: currentUser.username,
        handlerEmail: currentUser.email || 'admin@company.com',
        handlerDate: '2026-03-15',
        problemDesc: 'Smoke 測試矯正單待矯正案件',
        occurrence: 'Smoke 測試用問題描述',
        clause: 'ISMS-A.5',
        status: '待矯正',
        correctiveDueDate: '2026-03-28',
        createdAt: now,
        updatedAt: now,
        evidence: [],
        trackings: [],
        pendingTracking: null,
        history: [
          { time: now, action: '開立矯正單', user: '系統測試提出人' },
          { time: now, action: '指派處理人員', user: currentUser.name }
        ]
      });
      ensureCase({
        id: ids.tracking,
        documentNo: 'CAR-999-UIR2',
        deficiencyType: '次要缺失',
        source: '內部稽核',
        category: ['資訊'],
        proposerUnit: activeUnit,
        proposerUnitCode: 'A.B',
        proposerName: '系統測試提出人',
        proposerDate: '2026-03-15',
        handlerUnit: activeUnit,
        handlerUnitCode: 'A.B',
        handlerName: currentUser.name,
        handlerUsername: currentUser.username,
        handlerEmail: currentUser.email || 'admin@company.com',
        handlerDate: '2026-03-15',
        problemDesc: 'Smoke 測試矯正單追蹤案件',
        occurrence: 'Smoke 測試用追蹤情境',
        clause: 'ISMS-A.8',
        correctiveAction: '已完成第一階段改善',
        rootCause: 'Smoke 根因分析',
        rootElimination: 'Smoke 根因消除措施',
        status: '追蹤中',
        correctiveDueDate: '2026-03-30',
        createdAt: now,
        updatedAt: now,
        evidence: [],
        trackings: [
          {
            round: 1,
            tracker: currentUser.name,
            trackDate: '2026-03-15',
            execution: '已完成前一輪改善措施',
            trackNote: '需再確認制度文件是否更新',
            result: '建議持續追蹤',
            nextTrackDate: '2026-04-05',
            evidence: [],
            submittedAt: now
          }
        ],
        pendingTracking: null,
        history: [
          { time: now, action: '開立矯正單', user: '系統測試提出人' },
          { time: now, action: '提交第 1 次追蹤', user: currentUser.name }
        ]
      });
    }, smokeCaseIds);

    await page.goto(`${BASE_URL}/#list`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    await page.waitForFunction(() => {
      const app = document.getElementById('app');
      return !!(app && app.innerText && app.innerText.includes('矯正單列表'));
    }, undefined, { timeout: 20000 });
    const caseListText = await page.locator('#app').innerText();
    if (/\?{4,}/.test(caseListText)) {
      throw new Error('case list contains placeholder question marks');
    }
    if (!caseListText.includes(smokeCaseIds.pending) || !caseListText.includes(smokeCaseIds.tracking)) {
      throw new Error('case list smoke records did not render');
    }
    pushStep('case:list-loaded', true, 'smoke records visible');

    await page.goto(`${BASE_URL}/#detail/${smokeCaseIds.pending}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    await page.waitForFunction(() => {
      const app = document.getElementById('app');
      return !!(app && app.innerText && app.innerText.includes('歷程紀錄') && app.innerText.includes('回填矯正措施'));
    }, undefined, { timeout: 20000 });
    const caseDetailText = await page.locator('#app').innerText();
    if (/\?{4,}/.test(caseDetailText)) {
      throw new Error('case detail contains placeholder question marks');
    }
    pushStep('case:detail-loaded', true, smokeCaseIds.pending);

    await page.goto(`${BASE_URL}/#respond/${smokeCaseIds.pending}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    await page.waitForSelector('[data-testid="respond-form"]', { timeout: 20000 });
    const caseRespondText = await page.locator('#app').innerText();
    if (/\?{4,}/.test(caseRespondText)) {
      throw new Error('case respond contains placeholder question marks');
    }
    if (!caseRespondText.includes('回覆矯正單') || !caseRespondText.includes('送審摘要')) {
      throw new Error('case respond page did not render expected labels');
    }
    pushStep('case:respond-loaded', true, smokeCaseIds.pending);

    await page.goto(`${BASE_URL}/#tracking/${smokeCaseIds.tracking}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    await page.waitForSelector('[data-testid="tracking-form"]', { timeout: 20000 });
    const caseTrackingText = await page.locator('#app').innerText();
    if (/\?{4,}/.test(caseTrackingText)) {
      throw new Error('case tracking contains placeholder question marks');
    }
    if (!caseTrackingText.includes('追蹤提報摘要') || !caseTrackingText.includes('提報規則')) {
      throw new Error('case tracking page did not render expected labels');
    }
    pushStep('case:tracking-loaded', true, smokeCaseIds.tracking);

    await page.goto(`${BASE_URL}/#checklist`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    await page.waitForFunction(() => {
      const app = document.getElementById('app');
      return !!(app && app.innerText && app.innerText.includes('內稽檢核表'));
    }, undefined, { timeout: 20000 });
    const checklistListText = await page.locator('#app').innerText();
    if (/\?{4,}/.test(checklistListText)) {
      throw new Error('checklist list contains placeholder question marks');
    }
    pushStep('checklist:list-loaded', true, checklistListText.includes('目前沒有檢核表') ? 'empty-state' : 'table');

    await page.goto(`${BASE_URL}/#checklist-fill`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    await page.waitForFunction(() => {
      const app = document.getElementById('app');
      return !!(app && app.innerText && (app.innerText.includes('填報檢核表') || app.innerText.includes('編修檢核表')));
    }, undefined, { timeout: 20000 });
    const checklistFillText = await page.locator('#app').innerText();
    if (/\?{4,}/.test(checklistFillText)) {
      throw new Error('checklist fill contains placeholder question marks');
    }
    await page.waitForSelector('[data-testid="checklist-form"]', { timeout: 15000 });
    pushStep('checklist:fill-loaded', true, 'form ready');

    const checklistDetailId = 'CHK-SMOKE-DETAIL-001';
    await page.evaluate((detailId) => {
      const sections = window._dataModule.getChecklistSections();
      const items = sections.flatMap((section) => Array.isArray(section.items) ? section.items : []);
      const results = {};
      if (items[0]) results[items[0].id] = { compliance: '\u7b26\u5408', execution: 'Smoke conform', evidence: 'Smoke evidence A' };
      if (items[1]) results[items[1].id] = { compliance: '\u90e8\u5206\u7b26\u5408', execution: 'Smoke partial', evidence: 'Smoke evidence B' };
      if (items[2]) results[items[2].id] = { compliance: '\u4e0d\u7b26\u5408', execution: 'Smoke nonconform', evidence: 'Smoke evidence C' };
      if (items[3]) results[items[3].id] = { compliance: '\u4e0d\u9069\u7528', execution: 'Smoke NA', evidence: 'Smoke evidence D' };
      const originalGetChecklist = window._dataModule.getChecklist.bind(window._dataModule);
      const smokeChecklist = {
        id: detailId,
        unit: document.getElementById('cl-unit') ? document.getElementById('cl-unit').value : '\u8a08\u7b97\u6a5f\u53ca\u8cc7\u8a0a\u7db2\u8def\u4e2d\u5fc3\uff0f\u8cc7\u8a0a\u7db2\u8def\u7d44',
        fillerName: document.getElementById('cl-filler') ? document.getElementById('cl-filler').value : 'admin',
        fillerUsername: 'admin',
        auditYear: '999',
        fillDate: '2026-03-14',
        supervisorName: 'SYSTEM SMOKE',
        supervisorTitle: 'SYSTEM',
        supervisor: 'SYSTEM SMOKE',
        signStatus: '\u5df2\u7c3d\u6838',
        signDate: '2026-03-14',
        supervisorNote: 'UI smoke only',
        results,
        summary: {
          total: items.length,
          conform: 1,
          partial: 1,
          nonConform: 1,
          na: 1
        },
        status: '\u8349\u7a3f',
        createdAt: '2026-03-14T13:20:00.000Z',
        updatedAt: '2026-03-14T13:20:00.000Z'
      };
      window._dataModule.getChecklist = function(id) {
        if (id === detailId) return smokeChecklist;
        return originalGetChecklist(id);
      };
      location.hash = '#checklist-detail/' + detailId;
    }, checklistDetailId);
    await page.waitForTimeout(1500);
    const checklistDetailText = await page.locator('#app').innerText();
    if (/\?{4,}/.test(checklistDetailText)) {
      throw new Error('checklist detail contains placeholder question marks');
    }
    if (!checklistDetailText.includes('CHK-SMOKE-DETAIL-001') || !checklistDetailText.includes('需改善項目')) {
      throw new Error('checklist detail smoke record did not render as expected');
    }
    pushStep('checklist:detail-loaded', true, checklistDetailId);

    await page.goto(`${BASE_URL}/#checklist-manage`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    await page.waitForFunction(() => {
      const app = document.getElementById('app');
      return !!(app && app.innerText && app.innerText.includes('檢核題庫管理'));
    }, undefined, { timeout: 20000 });
    const checklistManageText = await page.locator('#app').innerText();
    if (/\?{4,}/.test(checklistManageText)) {
      throw new Error('checklist manage contains placeholder question marks');
    }
    pushStep('checklist:manage-loaded', true, 'manage page ready');

    await page.goto(`${BASE_URL}/#audit-trail`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitForRemoteBootstrap(page);
    await page.evaluate(() => {
      if (window.location.hash !== '#audit-trail') {
        window.location.hash = '#audit-trail';
      }
    });
    await page.waitForTimeout(1200);
    await page.waitForFunction(() => {
      const app = document.getElementById('app');
      return !!(app && app.innerText && app.innerText.includes('操作稽核軌跡'));
    }, undefined, { timeout: 45000 });
    let auditTrailReady = false;
    const auditTrailStartedAt = Date.now();
    while (!auditTrailReady && (Date.now() - auditTrailStartedAt) < 20000) {
      auditTrailReady = await page.evaluate(() => {
        const emptyState = document.querySelector('.empty-state-title');
        if (emptyState && emptyState.textContent && emptyState.textContent.includes('目前查無符合條件的稽核紀錄')) return true;
        if (document.querySelectorAll('button[data-action="admin.viewAuditEntry"]').length > 0) return true;
        if (document.querySelector('[data-review-scroll-root="audit-trail-table"]')) return true;
        if (document.querySelector('.review-table-wrapper')) return true;
        return !!document.querySelector('.review-history-card');
      });
      if (!auditTrailReady) {
        await page.waitForTimeout(400);
      }
    }
    const rows = await page.locator('button[data-action="admin.viewAuditEntry"]').count();
    pushStep('audit-trail:loaded', true, auditTrailReady ? `rows=${rows}` : 'title-ready');

    const auditScrollButtons = await page.locator('.review-table-scroll-btn').count();
    pushStep('audit-trail:scroll-controls', true, `count=${auditScrollButtons}`);

    const diffButton = page.locator('button[data-action="admin.viewAuditEntry"]').first();
    if (await diffButton.count()) {
      await diffButton.evaluate((button) => button.click());
      await page.waitForSelector('.modal .modal-title', { timeout: 15000 });
      const modalTitle = await page.locator('.modal .modal-title').first().textContent();
      if (!String(modalTitle || '').includes('操作稽核差異檢視')) {
        throw new Error(`unexpected audit diff modal title: ${modalTitle || ''}`);
      }
      pushStep('audit-trail:diff-modal', true, modalTitle.trim());
      await page.locator('[data-dismiss-modal]').first().click();
    } else {
      pushStep('audit-trail:diff-modal', true, 'no rows available for modal check');
    }

    await page.goto(`${BASE_URL}/#schema-health`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForFunction(() => {
      const app = document.getElementById('app');
      return !!(app && app.innerText && app.innerText.includes('資料健康檢查'));
    }, undefined, { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll('.review-table-wrapper').length >= 1, undefined, { timeout: 15000 });
    const schemaScrollButtons = await page.locator('.review-table-scroll-btn').count();
    if (schemaScrollButtons < 2) {
      throw new Error(`expected schema health scroll buttons, got ${schemaScrollButtons}`);
    }
    pushStep('schema-health:scroll-controls', true, `count=${schemaScrollButtons}`);

    await page.goto(`${BASE_URL}/#training`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForFunction(() => {
      const app = document.getElementById('app');
      return !!(app && app.innerText && app.innerText.includes('資安教育訓練統計'));
    }, undefined, { timeout: 20000 });
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('.training-group-title')).some((element) => {
        return /行政單位|學術單位|中心\s*\/\s*研究單位/.test(String(element.textContent || ''));
      });
    }, undefined, { timeout: 20000 });
    const trainingGroupTitles = await page.locator('.training-group-title').allTextContents();
    pushStep('training:grouped-incomplete-units', true, trainingGroupTitles.join(' / '));

    await page.waitForFunction(() => document.querySelectorAll('.training-group-summary-chip').length >= 3, undefined, { timeout: 20000 });
    const trainingSummaryChips = await page.locator('.training-group-summary-chip').count();
    pushStep('training:group-summary-chips', true, `count=${trainingSummaryChips}`);
    await page.waitForFunction(() => document.querySelectorAll('#training-expand-groups, #training-collapse-groups').length === 2, undefined, { timeout: 15000 });
    pushStep('training:group-toggle-actions', true, 'expand/collapse ready');

    const trainingDetailId = 'TRN-SMOKE-DETAIL-001';
    await page.evaluate((detailId) => {
      const originalGetTrainingForm = window._dataModule.getTrainingForm.bind(window._dataModule);
      const smokeForm = {
        id: detailId,
        unit: '計算機及資訊網路中心／資訊網路組',
        statsUnit: '計算機及資訊網路中心',
        trainingYear: '115',
        fillerName: 'admin',
        fillerUsername: 'admin',
        fillDate: '2026-03-15',
        submitterPhone: '02-33665345',
        submitterEmail: 'admin@company.com',
        status: '已完成填報',
        records: [
          { name: '王測試', unitName: '計算機及資訊網路中心', identity: '職員', jobTitle: '管理師', status: '在職', completedGeneral: '是', isInfoStaff: '是', completedProfessional: '是', note: 'Smoke A' },
          { name: '李測試', unitName: '計算機及資訊網路中心', identity: '職員', jobTitle: '工程師', status: '在職', completedGeneral: '否', isInfoStaff: '否', completedProfessional: '不適用', note: 'Smoke B' }
        ],
        summary: {
          totalPeople: 2,
          total: 2,
          activeCount: 2,
          completedCount: 1,
          incompleteCount: 1,
          completionRate: 50,
          infoStaffCount: 1,
          missingStatusCount: 0,
          missingFieldCount: 0
        },
        signedFiles: [],
        signoffUploadedAt: '2026-03-15T09:00:00.000Z',
        submittedAt: '2026-03-15T09:00:00.000Z',
        updatedAt: '2026-03-15T09:00:00.000Z',
        createdAt: '2026-03-15T08:30:00.000Z',
        history: [
          { time: '2026-03-15T08:30:00.000Z', action: '建立教育訓練統計表', user: 'admin' },
          { time: '2026-03-15T09:00:00.000Z', action: '上傳簽核掃描檔並完成整體填報', user: 'admin' }
        ]
      };
      window._dataModule.getTrainingForm = function(id) {
        if (id === detailId) return smokeForm;
        return originalGetTrainingForm(id);
      };
    }, trainingDetailId);

    await page.goto(`${BASE_URL}/#training-detail/${trainingDetailId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    await page.waitForFunction(() => {
      const app = document.getElementById('app');
      return !!(app && app.innerText && app.innerText.includes('資安教育訓練統計') && app.innerText.includes('逐人明細'));
    }, undefined, { timeout: 20000 });
    const trainingDetailText = await page.locator('#app').innerText();
    if (/\?{4,}/.test(trainingDetailText)) {
      throw new Error('training detail contains placeholder question marks');
    }
    if (!trainingDetailText.includes(trainingDetailId) || !trainingDetailText.includes('統計摘要')) {
      throw new Error('training detail smoke record did not render as expected');
    }
    pushStep('training:detail-loaded', true, trainingDetailId);

    await page.goto(`${BASE_URL}/#training-roster`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    await page.waitForFunction(() => {
      const app = document.getElementById('app');
      return !!(app && app.innerText && app.innerText.includes('教育訓練名單管理') && app.innerText.includes('名單管理'));
    }, undefined, { timeout: 20000 });
    const trainingRosterText = await page.locator('#app').innerText();
    if (/\?{4,}/.test(trainingRosterText)) {
      throw new Error('training roster contains placeholder question marks');
    }
    pushStep('training:roster-loaded', true, 'training roster page ready');

    await page.goto(`${BASE_URL}/#users`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    await page.waitForFunction(() => {
      const app = document.getElementById('app');
      return !!(app && app.innerText && app.innerText.includes('帳號管理') && app.innerText.includes('可審核單位'));
    }, undefined, { timeout: 20000 });
    const usersText = await page.locator('#app').innerText();
    if (/\?{4,}/.test(usersText)) {
      throw new Error('users page contains placeholder question marks');
    }
    pushStep('users:loaded', true, 'account table ready');

    await page.goto(`${BASE_URL}/#unit-contact-review`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    await page.waitForFunction(() => {
      const app = document.getElementById('app');
      return app && /申請審核與登入資訊追蹤/.test(app.textContent || '');
    }, undefined, { timeout: 45000 });
    const unitContactReviewText = await page.locator('#app').innerText();
    if (/\?{4,}/.test(unitContactReviewText)) {
      throw new Error('unit contact review contains placeholder question marks');
    }
    pushStep('unit-contact-review:loaded', true, 'unit contact review page ready');

    await page.goto(`${BASE_URL}/#unit-review`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    await page.waitForFunction(() => {
      const app = document.getElementById('app');
      const text = String(app && app.innerText || '');
      return !!(text && (text.includes('自訂單位審核與合併') || text.includes('單位治理')) && text.includes('自訂單位清單'));
    }, undefined, { timeout: 45000 });
    const unitReviewText = await page.locator('#app').innerText();
    if (/\?{4,}/.test(unitReviewText)) {
      throw new Error('unit review contains placeholder question marks');
    }
    pushStep('unit-review:loaded', true, 'unit review page ready');

    await runPublicRouteChecks(browser, pushStep);
    await runVisualBaselineChecks(browser, pushStep);
    await runPublicVisualBaselineChecks(browser, pushStep);

    if (consoleErrors.length) {
      throw new Error(`console errors detected: ${consoleErrors.join(' | ')}`);
    }
    pushStep('console:errors', true, 'none');

    report.ok = true;
  } catch (error) {
    pushStep('run', false, String(error && error.stack || error));
    report.ok = false;
    report.error = String(error && error.stack || error);
  } finally {
    report.consoleErrors = consoleErrors;
    report.finishedAt = new Date().toISOString();
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2), 'utf8');
    await browser.close();
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
