const fs = require('fs');
const path = require('path');
const { chromium } = require('./_playwright.cjs');

const BASE_URL = String(process.env.ISMS_UI_BASE || 'https://isms-campus-portal.pages.dev').replace(/\/+$/, '');
const OUT_DIR = path.resolve(process.env.ISMS_UI_BASELINE_OUT || path.join(process.cwd(), 'test-artifacts', 'ui-visual-baseline'));
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

function pickExecutablePath() {
  if (fs.existsSync(CHROME_PATH)) return CHROME_PATH;
  if (fs.existsSync(EDGE_PATH)) return EDGE_PATH;
  return undefined;
}

async function login(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.fill('[data-testid="login-user"]', 'admin');
  await page.fill('[data-testid="login-pass"]', 'admin123');
  await Promise.all([
    page.waitForFunction(() => !!document.querySelector('.btn-logout'), { timeout: 30000 }),
    page.locator('[data-testid="login-form"]').evaluate((form) => form.requestSubmit())
  ]);
}

async function captureDesktop(page, slug, hash, options) {
  await page.goto(`${BASE_URL}/${hash}`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1200);
  const clip = options && options.clip;
  await page.screenshot({
    path: path.join(OUT_DIR, `${slug}-desktop.png`),
    fullPage: !clip,
    clip: clip || undefined
  });
}

async function captureMobile(page, slug, hash, options) {
  await page.goto(`${BASE_URL}/${hash}`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1200);
  if (options && typeof options.before === 'function') {
    await options.before(page);
    await page.waitForTimeout(600);
  }
  await page.screenshot({
    path: path.join(OUT_DIR, `${slug}-mobile.png`),
    fullPage: true
  });
}

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const executablePath = pickExecutablePath();
  const browser = await chromium.launch(executablePath ? { headless: true, executablePath } : { headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  try {
    const desktopPage = await desktop.newPage();
    await login(desktopPage);
    await captureDesktop(desktopPage, 'dashboard', '#dashboard');
    await captureDesktop(desktopPage, 'training', '#training', { clip: { x: 260, y: 64, width: 1180, height: 1600 } });
    await captureDesktop(desktopPage, 'audit-trail', '#audit-trail', { clip: { x: 260, y: 64, width: 1180, height: 1400 } });
    await captureDesktop(desktopPage, 'unit-review', '#unit-review', { clip: { x: 260, y: 64, width: 1180, height: 1500 } });

    const mobilePage = await mobile.newPage();
    await login(mobilePage);
    await captureMobile(mobilePage, 'dashboard', '#dashboard');
    await captureMobile(mobilePage, 'dashboard-sidebar', '#dashboard', {
      before: async (page) => {
        await page.click('[data-action="shell.toggle-sidebar"]');
      }
    });
    await captureMobile(mobilePage, 'training', '#training');
  } finally {
    await browser.close();
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    outputDir: OUT_DIR,
    files: fs.readdirSync(OUT_DIR).sort()
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
