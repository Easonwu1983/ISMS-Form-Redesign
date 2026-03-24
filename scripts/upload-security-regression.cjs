const fs = require('fs');
const path = require('path');
const {
  attachDiagnostics,
  createArtifactRun,
  createResultEnvelope,
  finalizeResults,
  gotoHash,
  launchBrowser,
  login,
  logout,
  resetApp,
  runStep,
  writeJson
} = require('./_role-test-utils.cjs');

const runMeta = createArtifactRun('upload-security-regression');
const OUT_DIR = runMeta.outDir;
const RESULT_PATH = path.join(OUT_DIR, 'upload-security-regression.json');
const VALID_PDF = path.join(OUT_DIR, 'valid-proof.pdf');
const VALID_PNG = path.join(OUT_DIR, 'valid-proof.png');
const EMPTY_PDF = path.join(OUT_DIR, 'empty-proof.pdf');
const HUGE_CASE_PDF = path.join(OUT_DIR, 'huge-case-proof.pdf');
const HUGE_TRAINING_PDF = path.join(OUT_DIR, 'huge-training-proof.pdf');
const INVALID_EXE = path.join(OUT_DIR, 'malware.exe');
const RESPOND_CASE_ID = 'CAR-UPLOAD-RESPOND';
const TRACKING_CASE_ID = 'CAR-UPLOAD-TRACK';
const SAME_UNIT = '計算機及資訊網路中心／資訊網路組';

fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(VALID_PNG)) {
  fs.writeFileSync(VALID_PNG, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0x8AAAAASUVORK5CYII=', 'base64'));
}
if (!fs.existsSync(VALID_PDF)) fs.writeFileSync(VALID_PDF, Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'));
if (!fs.existsSync(EMPTY_PDF)) fs.writeFileSync(EMPTY_PDF, Buffer.alloc(0));
if (!fs.existsSync(HUGE_CASE_PDF)) fs.writeFileSync(HUGE_CASE_PDF, Buffer.alloc(3 * 1024 * 1024, 65));
if (!fs.existsSync(HUGE_TRAINING_PDF)) fs.writeFileSync(HUGE_TRAINING_PDF, Buffer.alloc(6 * 1024 * 1024, 66));
if (!fs.existsSync(INVALID_EXE)) fs.writeFileSync(INVALID_EXE, Buffer.from('MZPSEUDO-EXE'));

async function expectToastIncludes(page, fragment) {
  await page.waitForFunction((text) => Array.from(document.querySelectorAll('.toast-message')).some((node) => String(node.textContent || '').includes(text)), fragment, { timeout: 5000 });
}

async function latestToastText(page) {
  await page.waitForTimeout(250);
  const texts = await page.locator('.toast-message').allTextContents();
  return texts.length ? texts[texts.length - 1] : '';
}

async function previewCount(page, selector) {
  return await page.locator(selector).count();
}

async function seedUploadTargets(page) {
  await page.evaluate(({ respondCaseId, trackingCaseId, sameUnit }) => {
    const dataRaw = JSON.parse(localStorage.getItem('cats_data') || '{"version":1,"payload":{"items":[],"users":[],"nextId":1}}');
    const dataStore = dataRaw && typeof dataRaw === 'object' && Number.isFinite(Number(dataRaw.version)) && Object.prototype.hasOwnProperty.call(dataRaw, 'payload')
      ? dataRaw.payload
      : dataRaw;
    dataStore.items = Array.isArray(dataStore.items) ? dataStore.items.filter((item) => ![respondCaseId, trackingCaseId].includes(item.id)) : [];
    dataStore.items.push({
      id: respondCaseId,
      proposerUnit: '稽核室',
      proposerName: '張稽核員',
      proposerDate: new Date().toISOString().slice(0, 10),
      handlerUnit: sameUnit,
      handlerName: '王經理',
      handlerDate: '',
      deficiencyType: '主要缺失',
      source: '內部稽核',
      category: ['資訊'],
      clause: 'A.12.1',
      problemDesc: 'Respond upload security fixture',
      occurrence: 'fixture',
      correctiveAction: '',
      correctiveDueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      rootCause: '',
      rootElimination: '',
      rootElimDueDate: '',
      riskDesc: '',
      riskAcceptor: '',
      riskAcceptDate: null,
      riskAssessDate: null,
      reviewResult: '',
      reviewer: '',
      reviewDate: null,
      trackings: [],
      pendingTracking: null,
      status: '待矯正',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      closedDate: null,
      evidence: [],
      history: []
    });
    dataStore.items.push({
      id: trackingCaseId,
      proposerUnit: '稽核室',
      proposerName: '張稽核員',
      proposerDate: new Date().toISOString().slice(0, 10),
      handlerUnit: sameUnit,
      handlerName: '王經理',
      handlerDate: new Date().toISOString().slice(0, 10),
      deficiencyType: '主要缺失',
      source: '內部稽核',
      category: ['資訊'],
      clause: 'A.12.1',
      problemDesc: 'Tracking upload security fixture',
      occurrence: 'fixture',
      correctiveAction: 'done',
      correctiveDueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      rootCause: 'fixture',
      rootElimination: 'fixture',
      rootElimDueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      riskDesc: '',
      riskAcceptor: '',
      riskAcceptDate: null,
      riskAssessDate: null,
      reviewResult: '',
      reviewer: '',
      reviewDate: null,
      trackings: [],
      pendingTracking: null,
      status: '追蹤中',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      closedDate: null,
      evidence: [],
      history: []
    });
    localStorage.setItem('cats_data', JSON.stringify({ version: 1, payload: dataStore }));
  }, { respondCaseId: RESPOND_CASE_ID, trackingCaseId: TRACKING_CASE_ID, sameUnit: SAME_UNIT });
}

async function prepareTrainingUploadFixture(page) {
  await page.evaluate((sameUnit) => {
    const raw = JSON.parse(localStorage.getItem('cats_training_hours') || '{"version":1,"payload":{"forms":[],"rosters":[],"nextFormId":1,"nextRosterId":1}}');
    const store = raw && typeof raw === 'object' && Number.isFinite(Number(raw.version)) && Object.prototype.hasOwnProperty.call(raw, 'payload')
      ? raw.payload
      : raw;
    store.forms = Array.isArray(store.forms) ? store.forms.filter((form) => !(String(form.unit || '').trim() === sameUnit && String(form.trainingYear || '').trim() === '114')) : [];
    store.rosters = Array.isArray(store.rosters) ? store.rosters.filter((row) => String(row.name || '').trim() !== 'Upload Security User') : [];
    store.nextRosterId = Number.isFinite(Number(store.nextRosterId)) ? Number(store.nextRosterId) : 1;
    const rowId = 'RST-' + String(store.nextRosterId).padStart(4, '0');
    store.rosters.push({
      id: rowId,
      unit: sameUnit,
      statsUnit: '計算機及資訊網路中心',
      l1Unit: '計算機及資訊網路中心',
      name: 'Upload Security User',
      unitName: sameUnit,
      identity: '職員',
      jobTitle: '工程師',
      source: 'import',
      createdBy: 'upload-security',
      createdByUsername: 'upload-security',
      createdAt: new Date().toISOString()
    });
    store.nextRosterId += 1;
    localStorage.setItem('cats_training_hours', JSON.stringify({ version: 1, payload: store }));
  }, SAME_UNIT);
  await gotoHash(page, 'training-fill');
  await page.waitForSelector('[data-testid="training-form"]');
  await page.fill('#tr-phone', '02-3366-1111');
  await page.fill('#tr-email', 'unit1@g.ntu.edu.tw');
  await page.fill('#tr-year', '114');
  await page.fill('#tr-date', new Date().toISOString().slice(0, 10));
  const rowCount = await page.locator('select[data-field="status"]').count();
  if (!rowCount) throw new Error('missing training rows for upload security fixture');
  for (let index = 0; index < rowCount; index += 1) {
    await page.locator(`select[data-idx="${index}"][data-field="status"]`).selectOption({ label: '在職' });
    await page.click(`[data-testid="training-binary-completedgeneral-${index}-yes"]`);
    await page.locator(`select[data-idx="${index}"][data-field="isInfoStaff"]`).selectOption({ label: '否' });
  }
  await page.click('[data-testid="training-save-draft"]');
  await page.waitForFunction(() => String(window.location.hash || '').startsWith('#training-fill/'));
  const trainingId = decodeURIComponent((await page.evaluate(() => window.location.hash)).replace(/^#training-fill\//, ''));
  await Promise.all([
    page.waitForFunction((id) => String(window.location.hash || '') === '#training-detail/' + id, trainingId, { timeout: 7000 }),
    page.click('[data-testid="training-submit"]')
  ]);
  return trainingId;
}

(async () => {
  const results = createResultEnvelope({
    steps: [],
    artifacts: [
      { type: 'fixture', path: VALID_PDF },
      { type: 'fixture', path: VALID_PNG },
      { type: 'fixture', path: EMPTY_PDF },
      { type: 'fixture', path: HUGE_CASE_PDF },
      { type: 'fixture', path: HUGE_TRAINING_PDF },
      { type: 'fixture', path: INVALID_EXE }
    ]
  });
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  attachDiagnostics(page, results);
  let trainingFormId = '';

  try {
    await resetApp(page);
    await seedUploadTargets(page);

    await runStep(results, 'UPLOAD-01', 'Unit admin', 'Respond upload validation', async () => {
      await login(page, 'unit1', 'unit123');
      await gotoHash(page, 'respond/' + RESPOND_CASE_ID);
      await page.waitForSelector('#file-input');
      await page.setInputFiles('#file-input', INVALID_EXE);
      await expectToastIncludes(page, '副檔名不支援');
      if (await previewCount(page, '#file-previews .file-preview-item') !== 0) throw new Error('invalid extension created preview');
      await page.setInputFiles('#file-input', EMPTY_PDF);
      await expectToastIncludes(page, '空檔');
      await page.setInputFiles('#file-input', HUGE_CASE_PDF);
      await expectToastIncludes(page, '超過 2MB');
      await page.setInputFiles('#file-input', VALID_PDF);
      await page.waitForFunction(() => document.querySelectorAll('#file-previews .file-preview-item').length === 1);
      await page.setInputFiles('#file-input', VALID_PDF);
      await expectToastIncludes(page, '重複上傳');
      if (await previewCount(page, '#file-previews .file-preview-item') !== 1) throw new Error('duplicate respond upload added preview');
      return await latestToastText(page);
    });

    await runStep(results, 'UPLOAD-02', 'Unit admin', 'Tracking upload validation', async () => {
      await gotoHash(page, 'tracking/' + TRACKING_CASE_ID);
      await page.waitForSelector('#track-form');
      await page.evaluate(() => {
        const input = document.querySelector('input[name="tkResult"]');
        if (!input) throw new Error('missing tracking result radio');
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForSelector('#tk-file-input', { state: 'attached' });
      await page.setInputFiles('#tk-file-input', INVALID_EXE);
      await expectToastIncludes(page, '副檔名不支援');
      await page.setInputFiles('#tk-file-input', EMPTY_PDF);
      await expectToastIncludes(page, '空檔');
      await page.setInputFiles('#tk-file-input', HUGE_CASE_PDF);
      await expectToastIncludes(page, '超過 2MB');
      await page.setInputFiles('#tk-file-input', VALID_PNG);
      await page.waitForFunction(() => document.querySelectorAll('#tk-file-previews .file-preview-item').length === 1);
      await page.setInputFiles('#tk-file-input', VALID_PNG);
      await expectToastIncludes(page, '重複上傳');
      if (await previewCount(page, '#tk-file-previews .file-preview-item') !== 1) throw new Error('duplicate tracking upload added preview');
      return await latestToastText(page);
    });

    await runStep(results, 'UPLOAD-03', 'Unit admin', 'Training signoff upload validation', async () => {
      trainingFormId = await prepareTrainingUploadFixture(page);
      await gotoHash(page, 'training-detail/' + trainingFormId);
      await page.waitForSelector('#training-file-input', { state: 'attached' });
      await page.setInputFiles('#training-file-input', INVALID_EXE);
      await expectToastIncludes(page, '副檔名不支援');
      await page.setInputFiles('#training-file-input', EMPTY_PDF);
      await expectToastIncludes(page, '空檔');
      await page.setInputFiles('#training-file-input', HUGE_TRAINING_PDF);
      await expectToastIncludes(page, '超過 5MB');
      await page.setInputFiles('#training-file-input', VALID_PDF);
      await page.waitForFunction(() => document.querySelectorAll('#training-file-previews .file-preview-item').length === 1);
      await page.setInputFiles('#training-file-input', VALID_PDF);
      await expectToastIncludes(page, '重複上傳');
      if (await previewCount(page, '#training-file-previews .file-preview-item') !== 1) throw new Error('duplicate signoff upload added preview');
      return await latestToastText(page);
    });

    await runStep(results, 'UPLOAD-04', 'Admin', 'Roster import file validation', async () => {
      await logout(page);
      await login(page, 'easonwu', '2wsx#EDC');
      await gotoHash(page, 'training-roster');
      await page.waitForSelector('#training-import-file');
      await page.setInputFiles('#training-import-file', INVALID_EXE);
      await expectToastIncludes(page, '副檔名不支援');
      const copyAfterExe = await page.locator('#training-import-file-copy').textContent();
      if (String(copyAfterExe || '').includes('malware.exe')) throw new Error('invalid import file should be cleared');
      await page.setInputFiles('#training-import-file', EMPTY_PDF);
      await expectToastIncludes(page, '空檔');
      const copyAfterEmpty = await page.locator('#training-import-file-copy').textContent();
      if (String(copyAfterEmpty || '').includes('empty-proof.pdf')) throw new Error('empty import file should be cleared');
      return await latestToastText(page);
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
