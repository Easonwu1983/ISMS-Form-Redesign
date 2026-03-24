const fs = require('fs');
const path = require('path');
const { chromium } = require('./_playwright.cjs');
const {
  DEFAULT_BASELINE_DIR,
  DESKTOP_VISUAL_SPECS,
  MOBILE_VISUAL_SPECS,
  PUBLIC_DESKTOP_VISUAL_SPECS,
  PUBLIC_MOBILE_VISUAL_SPECS,
  captureVisualSpec
} = require('./_ui-visual-baseline.cjs');

const BASE_URL = String(process.env.ISMS_UI_BASE || 'https://isms-campus-portal.pages.dev').replace(/\/+$/, '');
const OUT_DIR = path.resolve(process.env.ISMS_UI_BASELINE_OUT || DEFAULT_BASELINE_DIR);
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

function pickExecutablePath() {
  if (fs.existsSync(CHROME_PATH)) return CHROME_PATH;
  if (fs.existsSync(EDGE_PATH)) return EDGE_PATH;
  return undefined;
}

async function login(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.fill('[data-testid="login-user"]', 'easonwu');
  await page.fill('[data-testid="login-pass"]', '2wsx#EDC');
  await Promise.all([
    page.waitForFunction(() => !!document.querySelector('.btn-logout'), { timeout: 30000 }),
    page.locator('[data-testid="login-form"]').evaluate((form) => form.requestSubmit())
  ]);
}

async function capturePublicSpecs(context, specs, mode) {
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 45000 });
    for (const spec of specs) {
      await captureVisualSpec(page, BASE_URL, spec, path.join(OUT_DIR, `${spec.slug}-${mode}.png`), mode);
    }
  } finally {
    await page.close();
  }
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
    for (const spec of DESKTOP_VISUAL_SPECS) {
      await captureVisualSpec(desktopPage, BASE_URL, spec, path.join(OUT_DIR, `${spec.slug}-desktop.png`), 'desktop');
    }
    await capturePublicSpecs(desktop, PUBLIC_DESKTOP_VISUAL_SPECS, 'desktop');

    const mobilePage = await mobile.newPage();
    await login(mobilePage);
    for (const spec of MOBILE_VISUAL_SPECS) {
      await captureVisualSpec(mobilePage, BASE_URL, spec, path.join(OUT_DIR, `${spec.slug}-mobile.png`), 'mobile');
    }
    await capturePublicSpecs(mobile, PUBLIC_MOBILE_VISUAL_SPECS, 'mobile');
    await mobilePage.goto(`${BASE_URL}/#dashboard`, { waitUntil: 'networkidle', timeout: 45000 });
    await mobilePage.waitForTimeout(900);
    await mobilePage.click('[data-action="shell.toggle-sidebar"]');
    await mobilePage.waitForTimeout(500);
    await mobilePage.screenshot({
      path: path.join(OUT_DIR, 'dashboard-sidebar-mobile.png')
    });
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
