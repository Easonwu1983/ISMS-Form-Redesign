const fs = require('fs');
const path = require('path');
const { chromium } = require('./_playwright.cjs');

const BASE_URL = String(process.env.ISMS_CLOUDFLARE_PAGES_BASE || 'https://isms-campus-portal.pages.dev').replace(/\/+$/, '');
const LOG_DIR = path.join(process.cwd(), 'logs');
const OUT_PATH = path.join(LOG_DIR, 'cloudflare-pages-regression-smoke.json');
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

function pickExecutablePath() {
  if (fs.existsSync(CHROME_PATH)) return CHROME_PATH;
  if (fs.existsSync(EDGE_PATH)) return EDGE_PATH;
  return undefined;
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
    'Failed to load resource: the server responded with a status of 401 ()'
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
      page.waitForFunction(() => !!document.querySelector('.btn-logout'), { timeout: 30000 }),
      page.locator('[data-testid="login-form"]').evaluate((form) => form.requestSubmit())
    ]);
    pushStep('auth:login', true, 'admin login succeeded');

    await page.waitForTimeout(1200);
    await page.waitForFunction(() => {
      const app = document.getElementById('app');
      return !!(app && app.innerText && app.innerText.includes('儀表板'));
    }, { timeout: 20000 });
    const dashboardTitle = await page.evaluate(() => {
      const app = document.getElementById('app');
      if (!app || !app.innerText) return '';
      return app.innerText.split('\n').map((entry) => entry.trim()).find(Boolean) || '';
    });
    if (!String(dashboardTitle || '').trim()) throw new Error('missing dashboard title');
    pushStep('dashboard:loaded', true, dashboardTitle.trim());

    await page.waitForFunction(() => document.querySelectorAll('.dashboard-panel-pill').length >= 3, { timeout: 20000 });
    const dashboardPills = await page.locator('.dashboard-panel-pill').count();
    pushStep('dashboard:summary-pills', true, `count=${dashboardPills}`);
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('th')).some((element) => String(element.textContent || '').includes('最後活動'));
    }, { timeout: 15000 });
    pushStep('dashboard:recent-last-activity-column', true, 'present');

    await page.goto(`${BASE_URL}/#audit-trail`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForFunction(() => {
      const app = document.getElementById('app');
      return !!(app && app.innerText && app.innerText.includes('操作稽核軌跡'));
    }, { timeout: 20000 });
    await page.waitForFunction(() => {
      const emptyState = document.querySelector('.empty-state-title');
      if (emptyState && emptyState.textContent && emptyState.textContent.includes('目前查無符合條件的稽核紀錄')) return true;
      return document.querySelectorAll('button[data-action="admin.viewAuditEntry"]').length > 0;
    }, { timeout: 20000 });
    const rows = await page.locator('button[data-action="admin.viewAuditEntry"]').count();
    pushStep('audit-trail:loaded', true, `rows=${rows}`);

    await page.waitForFunction(() => document.querySelectorAll('.review-table-scroll-btn').length >= 2, { timeout: 15000 });
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
    }, { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll('.review-table-wrapper').length >= 1, { timeout: 15000 });
    const schemaScrollButtons = await page.locator('.review-table-scroll-btn').count();
    if (schemaScrollButtons < 2) {
      throw new Error(`expected schema health scroll buttons, got ${schemaScrollButtons}`);
    }
    pushStep('schema-health:scroll-controls', true, `count=${schemaScrollButtons}`);

    await page.goto(`${BASE_URL}/#training`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForFunction(() => {
      const app = document.getElementById('app');
      return !!(app && app.innerText && app.innerText.includes('資安教育訓練統計'));
    }, { timeout: 20000 });
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('.training-group-title')).some((element) => {
        return /行政單位|學術單位|中心\s*\/\s*研究單位/.test(String(element.textContent || ''));
      });
    }, { timeout: 20000 });
    const trainingGroupTitles = await page.locator('.training-group-title').allTextContents();
    pushStep('training:grouped-incomplete-units', true, trainingGroupTitles.join(' / '));

    await page.waitForFunction(() => document.querySelectorAll('.training-group-summary-chip').length >= 3, { timeout: 20000 });
    const trainingSummaryChips = await page.locator('.training-group-summary-chip').count();
    pushStep('training:group-summary-chips', true, `count=${trainingSummaryChips}`);
    await page.waitForFunction(() => document.querySelectorAll('#training-expand-groups, #training-collapse-groups').length === 2, { timeout: 15000 });
    pushStep('training:group-toggle-actions', true, 'expand/collapse ready');

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
