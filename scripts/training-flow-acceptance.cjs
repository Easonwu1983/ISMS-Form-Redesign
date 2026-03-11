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

const runMeta = createArtifactRun('training-flow-acceptance');
const OUT_DIR = runMeta.outDir;
const SHOT_DIR = path.join(OUT_DIR, 'screenshots');
const DOWNLOAD_DIR = path.join(OUT_DIR, 'downloads');
const RESULT_PATH = path.join(OUT_DIR, 'training-flow-acceptance.json');
const ROSTER_FILE_PATH = path.join(OUT_DIR, 'training-roster-import.xlsx');
const EVIDENCE_FILE_PATH = path.join(OUT_DIR, 'training-signoff-evidence.png');
const TARGET_UNIT = '計算機及資訊網路中心／資訊網路組';
const TARGET_PARENT = '計算機及資訊網路中心';
const TARGET_CHILD = '資訊網路組';
const SINGLE_LEVEL_UNIT = '稽核室';
const IMPORT_NAMES = ['驗收測試甲', '驗收測試乙'];

fs.mkdirSync(SHOT_DIR, { recursive: true });
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

if (!fs.existsSync(EVIDENCE_FILE_PATH)) {
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0x8AAAAASUVORK5CYII=';
  fs.writeFileSync(EVIDENCE_FILE_PATH, Buffer.from(pngBase64, 'base64'));
}

const results = createResultEnvelope({
  steps: [],
  artifacts: [],
  context: {
    admin: { username: 'admin', password: 'admin123' },
    reporter: { username: 'unit1', password: 'unit123' },
    targetUnit: TARGET_UNIT,
    importedNames: IMPORT_NAMES
  }
});

function trackArtifact(type, filePath, extra) {
  results.artifacts.push({ type, path: filePath, ...(extra || {}) });
}

async function saveScreenshot(page, fileName) {
  const filePath = path.join(SHOT_DIR, fileName);
  await page.screenshot({ path: filePath, fullPage: true });
  trackArtifact('screenshot', filePath);
  return filePath;
}

async function saveDownload(download, preferredName) {
  const suggested = preferredName || download.suggestedFilename();
  const filePath = path.join(DOWNLOAD_DIR, suggested);
  await download.saveAs(filePath);
  trackArtifact('download', filePath);
  return filePath;
}

async function getTrainingStore(page) {
  return await readJsonFromStorage(page, 'cats_training_hours') || { forms: [], rosters: [] };
}

async function chooseUnit(page, baseId, fullUnit) {
  await page.evaluate(({ baseId, fullUnit }) => {
    const categoryEl = document.getElementById(`${baseId}-category`);
    const parentEl = document.getElementById(`${baseId}-parent`);
    const childEl = document.getElementById(`${baseId}-child`);
    const hiddenEl = document.getElementById(baseId);
    const childWrap = document.getElementById(`${baseId}-child-wrap`);
    if (!categoryEl || !parentEl || !childEl || !hiddenEl) {
      throw new Error(`Missing unit cascade ${baseId}`);
    }
    const [parent, child] = String(fullUnit || '').split('／');
    const categories = Array.from(categoryEl.options).map((option) => option.value).filter(Boolean);
    const dispatch = (element) => element.dispatchEvent(new Event('change', { bubbles: true }));
    let categoryMatched = false;
    for (const category of categories) {
      categoryEl.value = category;
      dispatch(categoryEl);
      const hasParent = Array.from(parentEl.options).some((option) => String(option.value || '').trim() === parent);
      if (hasParent) {
        categoryMatched = true;
        break;
      }
    }
    if (!categoryMatched) {
      const options = Array.from(parentEl.options).map((option) => option.textContent || '');
      throw new Error(`Unable to locate parent unit ${parent}: ${JSON.stringify(options)}`);
    }
    parentEl.value = parent;
    dispatch(parentEl);
    if (child) {
      const hasChild = Array.from(childEl.options).some((option) => String(option.value || '').trim() === child);
      if (!hasChild) {
        const childOptions = Array.from(childEl.options).map((option) => option.textContent || '');
        throw new Error(`Unable to locate child unit ${child}: ${JSON.stringify(childOptions)}`);
      }
      childEl.value = child;
      dispatch(childEl);
    } else if (childWrap) {
      childEl.value = '';
      dispatch(childEl);
    }
  }, { baseId, fullUnit });
  await page.waitForFunction(({ baseId, fullUnit }) => {
    const hidden = document.getElementById(baseId);
    return !!hidden && String(hidden.value || '').trim() === String(fullUnit || '').trim();
  }, { baseId, fullUnit });
}

async function verifySingleLevelUnit(page, baseId, parentUnit) {
  await page.evaluate(({ baseId, parentUnit }) => {
    const categoryEl = document.getElementById(`${baseId}-category`);
    const parentEl = document.getElementById(`${baseId}-parent`);
    const childEl = document.getElementById(`${baseId}-child`);
    const childWrap = document.getElementById(`${baseId}-child-wrap`);
    const hiddenEl = document.getElementById(baseId);
    if (!categoryEl || !parentEl || !childEl || !childWrap || !hiddenEl) {
      throw new Error(`Missing unit cascade ${baseId}`);
    }
    const dispatch = (element) => element.dispatchEvent(new Event('change', { bubbles: true }));
    categoryEl.value = '行政單位';
    dispatch(categoryEl);
    parentEl.value = parentUnit;
    dispatch(parentEl);
    const wrapStyle = window.getComputedStyle(childWrap);
    if (wrapStyle.display !== 'none') throw new Error(`Expected child wrap hidden for ${parentUnit}, got ${wrapStyle.display}`);
    if (!childEl.disabled) throw new Error(`Expected child select disabled for ${parentUnit}`);
    if (String(hiddenEl.value || '').trim() !== parentUnit) throw new Error(`Expected hidden unit ${parentUnit}, got ${hiddenEl.value}`);
  }, { baseId, parentUnit });
}

async function createRosterWorkbook(page, filePath, rows) {
  const payload = await page.evaluate((sheetRows) => {
    if (!window.XLSX) throw new Error('XLSX not loaded on page');
    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.aoa_to_sheet(sheetRows);
    window.XLSX.utils.book_append_sheet(wb, ws, '名單');
    return window.XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  }, rows);
  fs.writeFileSync(filePath, Buffer.from(payload, 'base64'));
  trackArtifact('fixture', filePath, { kind: 'xlsx' });
}

async function getFormById(page, formId) {
  const store = await getTrainingStore(page);
  return (store.forms || []).find((entry) => entry.id === formId) || null;
}

async function expectHash(page, expectedHash) {
  await page.waitForFunction((target) => window.location.hash === target, expectedHash, { timeout: 8000 });
}

async function populateTrainingFlowOne(page) {
  await page.fill('#tr-phone', '02-3366-1234');
  await page.fill('#tr-email', 'unit1@g.ntu.edu.tw');
  await page.fill('#tr-year', '114');
  await page.fill('#tr-date', new Date().toISOString().slice(0, 10));

  const rowCount = await page.locator('select[data-field="status"]').count();
  if (rowCount < 2) throw new Error(`Expected at least 2 roster rows, got ${rowCount}`);

  await page.click('#training-select-all');
  await page.selectOption('#training-bulk-status', { label: '在職' });
  await page.click('[data-bulk-general="是"]');
  await page.click('#training-apply-bulk');

  for (let index = 0; index < rowCount; index += 1) {
    await page.locator(`select[data-idx="${index}"][data-field="status"]`).selectOption({ label: '在職' });
  }

  for (let index = 0; index < rowCount; index += 1) {
    const infoValue = index === 0 ? '是' : '否';
    await page.locator(`select[data-idx="${index}"][data-field="isInfoStaff"]`).selectOption({ label: infoValue });
    if (infoValue === '是') {
      await page.click(`[data-testid="training-binary-completedprofessional-${index}-yes"]`);
    }
  }

  await page.waitForTimeout(250);
}

(async () => {
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage();
  attachDiagnostics(page, results);

  let trainingId = null;

  try {
    await resetApp(page);

    await runStep(results, 'TRN-01', '最高管理者', '名單管理可驗證單位三級選擇與單層單位隱藏', async () => {
      await login(page, results.context.admin.username, results.context.admin.password);
      await gotoHash(page, 'training-roster');
      await page.waitForSelector('#training-import-form');
      if (!(await page.locator('#training-import-unit-parent').isDisabled())) {
        throw new Error('parent select should be disabled before category selection');
      }
      await verifySingleLevelUnit(page, 'training-import-unit', SINGLE_LEVEL_UNIT);
      await chooseUnit(page, 'training-import-unit', TARGET_UNIT);
      const childVisible = await page.evaluate(() => {
        const childWrap = document.getElementById('training-import-unit-child-wrap');
        return window.getComputedStyle(childWrap).display !== 'none';
      });
      if (!childVisible) throw new Error('child unit selector should be visible for two-level unit');
      await saveScreenshot(page, 'training-roster-unit-cascade.png');
      return 'single-level unit hides child selector; two-level unit shows child selector';
    });

    await runStep(results, 'TRN-02', '最高管理者', 'Excel 匯入名單', async () => {
      await createRosterWorkbook(page, ROSTER_FILE_PATH, [
        ['姓名', '本職單位', '身分別', '職稱'],
        [IMPORT_NAMES[0], '資訊網路組', '職員', '工程師'],
        [IMPORT_NAMES[1], '資訊網路組', '委外', '駐點工程師']
      ]);
      await chooseUnit(page, 'training-import-unit', TARGET_UNIT);
      await page.setInputFiles('#training-import-file', ROSTER_FILE_PATH);
      await page.waitForFunction(() => {
        const copy = document.getElementById('training-import-file-copy');
        return !!copy && String(copy.textContent || '').includes('training-roster-import.xlsx');
      });
      await page.click('[data-testid="training-import-submit"]');
      await page.waitForFunction((names) => {
        const rows = Array.from(document.querySelectorAll('tbody tr')).map((row) => row.textContent || '');
        return names.every((name) => rows.some((text) => text.includes(name)));
      }, IMPORT_NAMES);
      const store = await getTrainingStore(page);
      const targetRows = (store.rosters || []).filter((row) => row.unit === TARGET_UNIT && IMPORT_NAMES.includes(row.name));
      if (targetRows.length !== IMPORT_NAMES.length) {
        throw new Error(`Expected ${IMPORT_NAMES.length} imported names, got ${targetRows.length}`);
      }
      await saveScreenshot(page, 'training-roster-imported.png');
      return `imported ${targetRows.length} roster rows for ${TARGET_UNIT}`;
    });
    await logout(page);

    await runStep(results, 'TRN-03', '單位管理員', '流程一填報與草稿鎖定前操作', async () => {
      await login(page, results.context.reporter.username, results.context.reporter.password);
      await gotoHash(page, 'training-fill');
      await page.waitForSelector('#training-form');
      const unitValue = await page.inputValue('#tr-unit');
      if (unitValue !== TARGET_UNIT) throw new Error(`Unexpected default unit ${unitValue}`);
      await populateTrainingFlowOne(page);
      await page.click('#training-save-draft');
      await page.waitForFunction(() => String(window.location.hash || '').startsWith('#training-fill/'));
      trainingId = decodeURIComponent((await currentHash(page)).replace(/^#training-fill\//, ''));
      if (!/^TRN-\d{3}-[A-Z0-9]+-\d+$/.test(trainingId)) {
        throw new Error(`Unexpected training id ${trainingId}`);
      }
      const draft = await getFormById(page, trainingId);
      if (!draft || draft.status !== '暫存') throw new Error('training draft not persisted');
      await saveScreenshot(page, 'training-flow1-draft.png');
      return trainingId;
    });

    await runStep(results, 'TRN-04', '單位管理員', '流程一完成後鎖定並可匯出 Excel', async () => {
      if (!trainingId) throw new Error('missing training draft id');
      await Promise.all([
        waitForHash(page, '#training-detail/' + trainingId),
        page.click('[data-testid="training-submit"]')
      ]);
      const pendingForm = await getFormById(page, trainingId);
      if (!pendingForm || pendingForm.status !== '待簽核') throw new Error('training form did not move to pending signoff');
      if (!pendingForm.stepOneSubmittedAt) throw new Error('stepOneSubmittedAt missing after flow one');
      const stepSummary = await page.locator('.training-step-card').allTextContents();
      if (!stepSummary.some((text) => text.includes('流程一') && text.includes('已完成並鎖定'))) {
        throw new Error(`step one status not updated: ${JSON.stringify(stepSummary)}`);
      }
      if (await page.locator('a[href="#training-fill/' + trainingId + '"]').count()) {
        throw new Error('edit link should not be visible after flow one is locked');
      }
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click('#training-export-detail')
      ]);
      const detailExport = await saveDownload(download, `detail-${trainingId}.xlsx`);
      await gotoHash(page, 'training-fill/' + trainingId);
      await expectHash(page, '#training-detail/' + trainingId);
      if (!fs.existsSync(detailExport)) throw new Error('detail export file not saved');
      await saveScreenshot(page, 'training-detail-pending-signoff.png');
      return `flow one locked and detail export saved to ${detailExport}`;
    });

    await runStep(results, 'TRN-05', '最高管理者', 'Dashboard 未完成區可看到待簽核單位', async () => {
      if (!trainingId) throw new Error('missing training id');
      await logout(page);
      await login(page, results.context.admin.username, results.context.admin.password);
      await gotoHash(page, 'training');
      await page.waitForSelector('.training-table-card');
      const incompleteText = await page.locator('.training-table-card').nth(1).textContent();
      if (!String(incompleteText || '').includes(TARGET_UNIT)) throw new Error('target unit missing from incomplete list');
      if (!String(incompleteText || '').includes('流程一已完成，待列印與上傳簽核表')) {
        throw new Error('pending signoff note missing from incomplete list');
      }
      await saveScreenshot(page, 'training-dashboard-incomplete.png');
      return 'admin dashboard lists pending-signoff unit in incomplete table';
    });

    await runStep(results, 'TRN-06', '單位管理員', '流程二列印簽核表', async () => {
      if (!trainingId) throw new Error('missing training id');
      await logout(page);
      await login(page, results.context.reporter.username, results.context.reporter.password);
      await gotoHash(page, 'training-detail/' + trainingId);
      await page.waitForSelector('#training-print-detail');
      const popupPromise = page.waitForEvent('popup');
      await page.click('#training-print-detail');
      const popup = await popupPromise;
      await popup.waitForLoadState('domcontentloaded');
      const popupText = await popup.textContent('body');
      if (!String(popupText || '').includes('114年國立臺灣大學資通安全教育訓練執行情形')) {
        throw new Error('print sheet title mismatch');
      }
      if (!String(popupText || '').includes('一級主管')) throw new Error('print sheet signer title mismatch');
      if (!String(popupText || '').includes('資通安全教育訓練統計注意事項')) throw new Error('print sheet notes missing');
      await saveScreenshot(popup, 'training-print-sheet.png');
      await popup.close();
      const printedForm = await getFormById(page, trainingId);
      if (!printedForm || !printedForm.printedAt) throw new Error('printedAt not stored after print');
      return 'print popup opened with new template and printedAt persisted';
    });

    await runStep(results, 'TRN-07', '單位管理員', '流程三上傳簽核掃描檔並完成', async () => {
      if (!trainingId) throw new Error('missing training id');
      await page.setInputFiles('#training-file-input', EVIDENCE_FILE_PATH);
      await page.waitForSelector('#training-file-previews .training-file-card');
      const actionText = await page.locator('#training-file-previews .training-file-actions').first().textContent();
      if (!String(actionText || '').includes('預覽') || !String(actionText || '').includes('下載')) {
        throw new Error('preview/download actions missing for uploaded signoff file');
      }
      await page.click('#training-finalize-submit');
      await page.waitForFunction(() => !document.querySelector('#training-finalize-submit'));
      const submittedForm = await getFormById(page, trainingId);
      if (!submittedForm || submittedForm.status !== '已完成填報') throw new Error('training form not finalized');
      if (!submittedForm.submittedAt || !submittedForm.signoffUploadedAt) throw new Error('final submission timestamps missing');
      if (!Array.isArray(submittedForm.signedFiles) || !submittedForm.signedFiles.length) throw new Error('signed files missing after finalization');
      const readonlyActions = await page.locator('#training-signed-files-readonly .training-file-actions').first().textContent();
      if (!String(readonlyActions || '').includes('預覽') || !String(readonlyActions || '').includes('下載')) {
        throw new Error('readonly preview/download actions missing after finalization');
      }
      await saveScreenshot(page, 'training-detail-finalized.png');
      return 'signoff file uploaded, preview/download retained, and form finalized';
    });
    await logout(page);

    await runStep(results, 'TRN-08', '最高管理者', 'Dashboard 已完成區與總表匯出', async () => {
      if (!trainingId) throw new Error('missing training id');
      await login(page, results.context.admin.username, results.context.admin.password);
      await gotoHash(page, 'training');
      await page.waitForSelector('.training-table-card');
      const completedText = await page.locator('.training-table-card').first().textContent();
      if (!String(completedText || '').includes(TARGET_UNIT)) throw new Error('target unit missing from completed table');
      const incompleteText = await page.locator('.training-table-card').nth(1).textContent();
      if (String(incompleteText || '').includes(TARGET_UNIT)) throw new Error('target unit still appears in incomplete table');
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click('#training-export-all')
      ]);
      const summaryExport = await saveDownload(download, `summary-${trainingId}.xlsx`);
      const store = await getTrainingStore(page);
      const submitted = (store.forms || []).find((entry) => entry.id === trainingId);
      if (!submitted || submitted.status !== '已完成填報') throw new Error('submitted form missing from store');
      await saveScreenshot(page, 'training-dashboard-completed.png');
      return `completed dashboard verified and summary export saved to ${summaryExport}`;
    });
  } finally {
    await context.close();
    await browser.close();
    const finalized = finalizeResults(results);
    writeJson(RESULT_PATH, finalized);
    if (finalized.summary.failed || finalized.summary.pageErrors) {
      process.exitCode = 1;
    }
  }
})().catch((error) => {
  results.fatal = error && error.stack ? error.stack : String(error);
  writeJson(RESULT_PATH, finalizeResults(results));
  console.error(results.fatal);
  process.exitCode = 1;
});
