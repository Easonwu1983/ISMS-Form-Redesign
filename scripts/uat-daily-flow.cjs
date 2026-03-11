const fs = require('fs');
const path = require('path');
const {
  attachDiagnostics,
  createArtifactRun,
  createResultEnvelope,
  currentHash,
  finalizeResults,
  gotoHash,
  launchBrowser,
  login,
  logout,
  readJsonFromStorage,
  resetApp,
  runStep,
  waitForHash,
  writeJson
} = require('./_role-test-utils.cjs');

const runMeta = createArtifactRun('uat-daily-flow');
const OUT_DIR = runMeta.outDir;
const SHOT_DIR = path.join(OUT_DIR, 'screenshots');
const RESULT_PATH = path.join(OUT_DIR, 'uat-daily-flow.json');
const SIGNOFF_FILE = path.join(OUT_DIR, 'uat-signoff.png');

fs.mkdirSync(SHOT_DIR, { recursive: true });
if (!fs.existsSync(SIGNOFF_FILE)) {
  fs.writeFileSync(SIGNOFF_FILE, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0x8AAAAASUVORK5CYII=', 'base64'));
}

async function saveScreenshot(results, page, fileName) {
  const filePath = path.join(SHOT_DIR, fileName);
  await page.screenshot({ path: filePath, fullPage: true });
  results.artifacts.push({ type: 'screenshot', path: filePath });
}

async function getTrainingStore(page) {
  return await readJsonFromStorage(page, 'cats_training_hours') || { forms: [], rosters: [] };
}

async function getChecklistStore(page) {
  return await readJsonFromStorage(page, 'cats_checklists') || { items: [] };
}

async function ensureDailyRosters(page, unitValue) {
  await page.evaluate((unit) => {
    const raw = JSON.parse(localStorage.getItem('cats_training_hours') || '{"version":1,"payload":{"forms":[],"rosters":[],"nextFormId":1,"nextRosterId":1}}');
    const store = raw && typeof raw === 'object' && Number.isFinite(Number(raw.version)) && Object.prototype.hasOwnProperty.call(raw, 'payload')
      ? raw.payload
      : raw;
    store.forms = Array.isArray(store.forms) ? store.forms : [];
    store.rosters = Array.isArray(store.rosters) ? store.rosters.filter((entry) => !(String(entry.unit || '').trim() === unit && /^UAT /.test(String(entry.name || '')))) : [];
    store.nextRosterId = Number.isFinite(Number(store.nextRosterId)) ? Number(store.nextRosterId) : 1;
    const nextId = store.nextRosterId;
    store.rosters.push(
      { id: 'RST-' + String(nextId).padStart(4, '0'), unit, name: 'UAT Alpha', unitName: unit, identity: '職員', jobTitle: '工程師', source: 'import', createdBy: 'uat-script', createdByUsername: 'uat-script', createdAt: new Date().toISOString() },
      { id: 'RST-' + String(nextId + 1).padStart(4, '0'), unit, name: 'UAT Beta', unitName: unit, identity: '委外', jobTitle: '駐點工程師', source: 'import', createdBy: 'uat-script', createdByUsername: 'uat-script', createdAt: new Date().toISOString() }
    );
    store.nextRosterId = nextId + 2;
    localStorage.setItem('cats_training_hours', JSON.stringify({ version: 1, payload: store }));
  }, unitValue);
}

(async () => {
  const results = createResultEnvelope({
    steps: [],
    artifacts: [],
    context: {
      unitAdmin: { username: 'unit1', password: 'unit123' },
      reporter: { username: 'user1', password: 'user123' }
    }
  });

  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  attachDiagnostics(page, results);
  let checklistId = null;
  let trainingId = null;
  let sameUnit = '';

  try {
    await resetApp(page);
    const data = await readJsonFromStorage(page, 'cats_data');
    const unitAdmin = (data?.users || []).find((user) => user.username === results.context.unitAdmin.username);
    sameUnit = String(unitAdmin?.activeUnit || unitAdmin?.unit || '').trim();

    await runStep(results, 'UAT-01', 'Unit admin', 'Open dashboard and case list', async () => {
      await login(page, results.context.unitAdmin.username, results.context.unitAdmin.password);
      await gotoHash(page, 'dashboard');
      await page.waitForSelector('.dashboard-hero');
      await saveScreenshot(results, page, 'uat-dashboard.png');
      await gotoHash(page, 'list');
      await page.waitForSelector('.table-wrapper');
      await saveScreenshot(results, page, 'uat-case-list.png');
      return 'dashboard and list loaded';
    });
    await logout(page);

    await runStep(results, 'UAT-02', 'Unit admin', 'Save checklist draft', async () => {
      await login(page, results.context.unitAdmin.username, results.context.unitAdmin.password);
      await gotoHash(page, 'checklist-fill');
      await page.waitForSelector('[data-testid="checklist-form"]');
      await page.fill('#cl-supervisor-name', '王經理');
      await page.fill('#cl-supervisor-title', '主管');
      await page.selectOption('#cl-sign-status', { index: 1 });
      await page.fill('#cl-sign-date', new Date().toISOString().slice(0, 10));
      await page.evaluate(() => {
        const names = Array.from(new Set(Array.from(document.querySelectorAll('.cl-radio-group input')).map((input) => input.name)));
        names.forEach((name) => {
          const target = document.querySelector(`input[name="${name}"]`);
          if (!target) throw new Error(`missing checklist radio ${name}`);
          target.checked = true;
          target.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
      await page.click('[data-testid="checklist-save-draft"]');
      await page.waitForFunction(() => String(window.location.hash || '').startsWith('#checklist-fill/'));
      checklistId = decodeURIComponent((await currentHash(page)).replace(/^#checklist-fill\//, ''));
      await saveScreenshot(results, page, 'uat-checklist-draft.png');
      return checklistId;
    });
    await logout(page);

    await runStep(results, 'UAT-03', 'Reporter', 'Submit same-unit checklist draft', async () => {
      await login(page, results.context.reporter.username, results.context.reporter.password);
      await gotoHash(page, 'checklist-fill/' + checklistId);
      await page.waitForSelector('[data-testid="checklist-form"]');
      await Promise.all([
        waitForHash(page, '#checklist-detail/' + checklistId),
        page.click('[data-testid="checklist-submit"]')
      ]);
      const store = await getChecklistStore(page);
      const item = (store.items || []).find((entry) => entry.id === checklistId);
      if (!item || String(item.status || '').trim() === '暫存') throw new Error('checklist not submitted');
      await saveScreenshot(results, page, 'uat-checklist-detail.png');
      return checklistId;
    });
    await logout(page);

    await runStep(results, 'UAT-04', 'Reporter', 'Create training draft with manual row', async () => {
      await login(page, results.context.reporter.username, results.context.reporter.password);
      await ensureDailyRosters(page, sameUnit);
      await gotoHash(page, 'training-fill');
      await page.waitForSelector('[data-testid="training-form"]');
      await page.fill('#tr-phone', '02-3366-1000');
      await page.fill('#tr-email', 'user1@g.ntu.edu.tw');
      await page.fill('#tr-year', '114');
      await page.fill('#tr-date', new Date().toISOString().slice(0, 10));
      await page.fill('#tr-new-name', 'UAT Manual Reporter');
      await page.fill('#tr-new-unit-name', sameUnit);
      await page.fill('#tr-new-identity', '職員');
      await page.fill('#tr-new-job-title', '分析師');
      await page.click('#training-add-person');
      await page.click('[data-testid="training-save-draft"]');
      await page.waitForFunction(() => String(window.location.hash || '').startsWith('#training-fill/'));
      trainingId = decodeURIComponent((await currentHash(page)).replace(/^#training-fill\//, ''));
      await saveScreenshot(results, page, 'uat-training-draft.png');
      return trainingId;
    });
    await logout(page);

    await runStep(results, 'UAT-05', 'Unit admin', 'Complete training flow one and print signoff', async () => {
      await login(page, results.context.unitAdmin.username, results.context.unitAdmin.password);
      await gotoHash(page, 'training-fill/' + trainingId);
      await page.waitForSelector('[data-testid="training-form"]');
      const rowCount = await page.locator('select[data-field="status"]').count();
      for (let index = 0; index < rowCount; index += 1) {
        await page.locator(`select[data-idx="${index}"][data-field="status"]`).selectOption({ label: '在職' });
        await page.click(`[data-testid="training-binary-completedgeneral-${index}-yes"]`);
        await page.locator(`select[data-idx="${index}"][data-field="isInfoStaff"]`).selectOption({ label: '否' });
      }
      await Promise.all([
        waitForHash(page, '#training-detail/' + trainingId),
        page.click('[data-testid="training-submit"]')
      ]);
      await page.click('#training-print-detail');
      await page.waitForTimeout(500);
      await saveScreenshot(results, page, 'uat-training-pending-signoff.png');
      return trainingId;
    });
    await logout(page);

    await runStep(results, 'UAT-06', 'Unit admin', 'Upload signoff and confirm completion', async () => {
      await login(page, results.context.unitAdmin.username, results.context.unitAdmin.password);
      await gotoHash(page, 'training-detail/' + trainingId);
      await page.waitForSelector('#training-upload-zone');
      await page.setInputFiles('#training-file-input', SIGNOFF_FILE);
      await page.waitForFunction(() => document.querySelectorAll('#training-file-previews .file-preview-item').length === 1);
      await page.click('#training-finalize-submit');
      await page.waitForTimeout(600);
      const store = await getTrainingStore(page);
      const form = (store.forms || []).find((entry) => entry.id === trainingId);
      if (!form || String(form.status || '').trim() !== '已完成填報') throw new Error('training not finalized');
      await saveScreenshot(results, page, 'uat-training-complete.png');
      return trainingId;
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
