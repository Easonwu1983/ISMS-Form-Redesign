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
  writeJson
} = require('./_role-test-utils.cjs');

const runMeta = createArtifactRun('training-flow-acceptance');
const OUT_DIR = runMeta.outDir;
const SHOT_DIR = path.join(OUT_DIR, 'screenshots');
const DOWNLOAD_DIR = path.join(OUT_DIR, 'downloads');
const RESULT_PATH = path.join(OUT_DIR, 'training-flow-acceptance.json');
const ROSTER_FILE_PATH = path.join(OUT_DIR, 'training-roster-import.xlsx');
const EVIDENCE_FILE_PATH = path.join(OUT_DIR, 'training-signoff-evidence.png');
const IMPORT_NAMES = [`FlowAccept${Date.now()}A`, `FlowAccept${Date.now()}B`];
const TEST_TRAINING_YEAR = String(new Date().getFullYear() - 1910);
const SAMPLE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0x8AAAAASUVORK5CYII=';

fs.mkdirSync(SHOT_DIR, { recursive: true });
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
if (!fs.existsSync(EVIDENCE_FILE_PATH)) {
  fs.writeFileSync(EVIDENCE_FILE_PATH, Buffer.from(SAMPLE_PNG_BASE64, 'base64'));
}

const results = createResultEnvelope({
  steps: [],
  artifacts: [],
  context: {
    admin: { username: 'admin', password: 'admin123' },
    reporter: { username: 'unit1', password: 'unit123' },
    importedNames: IMPORT_NAMES,
    importUnit: '',
    reporterUnit: ''
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
  const filePath = path.join(DOWNLOAD_DIR, preferredName || download.suggestedFilename());
  await download.saveAs(filePath);
  trackArtifact('download', filePath);
  return filePath;
}

async function waitForBootstrap(page) {
  await page.waitForFunction(() => window.__REMOTE_BOOTSTRAP_STATE__ !== 'pending', undefined, { timeout: 45000 });
}

async function getTrainingStore(page) {
  return await readJsonFromStorage(page, 'cats_training_hours') || { forms: [], rosters: [] };
}

async function ensureTrainingImportPanelVisible(page) {
  await waitForBootstrap(page);
  await page.waitForSelector('#training-roster-import-wrap', { state: 'attached', timeout: 45000 });
  await page.evaluate(() => {
    const wrap = document.getElementById('training-roster-import-wrap');
    if (wrap) wrap.style.display = '';
  });
  await page.waitForSelector('#training-import-form', { state: 'attached', timeout: 45000 });
}

async function fetchTrainingRostersByNames(page, names) {
  return await page.evaluate(async (targetNames) => {
    const token = window._authModule?.currentUser?.()?.sessionToken || '';
    const response = await fetch('/api/training/rosters', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const body = await response.json();
    const items = []
      .concat(Array.isArray(body) ? body : [])
      .concat(Array.isArray(body?.items) ? body.items : [])
      .concat(Array.isArray(body?.value) ? body.value : []);
    return items.filter((item) => targetNames.includes(String(item?.name || '').trim()));
  }, names);
}

async function waitForTrainingRostersByNames(page, names, timeout = 45000) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeout) {
    const rows = await fetchTrainingRostersByNames(page, names);
    if (names.every((name) => rows.some((row) => String(row?.name || '').trim() === name))) {
      return rows;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`training rosters not visible after ${timeout}ms: ${names.join(', ')}`);
}

async function waitForTrainingRosterRowsByNames(page, names, timeout = 45000) {
  await page.waitForFunction((targetNames) => {
    const rows = Array.from(document.querySelectorAll('tr[data-roster-name]')).map((row) => String(row.dataset.rosterName || '').trim());
    return targetNames.every((name) => rows.includes(name));
  }, names, { timeout });
}

async function pickCascadeTargets(page, baseId) {
  return await page.evaluate((baseId) => {
    const categoryEl = document.getElementById(`${baseId}-category`);
    const parentEl = document.getElementById(`${baseId}-parent`);
    const childEl = document.getElementById(`${baseId}-child`);
    const hiddenEl = document.getElementById(baseId);
    if (!categoryEl || !parentEl || !childEl || !hiddenEl) {
      throw new Error(`Missing unit cascade ${baseId}`);
    }
    const dispatch = (element) => element.dispatchEvent(new Event('change', { bubbles: true }));
    const categories = Array.from(categoryEl.options).map((option) => String(option.value || '').trim()).filter(Boolean);
    let singleLevel = '';
    let multiLevel = '';
    for (const category of categories) {
      categoryEl.value = category;
      dispatch(categoryEl);
      const parents = Array.from(parentEl.options).map((option) => String(option.value || '').trim()).filter(Boolean);
      for (const parent of parents) {
        parentEl.value = parent;
        dispatch(parentEl);
        const children = Array.from(childEl.options).map((option) => String(option.value || '').trim()).filter(Boolean);
        if (!children.length && !singleLevel) {
          singleLevel = hiddenEl.value || parent;
        }
        if (children.length && !multiLevel) {
          childEl.value = children[0];
          dispatch(childEl);
          multiLevel = hiddenEl.value || `${parent}／${children[0]}`;
        }
        if (singleLevel && multiLevel) return { singleLevel, multiLevel };
      }
    }
    return { singleLevel, multiLevel };
  }, baseId);
}

async function selectCascadeUnit(page, baseId, fullUnit) {
  await page.evaluate(({ baseId, fullUnit }) => {
    const categoryEl = document.getElementById(`${baseId}-category`);
    const parentEl = document.getElementById(`${baseId}-parent`);
    const childEl = document.getElementById(`${baseId}-child`);
    const hiddenEl = document.getElementById(baseId);
    if (!categoryEl || !parentEl || !childEl || !hiddenEl) {
      throw new Error(`Missing unit cascade ${baseId}`);
    }
    const parts = String(fullUnit || '').split(/[／/]/);
    const parent = String(parts[0] || '').trim();
    const child = String(parts.slice(1).join('／') || '').trim();
    const dispatch = (element) => element.dispatchEvent(new Event('change', { bubbles: true }));
    const categories = Array.from(categoryEl.options).map((option) => String(option.value || '').trim()).filter(Boolean);
    let matched = false;
    for (const category of categories) {
      categoryEl.value = category;
      dispatch(categoryEl);
      const hasParent = Array.from(parentEl.options).some((option) => String(option.value || '').trim() === parent);
      if (hasParent) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      throw new Error(`Unable to locate parent unit ${parent}`);
    }
    parentEl.value = parent;
    dispatch(parentEl);
    if (child) {
      const hasChild = Array.from(childEl.options).some((option) => String(option.value || '').trim() === child);
      if (!hasChild) throw new Error(`Unable to locate child unit ${child}`);
      childEl.value = child;
      dispatch(childEl);
    }
  }, { baseId, fullUnit });
  await page.waitForFunction(({ baseId, fullUnit }) => {
    const hidden = document.getElementById(baseId);
    return !!hidden && String(hidden.value || '').trim() === String(fullUnit || '').trim();
  }, { baseId, fullUnit }, { timeout: 45000 });
}

async function verifySingleLevelUnit(page, baseId, fullUnit) {
  await selectCascadeUnit(page, baseId, fullUnit);
  await page.waitForFunction((baseId) => {
    const childWrap = document.getElementById(`${baseId}-child-wrap`);
    const childEl = document.getElementById(`${baseId}-child`);
    if (!childWrap || !childEl) return false;
    const style = window.getComputedStyle(childWrap);
    return style.display === 'none' && childEl.disabled;
  }, baseId, { timeout: 45000 });
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

async function deleteTrainingRostersByNames(page, names) {
  await page.evaluate(async (targetNames) => {
    const token = window._authModule?.currentUser?.()?.sessionToken || '';
    const response = await fetch('/api/training/rosters', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) return;
    const body = await response.json();
    const items = []
      .concat(Array.isArray(body) ? body : [])
      .concat(Array.isArray(body?.items) ? body.items : [])
      .concat(Array.isArray(body?.value) ? body.value : []);
    const matches = items.filter((item) => targetNames.includes(String(item?.name || '').trim()));
    for (const item of matches) {
      await fetch(`/api/training/rosters/${encodeURIComponent(item.id)}/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'training.roster.delete',
          payload: { id: item.id, actorName: 'training-flow-acceptance', actorUsername: 'admin' }
        })
      });
    }
  }, names);
}

async function deleteTrainingForm(page, formId) {
  if (!formId) return;
  await page.evaluate(async (id) => {
    const token = window._authModule?.currentUser?.()?.sessionToken || '';
    await fetch(`/api/training/forms/${encodeURIComponent(id)}/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        action: 'training.form.delete',
        payload: { id, actorName: 'training-flow-acceptance', actorUsername: 'admin' }
      })
    });
  }, formId);
}

async function populateTrainingForm(page) {
  await page.fill('#tr-phone', '02-3366-1234');
  await page.fill('#tr-email', 'unit1@g.ntu.edu.tw');
  await page.fill('#tr-year', TEST_TRAINING_YEAR);
  await page.fill('#tr-date', new Date().toISOString().slice(0, 10));
  const rowCount = await page.locator('select[data-field="status"]').count();
  if (!rowCount) throw new Error('training form has zero roster rows');
  for (let index = 0; index < rowCount; index += 1) {
    await page.locator(`select[data-idx="${index}"][data-field="status"]`).selectOption({ index: 1 });
    const infoSelect = page.locator(`select[data-idx="${index}"][data-field="isInfoStaff"]`);
    if (await infoSelect.count()) {
      await infoSelect.selectOption({ index: 1 });
    }
    for (const key of ['completedgeneral', 'completedprofessional']) {
      const yesButton = page.locator(`[data-testid="training-binary-${key}-${index}-yes"]`);
      if (await yesButton.count()) {
        await yesButton.click();
      }
    }
  }
}

(async () => {
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage();
  attachDiagnostics(page, results);

  let trainingId = '';

  try {
    await resetApp(page);

    await runStep(results, 'TRN-01', '最高管理員', '名單管理單位階層可正常切換', async () => {
      await login(page, results.context.admin.username, results.context.admin.password);
      await waitForBootstrap(page);
      await gotoHash(page, 'training-roster');
      await ensureTrainingImportPanelVisible(page);
      const targets = await pickCascadeTargets(page, 'training-import-unit');
      if (!targets.singleLevel || !targets.multiLevel) {
        throw new Error(`unable to resolve cascade targets: ${JSON.stringify(targets)}`);
      }
      results.context.importUnit = targets.multiLevel;
      await verifySingleLevelUnit(page, 'training-import-unit', targets.singleLevel);
      await selectCascadeUnit(page, 'training-import-unit', targets.multiLevel);
      await saveScreenshot(page, 'training-roster-unit-cascade.png');
      return `single=${targets.singleLevel}; multi=${targets.multiLevel}`;
    });

    await runStep(results, 'TRN-02', '最高管理員', 'Excel 匯入名單會寫入遠端 roster', async () => {
      await createRosterWorkbook(page, ROSTER_FILE_PATH, [
        ['姓名', '本職單位', '身分別', '職稱'],
        [IMPORT_NAMES[0], '資訊網路組', '主管', '組長'],
        [IMPORT_NAMES[1], '資訊網路組', '填報人', '工程師']
      ]);
      await ensureTrainingImportPanelVisible(page);
      await selectCascadeUnit(page, 'training-import-unit', results.context.importUnit);
      await page.setInputFiles('#training-import-file', ROSTER_FILE_PATH);
      await page.click('[data-testid="training-import-submit"]');
      await gotoHash(page, 'training-roster');
      await page.waitForSelector('.training-table-card', { timeout: 45000 });
      await waitForTrainingRosterRowsByNames(page, IMPORT_NAMES, 45000);
      await saveScreenshot(page, 'training-roster-imported.png');
      return `imported ${IMPORT_NAMES.join(', ')}`;
    });

    await logout(page);

    await runStep(results, 'TRN-03', '填報人', '流程一可儲存草稿', async () => {
      await login(page, results.context.reporter.username, results.context.reporter.password);
      await waitForBootstrap(page);
      await gotoHash(page, 'training-fill');
      await page.waitForSelector('#training-form', { timeout: 45000 });
      results.context.reporterUnit = await page.inputValue('#tr-unit');
      await populateTrainingForm(page);
      await page.click('#training-save-draft');
      await page.waitForFunction(() => String(window.location.hash || '').startsWith('#training-fill/'), undefined, { timeout: 45000 });
      trainingId = decodeURIComponent((await currentHash(page)).replace(/^#training-fill\//, ''));
      if (!/^TRN-/.test(trainingId)) throw new Error(`unexpected training id ${trainingId}`);
      const store = await getTrainingStore(page);
      const form = (store.forms || []).find((entry) => entry.id === trainingId);
      if (!form || form.status !== '暫存') throw new Error('training draft not persisted');
      await saveScreenshot(page, 'training-flow-draft.png');
      return trainingId;
    });

    await runStep(results, 'TRN-04', '填報人', '流程一送出後轉成待簽核', async () => {
      if (!trainingId) throw new Error('missing training id');
      await Promise.all([
        page.waitForFunction(() => String(window.location.hash || '').startsWith('#training-detail/'), undefined, { timeout: 45000 }),
        page.click('[data-testid="training-submit"]')
      ]);
      if (!await page.locator('#training-undo-step-one').count()) {
        throw new Error('undo button missing after flow one submit');
      }
      const store = await getTrainingStore(page);
      const form = (store.forms || []).find((entry) => entry.id === trainingId);
      if (!form || form.status !== '待簽核') throw new Error('training form did not enter pending signoff');
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click('#training-export-detail')
      ]);
      const exportPath = await saveDownload(download, `detail-${trainingId}.xlsx`);
      if (!fs.existsSync(exportPath)) throw new Error('detail export was not saved');
      return `pending signoff with export ${exportPath}`;
    });

    await runStep(results, 'TRN-05', '最高管理員', 'Dashboard 未完成填報會列出待簽核單位', async () => {
      await logout(page);
      await login(page, results.context.admin.username, results.context.admin.password);
      await waitForBootstrap(page);
      await gotoHash(page, 'training');
      await page.waitForSelector('.training-table-card', { timeout: 45000 });
      await page.waitForFunction((unit) => String(document.getElementById('app')?.innerText || '').includes(unit), results.context.reporterUnit, { timeout: 45000 });
      const appText = await page.locator('#app').innerText();
      if (!String(appText).includes(results.context.reporterUnit)) throw new Error('reporter unit missing from dashboard');
      await saveScreenshot(page, 'training-dashboard-incomplete.png');
      return results.context.reporterUnit;
    });

    await runStep(results, 'TRN-06', '填報人', '可列印簽核表並記錄 printedAt', async () => {
      await logout(page);
      await login(page, results.context.reporter.username, results.context.reporter.password);
      await waitForBootstrap(page);
      await gotoHash(page, `training-detail/${trainingId}`);
      await page.waitForSelector('#training-print-detail', { timeout: 45000 });
      const popupPromise = page.waitForEvent('popup');
      await page.click('#training-print-detail');
      const popup = await popupPromise;
      await popup.waitForLoadState('domcontentloaded');
      const popupText = await popup.textContent('body');
      if (!String(popupText || '').includes('國立臺灣大學資通安全教育訓練')) {
        throw new Error('print sheet title mismatch');
      }
      await saveScreenshot(popup, 'training-print-sheet.png');
      await popup.close();
      await gotoHash(page, `training-detail/${trainingId}`);
      await page.waitForSelector('#training-print-detail', { timeout: 45000 });
      await page.waitForFunction(() => String(document.getElementById('app')?.innerText || '').includes('已列印'), undefined, { timeout: 45000 });
      return 'print sheet verified';
    });

    await runStep(results, 'TRN-07', '填報人', '上傳簽核掃描檔並完成整體填報', async () => {
      await gotoHash(page, `training-detail/${trainingId}`);
      await page.waitForSelector('#training-file-input', { timeout: 45000 });
      await page.setInputFiles('#training-file-input', EVIDENCE_FILE_PATH);
      await page.waitForSelector('#training-file-previews .training-file-card', { timeout: 45000 });
      await page.click('#training-finalize-submit');
      await page.waitForFunction(() => !document.querySelector('#training-finalize-submit'), undefined, { timeout: 45000 });
      const detailText = await page.locator('#app').innerText();
      if (!String(detailText).includes('整體填報已完成') && !String(detailText).includes('已完成填報')) {
        throw new Error('finalized detail state not rendered');
      }
      return 'finalized with signoff upload';
    });

    await runStep(results, 'TRN-08', '最高管理員', 'Dashboard 已完成填報會列出完成單位', async () => {
      await logout(page);
      await login(page, results.context.admin.username, results.context.admin.password);
      await waitForBootstrap(page);
      await gotoHash(page, 'training');
      await page.waitForFunction((unit) => String(document.getElementById('app')?.innerText || '').includes(unit), results.context.reporterUnit, { timeout: 45000 });
      const appText = await page.locator('#app').innerText();
      if (!String(appText).includes(results.context.reporterUnit)) throw new Error('completed unit missing from dashboard');
      await saveScreenshot(page, 'training-dashboard-complete.png');
      return results.context.reporterUnit;
    });
  } finally {
    try {
      await login(page, results.context.admin.username, results.context.admin.password);
      await waitForBootstrap(page);
      await deleteTrainingRostersByNames(page, IMPORT_NAMES);
      await deleteTrainingForm(page, trainingId);
    } catch (_) {}
    await browser.close();
    const finalized = finalizeResults(results);
    writeJson(RESULT_PATH, finalized);
    if (finalized.summary.failed || finalized.summary.pageErrors) process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


