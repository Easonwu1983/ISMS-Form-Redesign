const fs = require('fs');
const path = require('path');
const { chromium } = require('./_playwright.cjs');
const {
  DEFAULT_BASELINE_DIR,
  PUBLIC_DESKTOP_VISUAL_SPECS,
  PUBLIC_MOBILE_VISUAL_SPECS,
  seedSyntheticUnitContactSuccess,
  captureVisualSpec,
  compareAgainstBaseline
} = require('./_ui-visual-baseline.cjs');

const BASE_URL = String(process.env.ISMS_UNIT_CONTACT_PUBLIC_BASE || 'https://isms-campus-portal.pages.dev').replace(/\/+$/, '');
const LOG_DIR = path.join(process.cwd(), 'logs');
const OUT_PATH = process.env.ISMS_UNIT_CONTACT_PUBLIC_OUT
  ? path.resolve(process.env.ISMS_UNIT_CONTACT_PUBLIC_OUT)
  : path.join(LOG_DIR, 'unit-contact-public-visual-smoke.json');
const VISUAL_OUT_DIR = path.join(process.cwd(), 'test-artifacts', 'unit-contact-public-visual-smoke');
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

function pickExecutablePath() {
  if (fs.existsSync(CHROME_PATH)) return CHROME_PATH;
  if (fs.existsSync(EDGE_PATH)) return EDGE_PATH;
  return undefined;
}

async function openPublicRoute(page, hash) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => window.__APP_READY__ === true, { timeout: 45000 });
  await page.evaluate((nextHash) => {
    window.location.hash = nextHash;
  }, hash);
  await page.waitForTimeout(300);
}

async function verifyPublicRoute(page, hash, verifier) {
  await openPublicRoute(page, hash);
  await page.waitForFunction(verifier, { timeout: 20000 });
}

async function runPublicRouteChecks(browser, pushStep) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  try {
    await verifyPublicRoute(page, '#apply-unit-contact', () => {
      const title = document.querySelector('.page-title');
      return !!(title && String(title.textContent || '').includes('申請單位管理人帳號'));
    });
    pushStep('unit-contact-public:apply-loaded', true, '申請單位管理人帳號');

    await verifyPublicRoute(page, '#apply-unit-contact-status', () => {
      const title = document.querySelector('.page-title');
      return !!(title && String(title.textContent || '').includes('查詢單位管理人申請進度'));
    });
    await page.waitForSelector('#unit-contact-status-form', { timeout: 15000 });
    pushStep('unit-contact-public:status-loaded', true, '查詢單位管理人申請進度');

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => window.__APP_READY__ === true, { timeout: 45000 });
    await seedSyntheticUnitContactSuccess(page);

    await verifyPublicRoute(page, '#apply-unit-contact-success/UCA-SMOKE-SUCCESS-001', () => {
      const title = document.querySelector('.page-title');
      if (!title) return false;
      const text = String(title.textContent || '');
      return text.includes('申請已成功送出') || text.includes('找不到申請資料');
    });
    pushStep('unit-contact-public:success-loaded', true, 'success route rendered');

    await verifyPublicRoute(page, '#activate-unit-contact/UCA-SMOKE-SUCCESS-001', () => {
      const title = document.querySelector('.page-title');
      return !!(title && String(title.textContent || '').includes('單位管理人帳號啟用說明'));
    });
    pushStep('unit-contact-public:activate-loaded', true, '單位管理人帳號啟用說明');
  } finally {
    await context.close();
  }
}

async function runPublicVisualBaselineChecks(browser, pushStep) {
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
    await desktopPage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 45000 });
    for (const spec of PUBLIC_DESKTOP_VISUAL_SPECS) {
      const actualPath = path.join(VISUAL_OUT_DIR, `${spec.slug}-desktop.png`);
      const baselinePath = path.join(DEFAULT_BASELINE_DIR, `${spec.slug}-desktop.png`);
      if (!fs.existsSync(baselinePath)) throw new Error(`missing public desktop baseline: ${baselinePath}`);
      await captureVisualSpec(desktopPage, BASE_URL, spec, actualPath, 'desktop');
      const result = await compareAgainstBaseline(comparePage, baselinePath, actualPath, { maxDiffRatio: 0.04 });
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
      const result = await compareAgainstBaseline(comparePage, baselinePath, actualPath, { maxDiffRatio: 0.05 });
      if (!result.ok) throw new Error(`public mobile visual drift: ${spec.slug} (${JSON.stringify(result)})`);
      pushStep(`visual:public-mobile:${spec.slug}`, true, `diffRatio=${result.diffRatio.toFixed(4)}`);
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

  try {
    await runPublicRouteChecks(browser, pushStep);
    await runPublicVisualBaselineChecks(browser, pushStep);
    report.ok = true;
  } catch (error) {
    report.ok = false;
    report.error = String(error && error.stack ? error.stack : error);
    pushStep('run', false, report.error);
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2), 'utf8');
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
