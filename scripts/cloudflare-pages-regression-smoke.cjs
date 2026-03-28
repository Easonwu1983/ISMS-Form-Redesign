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
const IS_CAMPUS_BROWSER = /^https?:\/\/127\.0\.0\.1:8088$/i.test(BASE_URL);
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

async function login(page, username = 'easonwu', password = '2wsx#EDC') {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 45000 });
  const alreadyAuthenticated = await page.locator('.btn-logout').count();
  if (!alreadyAuthenticated) {
    await page.waitForSelector('[data-testid="login-form"]', { timeout: 20000 });
    await page.fill('[data-testid="login-user"]', username);
    await page.fill('[data-testid="login-pass"]', password);
    await Promise.all([
      page.waitForFunction(() => !!document.querySelector('.btn-logout'), undefined, { timeout: 30000 }),
      page.locator('[data-testid="login-form"]').evaluate((form) => form.requestSubmit())
    ]);
  }
  await waitForRemoteBootstrap(page);
  await page.waitForSelector('.sidebar-footer [data-testid="app-version-chip"]', { timeout: 30000 });
  const sidebarVersion = await page.locator('.sidebar-footer [data-testid="app-version-chip"]').first().textContent();
  if (!String(sidebarVersion || '').trim()) {
    throw new Error('sidebar version chip missing');
  }
}

async function runUnitAdminScopeChecks(browser, pushStep) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await login(page, 'unit1', 'unit123');
    pushStep('unit-admin:login', true, 'unit admin login succeeded');

    const apiState = await page.evaluate(async () => {
      const user = window._authModule && typeof window._authModule.currentUser === 'function'
        ? window._authModule.currentUser()
        : null;
      const token = String(user && user.sessionToken || '').trim();
      if (!token) throw new Error('missing unit admin session token');
      const fetchJson = async (path) => {
        const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
        let json = null;
        try { json = await response.json(); } catch (_) { json = null; }
        return { status: response.status, json };
      };
      const selfUser = await fetchJson('/api/system-users/unit1');
      const adminUser = await fetchJson('/api/system-users/easonwu');
      const reviewScopes = await fetchJson('/api/review-scopes');
      return {
        selfStatus: selfUser.status,
        selfUsername: selfUser.json && selfUser.json.item && selfUser.json.item.username,
        selfHasPassword: !!(selfUser.json && selfUser.json.item && Object.prototype.hasOwnProperty.call(selfUser.json.item, 'password')),
        adminStatus: adminUser.status,
        reviewStatus: reviewScopes.status,
        reviewUsernames: Array.isArray(reviewScopes.json && reviewScopes.json.items)
          ? reviewScopes.json.items.map((item) => String(item && item.username || '').trim()).filter(Boolean)
          : []
      };
    });
    if (apiState.selfStatus !== 200 || apiState.selfUsername !== 'unit1') {
      throw new Error(`unit admin self detail invalid: ${JSON.stringify(apiState)}`);
    }
    if (apiState.selfHasPassword) {
      throw new Error('unit admin self detail leaked password');
    }
    if (apiState.adminStatus === 200) {
      throw new Error('unit admin unexpectedly read admin detail');
    }
    if (apiState.reviewStatus !== 200) {
      throw new Error(`unit admin review scopes failed: ${apiState.reviewStatus}`);
    }
    const foreignUsernames = apiState.reviewUsernames.filter((username) => username !== 'unit1');
    if (foreignUsernames.length) {
      throw new Error(`unit admin review scopes leaked: ${foreignUsernames.join(', ')}`);
    }
    pushStep('unit-admin:api-scope', true, `reviewScopes=${apiState.reviewUsernames.length}`);

    await page.goto(`${BASE_URL}/#users`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    const usersHash = await page.evaluate(() => String(window.location.hash || ''));
    if (usersHash.startsWith('#users')) {
      throw new Error('unit admin reached users page');
    }
    pushStep('unit-admin:users-denied', true, usersHash || '#');

    await page.goto(`${BASE_URL}/#unit-contact-review`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    const reviewHash = await page.evaluate(() => String(window.location.hash || ''));
    if (reviewHash.startsWith('#unit-contact-review')) {
      throw new Error('unit admin reached unit-contact-review');
    }
    pushStep('unit-admin:unit-contact-review-denied', true, reviewHash || '#');
  } finally {
    await context.close();
  }
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

async function ensureAdminSession(page) {
  const authState = await page.evaluate(async () => {
    const currentUser = window._authModule && typeof window._authModule.currentUser === 'function'
      ? window._authModule.currentUser()
      : null;
    const token = String(currentUser && currentUser.sessionToken || '').trim();
    if (!token) return { ok: false, reason: 'missing-token' };
    try {
      const response = await fetch('/api/auth/verify', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      return { ok: response.ok, status: response.status };
    } catch (error) {
      return { ok: false, reason: String(error && error.message || error || 'verify-failed') };
    }
  });
  if (!authState || !authState.ok) {
    await login(page);
  }
}

async function gotoHashRoute(page, hash, options = {}) {
  const target = '#' + String(hash || '').replace(/^#/, '');
  await ensureAdminSession(page);
  await page.evaluate((value) => {
    if (window.location.hash !== value) {
      window.location.hash = value;
      return;
    }
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, target);
  await page.waitForFunction((value) => String(window.location.hash || '') === value, target, {
    timeout: options.timeout || 15000
  });
  await page.waitForTimeout(options.settleMs || 250);
  await waitForRemoteBootstrap(page).catch(() => {});
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
    await page.waitForSelector('#unit-contact-apply-form', { timeout: 20000 });
    pushStep('unit-contact-public:apply-loaded', true, '申請單位管理員');

    await openPublicRoute('#apply-unit-contact-status');
    await page.waitForSelector('#unit-contact-status-form', { timeout: 15000 });
    pushStep('unit-contact-public:status-loaded', true, '查詢申請進度');

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => window.__APP_READY__ === true, undefined, { timeout: 45000 });
    await seedSyntheticUnitContactSuccess(page);
    await page.evaluate(() => {
      window.location.hash = '#apply-unit-contact-success/UCA-SMOKE-SUCCESS-001';
    });
    await page.waitForTimeout(300);
    await page.waitForSelector('.unit-contact-success-note, .empty-state', { timeout: 20000 });
    pushStep('unit-contact-public:success-loaded', true, 'success route rendered');

    await page.evaluate(() => {
      window.location.hash = '#activate-unit-contact/UCA-SMOKE-SUCCESS-001';
    });
    await page.waitForTimeout(300);
    await page.waitForSelector('#activate-unit-contact-form, .unit-contact-activate-card, .card', { timeout: 20000 });
    pushStep('unit-contact-public:activate-loaded', true, '帳號啟用');
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
      const maxDiffRatio = spec.slug === 'dashboard' ? 0.08 : spec.slug === 'training' ? 0.12 : (spec.slug === 'unit-review' ? 0.08 : 0.06);
        const result = await compareAgainstBaseline(comparePage, baselinePath, actualPath, {
          maxDiffRatio,
          sampleScale: spec.slug === 'unit-review' ? 0.35 : 1
        });
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
      const maxDiffRatio = spec.slug === 'dashboard'
        ? 0.3
        : (spec.slug === 'training' ? 0.16 : 0.08);
        const result = await compareAgainstBaseline(comparePage, baselinePath, actualPath, {
          maxDiffRatio,
          sampleScale: spec.slug === 'unit-review' ? 0.28 : 1
        });
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
  const runStartedMs = Date.now();
  let lastStepRecordedMs = runStartedMs;

  function pushStep(name, ok, detail, extra) {
    const now = Date.now();
    report.steps.push({
      name,
      ok,
      detail,
      durationMs: Math.max(0, now - lastStepRecordedMs),
      elapsedMs: Math.max(0, now - runStartedMs),
      ...(extra && typeof extra === 'object' ? extra : {})
    });
    lastStepRecordedMs = now;
  }

  const executablePath = pickExecutablePath();
  const browser = await chromium.launch(executablePath ? { headless: true, executablePath } : { headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const ignorableConsolePatterns = [
    'Failed to load resource: the server responded with a status of 401 ()',
    'Failed to load resource: the server responded with a status of 401 (Unauthorized)',
    'local.adguard.org',
    'Executing inline script violates the following Content Security Policy directive',
    '連線逾時，請稍後再試'
  ];
  if (IS_CAMPUS_BROWSER) {
    ignorableConsolePatterns.push(
      'Failed to load resource: the server responded with a status of 404 (Not Found)',
      'Failed to load resource: the server responded with a status of 404',
      'Executing inline script violates the following Content Security Policy directive'
    );
  }
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (ignorableConsolePatterns.some((pattern) => text.includes(pattern))) return;
    consoleErrors.push(text);
  });
  page.on('pageerror', (error) => {
    const text = String(error && error.message || error);
    if (ignorableConsolePatterns.some((pattern) => text.includes(pattern))) return;
    consoleErrors.push(text);
  });

  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForSelector('[data-testid="login-form"]', { timeout: 20000 });
    pushStep('landing:login-form', true, 'login form visible');

    const authTemplateResponse = await fetch(`${BASE_URL}/unit-contact-authorization-template.pdf`);
    const authTemplateBytes = Buffer.from(await authTemplateResponse.arrayBuffer());
    if (!authTemplateResponse.ok) throw new Error(`authorization template HTTP ${authTemplateResponse.status}`);
    if (authTemplateBytes.length < 1024) throw new Error('authorization template pdf too small');
    if (authTemplateBytes.slice(0, 5).toString('ascii') !== '%PDF-') throw new Error('authorization template is not a PDF');
    pushStep('asset:unit-contact-authorization-template pdf', true, `bytes=${authTemplateBytes.length}`);

    await page.fill('[data-testid="login-user"]', 'easonwu');
    await page.fill('[data-testid="login-pass"]', '2wsx#EDC');
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
        handlerEmail: currentUser.email || 'easonwu@company.com',
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
        handlerEmail: currentUser.email || 'easonwu@company.com',
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
        handlerEmail: currentUser.email || 'easonwu@company.com',
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
        handlerEmail: currentUser.email || 'easonwu@company.com',
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

    await page.goto(`${BASE_URL}/#detail/${smokeCaseIds.pending}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    await page.waitForSelector('.detail-section, .timeline', { timeout: 45000 });
    const caseDetailText = await page.locator('#app').innerText();
    if (/\?{4,}/.test(caseDetailText)) {
      throw new Error('case detail contains placeholder question marks');
    }
    if (!caseDetailText.includes(smokeCaseIds.pending)) {
      throw new Error('case detail smoke record did not render as expected');
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
    await page.waitForFunction(() => document.querySelectorAll('.checklist-list-summary .dashboard-panel-pill').length >= 4, undefined, { timeout: 20000 });
    const checklistSummaryLabels = await page.locator('.checklist-list-summary .dashboard-panel-pill-label').allTextContents();
    if (!checklistSummaryLabels.includes('總數') || !checklistSummaryLabels.includes('已送出')) {
      throw new Error('checklist list summary pills missing expected labels');
    }
    pushStep('checklist:list-summary', true, checklistSummaryLabels.join(' / '));
    const checklistRows = await page.locator('.cl-list-row').evaluateAll((rows) => rows.map((row) => String(row.getAttribute('data-cl-search-text') || '').trim()).filter(Boolean));
    const checklistQuery = checklistRows.length ? String(checklistRows[0]).slice(0, 12) : '';
    if (checklistQuery) {
      await page.fill('#cl-list-keyword', checklistQuery);
      await page.waitForTimeout(350);
      const checklistSearchState = await page.evaluate(() => ({
        activeTag: document.activeElement && document.activeElement.tagName,
        activeId: document.activeElement && document.activeElement.id,
        visibleRows: Array.from(document.querySelectorAll('.cl-list-row')).filter((row) => !row.hidden && row.offsetParent !== null).length,
        openUnits: Array.from(document.querySelectorAll('.cl-unit-accordion')).filter((el) => el.open).length,
        openYears: Array.from(document.querySelectorAll('.cl-year-accordion')).filter((el) => el.open).length
      }));
      if (checklistSearchState.activeId !== 'cl-list-keyword') {
        throw new Error(`checklist keyword input lost focus: ${checklistSearchState.activeTag || ''}#${checklistSearchState.activeId || ''}`);
      }
      if (checklistSearchState.visibleRows < 1) {
        throw new Error('checklist search should keep at least one visible row');
      }
      if (checklistSearchState.openUnits < 1) {
        throw new Error('checklist search should open the matching unit accordion');
      }
      pushStep('checklist:list-search-open', true, checklistQuery);
    }

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
        fillerName: document.getElementById('cl-filler') ? document.getElementById('cl-filler').value : 'easonwu',
        fillerUsername: 'easonwu',
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
    let checklistDetailReady = false;
    for (let attempt = 0; attempt < 2 && !checklistDetailReady; attempt += 1) {
      if (attempt > 0) {
        await page.evaluate((detailId) => {
          location.hash = '#checklist-detail/' + detailId;
        }, checklistDetailId);
      }
      try {
        await page.waitForFunction((detailId) => {
          const app = document.getElementById('app');
          const text = String(app && app.innerText || '');
          return text.includes(detailId) && text.includes('需改善項目');
        }, checklistDetailId, { timeout: 6000 });
        checklistDetailReady = true;
      } catch (_) {
        await page.waitForTimeout(1200);
      }
    }
    const checklistDetailText = await page.locator('#app').innerText();
    if (/\?{4,}/.test(checklistDetailText)) {
      throw new Error('checklist detail contains placeholder question marks');
    }
    if (!checklistDetailText.includes('CHK-SMOKE-DETAIL-001') || !checklistDetailText.includes('需改善項目')) {
      throw new Error('checklist detail smoke record did not render as expected');
    }
    pushStep('checklist:detail-loaded', true, checklistDetailId);

    let checklistManageReady = false;
    for (let attempt = 0; attempt < 2 && !checklistManageReady; attempt += 1) {
      await page.goto(`${BASE_URL}/#checklist-manage`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(1200);
      try {
        await page.waitForFunction(() => {
          const app = document.getElementById('app');
          return !!(app && app.innerText && app.innerText.includes('檢核題庫管理'));
        }, undefined, { timeout: 10000 });
        checklistManageReady = true;
      } catch (_) {
        await page.waitForTimeout(1200);
      }
    }
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

    const trainingDetailIds = await page.evaluate(() => {
      const module = window._dataModule;
      if (!module || typeof module.loadTrainingStore !== 'function') {
        throw new Error('training data module helpers missing');
      }
      const store = module.loadTrainingStore();
      return Array.isArray(store.forms) ? store.forms.map((form) => String(form && form.id || '').trim()).filter(Boolean) : [];
    });
    if (!trainingDetailIds.length) {
      pushStep('training:detail-skipped', true, 'no existing training forms');
    } else {
      const trainingDetailId = trainingDetailIds[0];
      await page.evaluate((detailId) => {
        window.location.hash = '#training-detail/' + detailId;
      }, trainingDetailId);
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
    }

    await page.evaluate(() => {
      window.location.hash = '#training-roster';
    });
    await page.waitForTimeout(3000);
    const trainingRosterText = await page.locator('#app').innerText();
    if (/\?{4,}/.test(trainingRosterText)) {
      throw new Error('training roster contains placeholder question marks');
    }
    if (!/教育訓練名單管理|名單管理|總名單筆數/.test(trainingRosterText)) {
      throw new Error('training roster page did not render expected labels');
    }
    pushStep('training:roster-loaded', true, 'training roster page ready');

    await page.goto(`${BASE_URL}/#users`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    await page.waitForFunction(() => {
      const app = document.getElementById('app');
      const text = app && app.innerText ? String(app.innerText) : '';
      return !!(text && text.includes('帳號管理') && (
        text.includes('主要歸屬單位') ||
        text.includes('額外授權範圍') ||
        text.includes('資安窗口')
      ));
    }, undefined, { timeout: 20000 });
    const usersText = await page.locator('#app').innerText();
    if (/\?{4,}/.test(usersText)) {
      throw new Error('users page contains placeholder question marks');
    }
    pushStep('users:loaded', true, 'account table ready');
    await page.waitForSelector('#system-users-page-limit', { timeout: 15000 });
    const usersPagerState = await page.evaluate(() => ({
      role: Boolean(document.querySelector('#system-users-role')),
      unit: Boolean(document.querySelector('#system-users-unit')),
      pageNumber: Boolean(document.querySelector('#system-users-page-number')),
      nextEnabled: !!(document.querySelector('#system-users-next-page') && !document.querySelector('#system-users-next-page').disabled)
    }));
    if (!usersPagerState.role || !usersPagerState.unit || !usersPagerState.pageNumber) {
      throw new Error('users pager or filters missing');
    }
    await page.selectOption('#system-users-page-limit', '5');
    await page.waitForFunction(() => {
      const limit = document.querySelector('#system-users-page-limit');
      const app = document.getElementById('app');
      return limit && String(limit.value || '') === '5' && /顯示 1-5 \//.test(String(app && app.innerText || ''));
    }, undefined, { timeout: 15000 });
    if (usersPagerState.nextEnabled) {
      await page.click('#system-users-next-page');
      await page.waitForFunction(() => {
        const input = document.querySelector('#system-users-page-number');
        const app = document.getElementById('app');
        return input && String(input.value || '') === '2' && /顯示 6-10 \//.test(String(app && app.innerText || ''));
      }, undefined, { timeout: 15000 });
    }
    pushStep('users:pager', true, 'account pager works');

    await gotoHashRoute(page, 'security-window', { settleMs: 1200, timeout: 20000 });
    let securityWindowReady = false;
    for (let attempt = 0; attempt < 2 && !securityWindowReady; attempt += 1) {
      try {
        await page.waitForFunction(() => !!document.querySelector('.security-window-category-stack .security-window-category-card'), undefined, { timeout: 20000 });
        securityWindowReady = true;
      } catch (error) {
        if (attempt >= 1) throw error;
        await login(page);
        await gotoHashRoute(page, 'security-window', { settleMs: 1200, timeout: 20000 });
      }
    }
    const securityWindowText = await page.locator('#app').innerText();
    if (/\?{4,}/.test(securityWindowText)) {
      throw new Error('security window page contains placeholder question marks');
    }
    const securityWindowCategories = await page.$$eval('.security-window-category-card[data-security-window-category]', (nodes) => {
      const labels = nodes
        .map((node) => String(node.getAttribute('data-security-window-category') || '').trim())
        .filter(Boolean);
      return Array.from(new Set(labels));
    });
    const expectedCategories = ['行政單位', '學術單位', '中心 / 研究單位'];
    const missingCategories = expectedCategories.filter((label) => !securityWindowCategories.includes(label));
    if (missingCategories.length) {
      throw new Error(`security window missing categories: ${missingCategories.join(', ')}`);
    }
    const unexpectedCategories = securityWindowCategories.filter((label) => !expectedCategories.includes(label));
    if (unexpectedCategories.length) {
      throw new Error(`security window has unexpected categories: ${unexpectedCategories.join(', ')}`);
    }
    if (!securityWindowText.includes('一級單位') || !securityWindowText.includes('二級單位')) {
      throw new Error('security window page did not render grouped unit tiers');
    }
    pushStep('security-window:loaded', true, 'security window page ready');

    await gotoHashRoute(page, 'unit-contact-review', { settleMs: 1200, timeout: 20000 });
    await page.waitForFunction(() => {
      const app = document.getElementById('app');
      return app && /申請審核與登入資訊追蹤/.test(app.textContent || '');
    }, undefined, { timeout: 45000 });
    const unitContactReviewText = await page.locator('#app').innerText();
    if (/\?{4,}/.test(unitContactReviewText)) {
      throw new Error('unit contact review contains placeholder question marks');
    }
    pushStep('unit-contact-review:loaded', true, 'unit contact review page ready');
    await page.waitForSelector('#unit-contact-review-page-limit', { timeout: 15000 });
    const unitContactPagerState = await page.evaluate(() => ({
      status: Boolean(document.querySelector('#unit-contact-review-status')),
      email: Boolean(document.querySelector('#unit-contact-review-email')),
      keyword: Boolean(document.querySelector('#unit-contact-review-keyword')),
      filterLimit: Boolean(document.querySelector('#unit-contact-review-limit')),
      pageNumber: Boolean(document.querySelector('#unit-contact-review-page-number')),
      nextEnabled: !!(document.querySelector('#unit-contact-review-next-page') && !document.querySelector('#unit-contact-review-next-page').disabled)
    }));
    if (!unitContactPagerState.status || !unitContactPagerState.email || !unitContactPagerState.keyword || !unitContactPagerState.filterLimit || !unitContactPagerState.pageNumber) {
      throw new Error('unit contact review pager or filters missing');
    }
    await page.selectOption('#unit-contact-review-page-limit', '5');
    await page.waitForFunction(() => {
      const limit = document.querySelector('#unit-contact-review-page-limit');
      const app = document.getElementById('app');
      return limit && String(limit.value || '') === '5' && /顯示 \d+-\d+ \/ \d+ 筆/.test(String(app && app.innerText || ''));
    }, undefined, { timeout: 15000 });
    if (unitContactPagerState.nextEnabled) {
      await page.click('#unit-contact-review-next-page');
      await page.waitForFunction(() => {
        const input = document.querySelector('#unit-contact-review-page-number');
        const app = document.getElementById('app');
        return input && String(input.value || '') === '2' && /顯示 \d+-\d+ \/ \d+ 筆/.test(String(app && app.innerText || ''));
      }, undefined, { timeout: 15000 });
    }
    pushStep('unit-contact-review:pager', true, 'unit contact review pager works');

    let unitReviewReady = false;
    for (let attempt = 0; attempt < 2 && !unitReviewReady; attempt += 1) {
      await gotoHashRoute(page, 'unit-review', { settleMs: 1200, timeout: 20000 });
      try {
        await page.waitForSelector('.review-table-card, .empty-state', { timeout: 15000 });
        await page.waitForFunction(() => !!document.querySelector('.governance-category-stack .governance-category-card'), undefined, { timeout: 15000 });
        unitReviewReady = true;
      } catch (error) {
        if (attempt >= 1) throw error;
        await login(page);
        await page.waitForTimeout(250);
      }
    }
    const unitReviewText = await page.locator('#app').innerText();
    if (/\?{4,}/.test(unitReviewText)) {
      throw new Error('unit review contains placeholder question marks');
    }
    const unitReviewCategories = await page.$$eval('.governance-category-card[data-governance-category]', (nodes) => {
      const labels = nodes
        .map((node) => String(node.getAttribute('data-governance-category') || '').trim())
        .filter(Boolean);
      return Array.from(new Set(labels));
    });
    const expectedGovernanceCategories = ['行政單位', '學術單位', '中心 / 研究單位'];
    const missingGovernanceCategories = expectedGovernanceCategories.filter((label) => !unitReviewCategories.includes(label));
    if (missingGovernanceCategories.length) {
      throw new Error(`unit review missing categories: ${missingGovernanceCategories.join(', ')}`);
    }
    const unexpectedGovernanceCategories = unitReviewCategories.filter((label) => !expectedGovernanceCategories.includes(label));
    if (unexpectedGovernanceCategories.length) {
      throw new Error(`unit review has unexpected categories: ${unexpectedGovernanceCategories.join(', ')}`);
    }
    pushStep('unit-review:loaded', true, 'unit review page ready');

    await runUnitAdminScopeChecks(browser, pushStep);
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
