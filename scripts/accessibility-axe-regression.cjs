const path = require('path');
const AxeBuilder = require('@axe-core/playwright').default;
const {
  attachDiagnostics,
  BASE_URL,
  createArtifactRun,
  createResultEnvelope,
  finalizeResults,
  gotoHash,
  launchBrowser,
  login,
  runStep,
  writeJson
} = require('./_role-test-utils.cjs');

const OUT_DIR = createArtifactRun('accessibility-axe-regression').outDir;
const RESULT_PATH = path.join(OUT_DIR, 'accessibility-axe-regression.json');

function formatViolations(violations) {
  return violations.map((violation) => {
    const targets = (violation.nodes || [])
      .map((node) => Array.isArray(node.target) ? node.target.join(' ') : '')
      .filter(Boolean)
      .join(' | ');
    return `${violation.id}${violation.impact ? ` [${violation.impact}]` : ''}${targets ? ` ${targets}` : ''}`;
  }).join('; ');
}

async function waitForAuthSurface(page, timeout = 45000) {
  await page.waitForFunction(() => {
    const loginForm = document.querySelector('[data-testid="login-form"]');
    const logoutButton = document.querySelector('.btn-logout');
    const auth = window._authModule;
    return window.__APP_READY__ === true
      || !!logoutButton
      || !!loginForm
      || !!(auth && typeof auth.login === 'function');
  }, { timeout });
}

async function waitForDashboardSurface(page, timeout = 20000) {
  await page.waitForFunction(() => {
    return !!document.querySelector('.btn-logout')
      && !document.querySelector('[data-testid="login-form"]')
      && (
        document.querySelectorAll('.dashboard-panel-pill').length >= 3
        || !!document.querySelector('.dashboard-grid')
        || !!document.querySelector('.dashboard-card')
        || !!document.querySelector('.dashboard-panel')
      );
  }, { timeout });
}

async function runAxeCheck(page, label) {
  const results = await new AxeBuilder({ page })
    .disableRules(['color-contrast'])
    .analyze();
  if (Array.isArray(results.violations) && results.violations.length) {
    throw new Error(`${label}: ${formatViolations(results.violations)}`);
  }
  return `violations=0`;
}

(async () => {
  const results = createResultEnvelope({ steps: [] });
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await context.newPage();
  attachDiagnostics(page, results);

  try {
    await runStep(results, 'AXE-01', 'Public', 'Login page has no axe violations', async () => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await waitForAuthSurface(page, 45000);
      return runAxeCheck(page, 'login');
    });

    await runStep(results, 'AXE-02', 'Admin', 'Dashboard has no axe violations', async () => {
      await login(page, 'easonwu', '2wsx#EDC');
      await gotoHash(page, 'dashboard', { handleUnsaved: false });
      await waitForDashboardSurface(page, 20000);
      return runAxeCheck(page, 'dashboard');
    });

    await runStep(results, 'AXE-03', 'Public', 'Public apply page has no axe violations', async () => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await gotoHash(page, 'apply-unit-contact', { handleUnsaved: false });
      await page.waitForSelector('[data-testid="unit-contact-apply-form"]', { timeout: 20000 });
      return runAxeCheck(page, 'public-apply');
    });

    await runStep(results, 'AXE-04', 'Public', 'Public status page has no axe violations', async () => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await gotoHash(page, 'apply-unit-contact-status', { handleUnsaved: false });
      await page.waitForSelector('#unit-contact-status-form', { timeout: 20000 });
      return runAxeCheck(page, 'public-status');
    });
  } finally {
    finalizeResults(results);
    writeJson(RESULT_PATH, results);
    await context.close();
    await browser.close();
  }

  if (results.summary && results.summary.failed > 0) {
    process.exit(1);
  }
})();
