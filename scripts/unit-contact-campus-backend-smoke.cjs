const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
  attachDiagnostics,
  createArtifactRun,
  createResultEnvelope,
  finalizeResults,
  gotoHash,
  launchBrowser,
  resetApp,
  runStep,
  writeJson
} = require('./_role-test-utils.cjs');
const {
  GRAPH_ROOT,
  acquireDelegatedGraphTokenFromCli,
  graphGet
} = require('./_m365-a3-backend-utils.cjs');

const ROOT = process.cwd();
const OUT_DIR = createArtifactRun('unit-contact-campus-backend-smoke').outDir;
const RESULT_PATH = path.join(OUT_DIR, 'unit-contact-campus-backend-smoke.json');
const OVERRIDE_PATH = path.join(ROOT, 'm365-config.override.js');
const BACKEND_PORT = 8787;
const BASE_BACKEND = `http://127.0.0.1:${BACKEND_PORT}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(url, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (_) {}
    await wait(500);
  }
  throw new Error('Timed out waiting for backend health.');
}

function writeOverrideFile() {
  const content = [
    '(function () {',
    '  window.__M365_UNIT_CONTACT_CONFIG_OVERRIDE__ = {',
    "    activeProfile: 'a3CampusBackend',",
    "    unitContactMode: 'm365-api',",
    `    unitContactSubmitEndpoint: '${BASE_BACKEND}/api/unit-contact/apply',`,
    `    unitContactStatusEndpoint: '${BASE_BACKEND}/api/unit-contact/status',`,
    "    unitContactStatusLookupMethod: 'POST'",
    '  };',
    '})();',
    ''
  ].join('\n');
  fs.writeFileSync(OVERRIDE_PATH, content, 'utf8');
}

async function cleanupApplicationById(applicationId) {
  const secretsPath = path.join(ROOT, '.local-secrets', 'm365-a3-backend.json');
  if (!fs.existsSync(secretsPath)) return;
  const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
  const siteId = secrets.siteId;
  if (!siteId) return;

  const token = acquireDelegatedGraphTokenFromCli().accessToken;
  const lists = await graphGet(token, `${GRAPH_ROOT}/sites/${siteId}/lists?$select=id,displayName`);
  const appList = (lists.value || []).find((entry) => entry.displayName === 'UnitContactApplications');
  if (!appList) return;

  const items = await graphGet(token, `${GRAPH_ROOT}/sites/${siteId}/lists/${appList.id}/items?$expand=fields&$top=200`);
  const target = (items.value || []).find((entry) => String(entry.fields && entry.fields.ApplicationId || '') === applicationId);
  if (!target) return;

  await fetch(`${GRAPH_ROOT}/sites/${siteId}/lists/${appList.id}/items/${target.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
}

(async () => {
  const results = createResultEnvelope({ steps: [] });
  const backend = spawn(process.execPath, ['m365/campus-backend/service-host.cjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      UNIT_CONTACT_ALLOWED_ORIGINS: 'http://127.0.0.1:8080,http://localhost:8080'
    },
    stdio: 'pipe'
  });

  let applicationId = '';
  let browser;
  let page;

  try {
    writeOverrideFile();
    await waitForHealth(`${BASE_BACKEND}/api/unit-contact/health`);

    browser = await launchBrowser();
    page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
    attachDiagnostics(page, results);
    await resetApp(page);

    const uniqueEmail = `unit-contact-campus-${Date.now()}@ntu.edu.tw`;

    await runStep(results, 'UNIT-CONTACT-CAMPUS-1', 'public', 'backend health endpoint reachable', async () => {
      const response = await fetch(`${BASE_BACKEND}/api/unit-contact/health`);
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error('backend health failed');
      return json.repository;
    });

    await runStep(results, 'UNIT-CONTACT-CAMPUS-2', 'public', 'submit application through frontend to campus backend', async () => {
      await gotoHash(page, 'apply-unit-contact', { handleUnsaved: false });
      await page.waitForSelector('[data-testid="unit-contact-apply-form"]', { timeout: 15000 });
      const categoryOptions = await page.locator('#uca-unit-category option').evaluateAll((options) => options.map((entry) => ({
        value: entry.value,
        text: String(entry.textContent || '').trim()
      })));
      const targetCategory = categoryOptions.find((entry) => entry.value);
      if (!targetCategory) throw new Error('no unit category options found');
      await page.selectOption('#uca-unit-category', targetCategory.value);
      await page.waitForTimeout(150);

      const parentOptions = await page.locator('#uca-unit-parent option').evaluateAll((options) => options.map((entry) => ({
        value: entry.value,
        text: String(entry.textContent || '').trim()
      })));
      const targetParent = parentOptions.find((entry) => entry.value);
      if (!targetParent) throw new Error('no primary unit options found');
      await page.selectOption('#uca-unit-parent', targetParent.value);
      await page.waitForTimeout(150);

      if (!await page.locator('#uca-unit-child').isDisabled()) {
        const childOptions = await page.locator('#uca-unit-child option').evaluateAll((options) => options.map((entry) => ({
          value: entry.value,
          text: String(entry.textContent || '').trim()
        })));
        const targetChild = childOptions.find((entry) => entry.value);
        if (targetChild) await page.selectOption('#uca-unit-child', targetChild.value);
      }

      await page.fill('[data-testid="unit-contact-name"]', 'Campus Backend 測試');
      await page.fill('[data-testid="unit-contact-extension"]', '61234');
      await page.fill('[data-testid="unit-contact-email"]', uniqueEmail);
      await page.fill('[data-testid="unit-contact-note"]', 'campus backend smoke');
      await page.click('[data-testid="unit-contact-submit"]');
      await page.waitForURL(/#apply-unit-contact-success\//, { timeout: 20000 });
      applicationId = await page.locator('.unit-contact-summary-grid strong').first().textContent();
      if (!String(applicationId || '').startsWith('UCA-')) {
        throw new Error('application id not generated');
      }
      return applicationId;
    });

    await runStep(results, 'UNIT-CONTACT-CAMPUS-3', 'public', 'lookup application through campus backend', async () => {
      await gotoHash(page, 'apply-unit-contact-status', { handleUnsaved: false });
      await page.waitForSelector('#uca-status-email', { timeout: 15000 });
      await page.fill('#uca-status-email', uniqueEmail);
      await page.locator('#unit-contact-status-form').evaluate((form) => form.requestSubmit());
      await page.waitForSelector('.unit-contact-status-card', { timeout: 20000 });
      const bodyText = await page.locator('.unit-contact-status-card').first().textContent();
      if (!String(bodyText || '').includes(applicationId)) {
        throw new Error('status result does not contain application id');
      }
      return applicationId;
    });
  } finally {
    try {
      if (applicationId) await cleanupApplicationById(applicationId);
    } catch (_) {}
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (fs.existsSync(OVERRIDE_PATH)) fs.unlinkSync(OVERRIDE_PATH);
    backend.kill('SIGTERM');
    writeJson(RESULT_PATH, finalizeResults(results));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
