const fs = require('fs');
const path = require('path');
const { chromium } = require('./_playwright.cjs');
const {
  attachDiagnostics,
  createArtifactRun,
  createResultEnvelope,
  finalizeResults,
  gotoHash,
  login,
  resetApp,
  writeJson
} = require('./_role-test-utils.cjs');

const runMeta = createArtifactRun('browser-zoom-regression');
const OUT_DIR = runMeta.outDir;
const SHOT_DIR = path.join(OUT_DIR, 'screenshots');
const RESULT_PATH = path.join(OUT_DIR, 'browser-zoom-regression.json');
const BROWSERS = [
  { name: 'edge', executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' },
  { name: 'chrome', executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }
].filter((entry) => fs.existsSync(entry.executablePath));
const ZOOMS = [1.25, 1.5];
const ROUTES = ['dashboard', 'create', 'checklist-fill', 'training-fill', 'training-roster', 'schema-health'];
const BASE_VIEWPORT = { width: 1440, height: 1100 };

fs.mkdirSync(SHOT_DIR, { recursive: true });

async function applyZoom(page, factor) {
  await page.setViewportSize({
    width: Math.round(BASE_VIEWPORT.width / factor),
    height: Math.round(BASE_VIEWPORT.height / factor)
  });
}

async function inspectLayout(page) {
  return await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const overflow = scrollWidth - viewportWidth;
    const issues = [];
    const isInsideHorizontalScroller = (node) => {
      let current = node.parentElement;
      while (current) {
        const style = window.getComputedStyle(current);
        const overflowX = style.overflowX;
        const canScroll = (overflowX === 'auto' || overflowX === 'scroll') && current.scrollWidth > current.clientWidth + 6;
        if (canScroll) {
          return true;
        }
        current = current.parentElement;
      }
      return false;
    };
    document.querySelectorAll('input,select,textarea,button,.btn,.page-header,.form-row,.editor-shell,.dashboard-grid,.table-wrapper,.card').forEach((node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return;
      if (isInsideHorizontalScroller(node)) return;
      if (rect.right > viewportWidth + 4 || rect.left < -4) {
        issues.push({
          tag: node.tagName.toLowerCase(),
          className: String(node.className || '').trim().slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right)
        });
      }
    });
    return {
      viewportWidth,
      scrollWidth,
      overflow,
      issueCount: issues.length,
      issues: issues.slice(0, 20)
    };
  });
}

(async () => {
  const results = createResultEnvelope({
    steps: [],
    artifacts: [],
    matrix: []
  });

  try {
    if (!BROWSERS.length) {
      results.steps.push({
        id: 'browser-zoom-skip',
        role: 'system',
        title: 'Browser zoom regression',
        status: 'passed',
        detail: 'No local Chrome or Edge executable found; skipped browser-specific zoom sweep.'
      });
      return;
    }
    for (const browserMeta of BROWSERS) {
      const browser = await chromium.launch({ headless: true, executablePath: browserMeta.executablePath });
      const page = await browser.newPage({ viewport: BASE_VIEWPORT });
      attachDiagnostics(page, results);
      try {
        await resetApp(page);
        await login(page, 'admin', 'admin123');
        for (const zoom of ZOOMS) {
          await applyZoom(page, zoom);
          for (const route of ROUTES) {
            await gotoHash(page, route);
            await page.waitForTimeout(350);
            await page.waitForTimeout(250);
            const metrics = await inspectLayout(page);
            const filePath = path.join(SHOT_DIR, `${browserMeta.name}-${String(zoom).replace('.', '_')}-${route}.png`);
            await page.screenshot({ path: filePath, fullPage: true });
            results.artifacts.push({ type: 'screenshot', path: filePath, browser: browserMeta.name, zoom, route });
            results.matrix.push({ browser: browserMeta.name, zoom, route, metrics });
            results.steps.push({
              id: `${browserMeta.name}-${zoom}-${route}`,
              role: browserMeta.name,
              title: `${route} @ ${zoom}`,
              status: (metrics.overflow <= 6 && metrics.issueCount === 0) ? 'passed' : 'failed',
              detail: `overflow=${metrics.overflow}; issues=${metrics.issueCount}`
            });
          }
        }
      } finally {
        await browser.close();
      }
    }
  } finally {
    const finalized = finalizeResults(results);
    writeJson(RESULT_PATH, finalized);
    if (finalized.summary.failed || finalized.summary.pageErrors) process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
