const fs = require('fs');
const path = require('path');
const { BASE_URL, chooseUnitForHandlerUsername, createArtifactRun, launchBrowser } = require('./_role-test-utils.cjs');

const OUT_DIR = createArtifactRun('role-flow-smoke').outDir;
const SHOT_DIR = path.join(OUT_DIR, 'screenshots');
const RESULT_PATH = path.join(OUT_DIR, 'results.json');
const DUMMY_FILE_PATH = path.join(OUT_DIR, 'evidence.png');
const RUN_TAG = String(Date.now());
const UNIQUE_TEXT = RUN_TAG.slice(-6);
const UNIQUE_CASE_ID = `CAR-999-E2E-${UNIQUE_TEXT}`;
const UNIQUE_CHECKLIST_YEAR = String((Number(UNIQUE_TEXT) % 300) + 600).padStart(3, '0');

fs.mkdirSync(SHOT_DIR, { recursive: true });
if (!fs.existsSync(DUMMY_FILE_PATH)) {
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0x8AAAAASUVORK5CYII=';
  fs.writeFileSync(DUMMY_FILE_PATH, Buffer.from(pngBase64, 'base64'));
}

const results = {
  startedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  steps: [],
  console: [],
  pageErrors: [],
  artifacts: [],
  context: {
    admin: { username: 'easonwu', password: '2wsx#EDC' },
    reporter: { username: 'user3', password: 'user123' },
    proxyReporter: { username: 'user2', password: 'user123' },
    viewer: { username: 'viewer1', password: 'viewer123' }
  }
};

function addStep(id, role, title, status, detail, extra) {
  results.steps.push({ id, role, title, status, detail, ...(extra || {}) });
}

async function runStep(id, role, title, fn) {
  try {
    const detail = await fn();
    addStep(id, role, title, 'passed', detail || 'ok');
    return detail;
  } catch (error) {
    const message = error && error.stack ? error.stack : String(error);
    addStep(id, role, title, 'failed', message);
    return null;
  }
}

async function waitForHash(page, expected, timeout = 7000) {
  await page.waitForFunction((hash) => window.location.hash === hash, expected, { timeout });
}

async function gotoHash(page, hash) {
  const target = '#' + String(hash || '').replace(/^#/, '');
  await page.evaluate((value) => { window.location.hash = value; }, target);
  await page.waitForTimeout(180);
}

async function currentHash(page) {
  return page.evaluate(() => window.location.hash || '');
}

async function screenshot(page, fileName) {
  const filePath = path.join(SHOT_DIR, fileName);
  await page.screenshot({ path: filePath, fullPage: true });
  results.artifacts.push({ type: 'screenshot', path: filePath });
  return filePath;
}

async function acceptNextDialog(page) {
  page.once('dialog', async (dialog) => {
    try {
      await dialog.accept();
    } catch (_) {}
  });
}

async function confirmNextModal(page, timeout = 8000) {
  const confirm = page.locator('[data-modal-confirm]');
  await confirm.waitFor({ state: 'visible', timeout });
  await confirm.click();
  await page.waitForTimeout(180);
}

async function login(page, username, password) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  if (await page.locator('.btn-logout').count()) {
    await acceptNextDialog(page);
    await page.evaluate(() => window._logout?.());
  }
  await page.waitForSelector('[data-testid="login-form"]');
  await page.fill('[data-testid="login-user"]', username);
  await page.fill('[data-testid="login-pass"]', password);
  await Promise.all([
    page.waitForFunction(() => !!document.querySelector('#app'), { timeout: 7000 }),
    page.locator('[data-testid="login-form"]').evaluate((form) => form.requestSubmit())
  ]);
  await page.waitForFunction(() => {
    const state = String(window.__REMOTE_BOOTSTRAP_STATE__ || '').trim();
    return state === 'ready' || state === 'idle' || window.__APP_READY__ === true;
  }, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(250);
}

async function logout(page) {
  if (!(await page.locator('.btn-logout').count())) return;
  await acceptNextDialog(page);
  await page.evaluate(() => window._logout?.());
  await page.waitForTimeout(300);
  if (await page.locator('[data-testid="login-form"]').count()) return;
  const button = page.locator('.btn-logout').first();
  try {
    await button.click({ timeout: 5000 });
  } catch (_) {
    try {
      await button.evaluate((element) => {
        if (element && typeof element.click === 'function') element.click();
      });
    } catch (_) {}
  }
  try {
    await page.waitForSelector('[data-testid="login-form"]', { timeout: 15000 });
  } catch (_) {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="login-form"]', { timeout: 15000 });
  }
}

async function resetApp(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      window.location.hash = '';
      window.location.reload();
    })
  ]);
  await page.waitForSelector('[data-testid="login-form"]');
}

async function selectByMatcher(page, selector, matcherSource) {
  await page.evaluate(({ selector, matcherSource }) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Missing select: ${selector}`);
    const matcher = new Function('option', matcherSource);
    const option = Array.from(element.options).find((entry) => matcher({
      text: String(entry.textContent || '').trim(),
      value: String(entry.value || '').trim(),
      dataset: { ...entry.dataset }
    }));
    if (!option) {
      const existing = Array.from(element.options).map((entry) => ({ text: String(entry.textContent || '').trim(), value: String(entry.value || '').trim(), dataset: { ...entry.dataset } }));
      throw new Error(`Option not found for ${selector}: ${JSON.stringify(existing)}`);
    }
    element.value = option.value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, { selector, matcherSource });
  await page.waitForTimeout(140);
}

async function getData(page) {
  return page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('cats_data') || 'null');
    return raw && typeof raw === 'object' && Number.isFinite(Number(raw.version)) && Object.prototype.hasOwnProperty.call(raw, 'payload')
      ? raw.payload
      : (raw || {});
  });
}

async function getChecklists(page) {
  return page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('cats_checklists') || 'null');
    return raw && typeof raw === 'object' && Number.isFinite(Number(raw.version)) && Object.prototype.hasOwnProperty.call(raw, 'payload')
      ? raw.payload
      : (raw || { items: [] });
  });
}

async function getTrainingStore(page) {
  return page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('cats_training_hours') || 'null');
    return raw && typeof raw === 'object' && Number.isFinite(Number(raw.version)) && Object.prototype.hasOwnProperty.call(raw, 'payload')
      ? raw.payload
      : (raw || { forms: [] });
  });
}

function isoDate(offsetDays) {
  const value = new Date(Date.now() + offsetDays * 86400000);
  return value.toISOString().slice(0, 10);
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'info' && text.startsWith('[ISMS:')) {
      results.console.push({ type: msg.type(), text });
    }
    if (msg.type() === 'error') {
      results.console.push({ type: msg.type(), text });
    }
  });
  page.on('pageerror', (error) => {
    results.pageErrors.push({ message: error.message, stack: error.stack || '' });
  });

  let createdCarId = null;
  let checklistId = null;
  let trainingRouteKind = '';
  let trainingId = null;
  let trainingPrefillUnit = '';

  try {
    await resetApp(page);

    await runStep('ADM-01', '最高管理者', '登入與管理權限', async () => {
      await login(page, 'easonwu', '2wsx#EDC');
      const navPresence = {};
      const knownLinks = ['#users', '#login-log', '#checklist-manage', '#unit-review', '#training-roster'];
      for (const href of knownLinks) {
        navPresence[href] = await page.locator(`a[href="${href}"]`).count();
      }
      for (const route of ['users', 'login-log', 'checklist-manage', 'unit-review', 'training-roster']) {
        await gotoHash(page, route);
        await page.waitForTimeout(180);
        const hash = await currentHash(page);
        if (hash !== '#' + route) throw new Error(`unable to access ${route}, current hash ${hash}`);
      }
      await gotoHash(page, 'training');
      await page.waitForFunction(() => !!document.querySelector('.training-dashboard-page') || !!document.querySelector('.training-table-card'), { timeout: 15000 });
      await screenshot(page, 'admin-training-dashboard-initial.png');
      return `admin routes accessible; nav presence ${JSON.stringify(navPresence)}`;
    });
    await logout(page);

    await runStep('RP-01', '單位窗口', '登入與管理頁限制', async () => {
      await login(page, 'user3', 'user123');
      if (await page.locator('a[href="#create"]').count()) throw new Error('reporter should not see create link');
      if (await page.locator('a[href="#users"]').count()) throw new Error('reporter should not see users link');
      await gotoHash(page, 'users');
      await page.waitForTimeout(250);
      const hash = await currentHash(page);
      if (hash === '#users') throw new Error('reporter reached users page');
      return 'reporter blocked from users and create routes';
    });
    await logout(page);

    await runStep('ADM-02', '最高管理者', '建立矯正單', async () => {
      await login(page, 'easonwu', '2wsx#EDC');
      await gotoHash(page, 'create');
      await page.waitForSelector('#create-form');
      await chooseUnitForHandlerUsername(page, 'f-hunit', 'f-hname', 'unit1');
      await selectByMatcher(page, '#f-hname', 'return option.dataset.username === "unit1";');
      await page.fill('#f-pdate', isoDate(30));
      await page.fill('#f-id', UNIQUE_CASE_ID);
      await page.fill('#f-problem', `E2E 測試缺失 ${UNIQUE_TEXT}：驗證最高管理者開單與單位窗口回填流程。`);
      await page.fill('#f-occurrence', `以自動化流程建立一筆新的矯正單 ${UNIQUE_TEXT}，確認可進入後續回填與追蹤。`);
      await page.fill('#f-due', isoDate(10));
      await page.evaluate(() => {
        const defType = document.querySelector('input[name="defType"]');
        const source = document.querySelector('input[name="source"]');
        const category = document.querySelector('input[name="category"]');
        [defType, source, category].forEach((element) => {
          if (!element) throw new Error('missing create form selectors');
          element.checked = true;
          element.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
      await Promise.all([
        page.waitForFunction(() => window.location.hash.startsWith('#detail/'), { timeout: 8000 }),
        page.click('[data-testid="create-submit"]')
      ]);
      createdCarId = decodeURIComponent((await currentHash(page)).replace(/^#detail\//, ''));
      if (createdCarId !== UNIQUE_CASE_ID && !/^CAR-\d{3}-[A-Z0-9]+-\d+$/.test(createdCarId)) {
        throw new Error(`unexpected generated car id ${createdCarId}`);
      }
      const store = await getData(page);
      const item = (store.items || []).find((entry) => entry.id === createdCarId);
      if (!item) throw new Error('created CAR not found in storage');
      if (item.handlerUsername !== 'unit1') throw new Error(`expected handler unit1, got ${item.handlerUsername}`);
      return createdCarId;
    });
    await logout(page);

    await runStep('VW-01', '跨單位檢視者', '唯讀檢視與編輯限制', async () => {
      if (!createdCarId) throw new Error('no created CAR id');
      await login(page, 'viewer1', 'viewer123');
      if (await page.locator('a[href="#create"]').count()) throw new Error('viewer should not see create link');
      if (await page.locator('a[href="#users"]').count()) throw new Error('viewer should not see users link');
      await gotoHash(page, 'detail/' + createdCarId);
      if ((await currentHash(page)) !== '#detail/' + createdCarId) throw new Error('viewer cannot open detail');
      await gotoHash(page, 'checklist-fill');
      if ((await currentHash(page)) === '#checklist-fill') throw new Error('viewer reached checklist-fill');
      await gotoHash(page, 'training-fill');
      if ((await currentHash(page)) === '#training-fill') throw new Error('viewer reached training-fill');
      await logout(page);
      return 'viewer can read case detail and is blocked from fill routes';
    });

    await runStep('RP-02', '單位窗口代理', '同單位代理權限', async () => {
      await login(page, 'user2', 'user123');
      if (await page.locator('a[href="#create"]').count()) throw new Error('reporter should not see create link');
      await gotoHash(page, 'users');
      await page.waitForTimeout(240);
      const hash = await currentHash(page);
      if (hash === '#users') throw new Error('reporter reached users page');
      await gotoHash(page, 'detail/' + createdCarId);
      if ((await currentHash(page)) !== '#detail/' + createdCarId) throw new Error('proxy reporter cannot open same-unit case');
      return 'same-unit proxy reporter is blocked from admin pages and can view same-unit case';
    });
    await logout(page);

    await runStep('RP-03', '單位窗口', '回填矯正單', async () => {
      if (!createdCarId) throw new Error('no created CAR id');
      await login(page, 'unit1', 'unit123');
      await gotoHash(page, 'respond/' + createdCarId);
      await page.waitForSelector('#respond-form');
      await page.fill('#r-action', '已完成 E2E 測試矯正措施草案與責任分工。');
      await page.fill('#r-due', isoDate(12));
      await page.fill('#r-root', '根因為流程尚未以自動化回歸測試驗證，缺少提早發現問題的機制。');
      await page.fill('#r-elim', '建立回歸測試腳本，並在開單、回填與追蹤節點加入驗證。');
      await page.fill('#r-elimdue', isoDate(18));
      await page.fill('#r-risk', '若未持續驗證，後續版本可能再度出現流程中斷。');
      await Promise.all([
        waitForHash(page, '#detail/' + createdCarId),
        page.click('[data-testid="respond-submit"]')
      ]);
      const store = await getData(page);
      const item = (store.items || []).find((entry) => entry.id === createdCarId);
      if (!item || !item.correctiveAction || !item.rootCause || !item.rootElimination) throw new Error('response fields were not saved');
      return 'response submitted and stored';
    });
    await logout(page);

    await runStep('RP-04', '單位窗口', '檢核表草稿導頁一致性', async () => {
      await login(page, 'unit1', 'unit123');
      await gotoHash(page, 'checklist-fill');
      await page.waitForSelector('#checklist-form');
      await page.fill('#cl-supervisor-name', '測試主管');
      await page.fill('#cl-supervisor-title', '組長');
      await page.selectOption('#cl-sign-status', { index: 1 });
      await page.fill('#cl-sign-date', isoDate(0));
      await page.fill('#cl-year', UNIQUE_CHECKLIST_YEAR);
      await page.evaluate(() => {
        const names = Array.from(new Set(Array.from(document.querySelectorAll('.cl-radio-group input')).map((input) => input.name)));
        names.forEach((name) => {
          const target = document.querySelector(`input[name="${name}"]`);
          if (!target) throw new Error(`missing checklist radio ${name}`);
          target.checked = true;
          target.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
      await page.click('#cl-save-draft');
      await page.waitForFunction(() => {
        const hash = String(window.location.hash || '');
        return hash.startsWith('#checklist-fill/') || hash.startsWith('#checklist-detail/');
      }, { timeout: 15000 });
      const hash = await currentHash(page);
      if (!hash.startsWith('#checklist-fill/') && !hash.startsWith('#checklist-detail/')) {
        throw new Error(`draft route mismatch: ${hash}`);
      }
      const rawChecklistId = hash.split('/')[1] || null;
      checklistId = rawChecklistId ? decodeURIComponent(rawChecklistId) : null;
      if (!checklistId) throw new Error(`unable to parse checklist id from ${hash}`);
      if (!/^CHK-\d{3}-[A-Z0-9]+-\d+$/.test(checklistId)) throw new Error(`unexpected checklist id ${checklistId}`);
      const store = await getChecklists(page);
      const item = (store.items || []).find((entry) => entry.id === checklistId);
      if (!item) throw new Error('checklist draft not stored');
      return hash;
    });

    await runStep('RP-05', '單位窗口', '檢核表正式送出', async () => {
      if (!checklistId) throw new Error('missing checklist draft id');
      await Promise.all([
        waitForHash(page, '#checklist-detail/' + encodeURIComponent(checklistId)),
        page.click('[data-testid="checklist-submit"]')
      ]);
      const store = await getChecklists(page);
      const item = (store.items || []).find((entry) => entry.id === checklistId);
      if (!item) throw new Error('checklist missing after submit');
      if (String(item.status || '').includes('草稿')) throw new Error('checklist still in draft status after submit');
      return checklistId;
    });
    await logout(page);

    await runStep('RP-06', '單位窗口', '教育訓練草稿導頁一致性', async () => {
      await login(page, 'easonwu', '2wsx#EDC');
      await gotoHash(page, 'training');
      await page.waitForFunction(() => !!document.querySelector('.training-dashboard-page') || !!document.querySelector('.training-table-card'), { timeout: 15000 });
      const fillLink = page.locator('a[href^="#training-fill/"]').first();
      const detailLink = page.locator('a[href^="#training-detail/"]').first();
      const useEditableLink = await fillLink.count();
      const trainingLink = useEditableLink ? fillLink : detailLink;
      if (!await trainingLink.count()) throw new Error('training action link missing');
      const href = String(await trainingLink.getAttribute('href') || '').trim();
      if (!href) throw new Error('training action href missing');
      const normalizedHref = decodeURIComponent(href);
      trainingRouteKind = normalizedHref.startsWith('#training-fill/unit:') ? 'unit' : (normalizedHref.startsWith('#training-fill/') ? 'fill' : 'detail');
      trainingId = '';
      trainingPrefillUnit = '';
      if (trainingRouteKind === 'unit') {
        trainingPrefillUnit = normalizedHref.replace(/^#training-fill\/unit:/, '').trim();
        if (!trainingPrefillUnit) throw new Error(`unable to parse training unit from ${href}`);
      } else {
        trainingId = normalizedHref.replace(/^#training-(?:detail|fill)\//, '').trim();
        if (!trainingId) throw new Error(`unable to parse training id from ${href}`);
        if (!/^TRN-\d{3}-[A-Z0-9]+-\d+$/.test(trainingId)) throw new Error(`unexpected training id ${trainingId}`);
      }
      await trainingLink.click();
      await page.waitForFunction((target) => window.location.hash === target, href, { timeout: 10000 });
      return `${trainingRouteKind}:${href}`;
    });

    await runStep('RP-07', '單位窗口', '教育訓練草稿可進入詳情頁', async () => {
      if (trainingRouteKind === 'unit') {
        const currentUnit = String(await page.locator('#tr-unit').inputValue() || '').trim();
        if (!currentUnit) throw new Error('training unit prefill missing');
        if (currentUnit !== trainingPrefillUnit) throw new Error(`unexpected training unit prefill ${currentUnit}`);
        if (!await page.locator('#training-form').count()) throw new Error('training form missing for unit prefill route');
        if (!await page.locator('[data-testid="training-submit"]').count()) throw new Error('training submit missing for unit prefill route');
        if (!await page.locator('#training-save-draft').count()) throw new Error('training save draft missing for unit prefill route');
        return `unit-prefill training route accessible at ${trainingPrefillUnit}`;
      }
      if (!trainingId) throw new Error('missing training draft id');
      const detailIsEditable = trainingRouteKind === 'fill';
      await gotoHash(page, 'training-detail/' + trainingId);
      await page.waitForFunction((target) => window.location.hash === target, '#training-detail/' + trainingId, { timeout: 10000 });
      await page.waitForTimeout(250);
      const detailHash = await currentHash(page);
      if (detailHash !== '#training-detail/' + trainingId) throw new Error(`unexpected training detail hash: ${detailHash}`);
      if (!await page.locator('#training-print-detail').count()) throw new Error('print button missing on training detail');
      const continueFillCount = await page.locator('a[href="#training-fill/' + trainingId + '"]').count();
      if (detailIsEditable && !continueFillCount) throw new Error('continue-fill link missing for editable training detail');
      if (!detailIsEditable && continueFillCount) throw new Error('locked training detail unexpectedly exposes continue-fill');
      return detailIsEditable
        ? `editable training detail accessible at ${trainingId}`
        : `read-only training detail accessible at ${trainingId}`;
    });
    await logout(page);

    await runStep('ADM-03', '最高管理者', '審核矯正單並轉入追蹤', async () => {
      if (!createdCarId) throw new Error('missing car id for admin review');
      await login(page, 'easonwu', '2wsx#EDC');
      await gotoHash(page, 'detail/' + createdCarId);
      await page.waitForFunction(() => !!document.querySelector('.detail-header'), { timeout: 15000 });
      const reviewButton = page.locator('[data-testid="case-transition-review"]');
      if (!await reviewButton.count()) throw new Error('review transition button not available');
      await reviewButton.click();
      await confirmNextModal(page);
      await page.waitForFunction(() => !!document.querySelector('[data-testid="case-transition-tracking"]'), { timeout: 10000 });
      const trackButton = page.locator('[data-testid="case-transition-tracking"]');
      if (!await trackButton.count()) throw new Error('tracking transition button not available');
      await trackButton.click();
      await confirmNextModal(page);
      await page.waitForFunction(() => {
        const status = document.querySelector('.detail-meta .badge .badge-dot');
        return !!document.querySelector('[data-testid="case-fill-tracking"]') || !!document.querySelector('[data-testid="case-tracking-approve-close"]');
      }, { timeout: 10000 }).catch(() => {});
      const store = await getData(page);
      const item = (store.items || []).find((entry) => entry.id === createdCarId);
      if (!item) throw new Error('CAR missing after review transition');
      if (item.pendingTracking) throw new Error('pendingTracking should be empty before reporter submission');
      if (!Array.isArray(item.trackings)) throw new Error('tracking array missing after transition');
      return 'moved to tracking stage';
    });
    await logout(page);

    await runStep('RP-08', '單位窗口', '送出追蹤提報', async () => {
      if (!createdCarId) throw new Error('missing car id for tracking');
      await login(page, 'unit1', 'unit123');
      await gotoHash(page, 'tracking/' + createdCarId);
      await page.waitForSelector('#track-form');
      await page.fill('#tk-exec', '已完成追蹤改善措施驗證，流程可正確流轉並保留測試證據。');
      await page.fill('#tk-note', '本次追蹤建議結案，後續納入固定回歸測試。');
      await page.evaluate(() => {
        const option = document.querySelector('input[name="tkResult"]');
        if (!option) throw new Error('missing tracking result option');
        option.checked = true;
        option.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.setInputFiles('#tk-file-input', DUMMY_FILE_PATH);
      await Promise.all([
        waitForHash(page, '#detail/' + createdCarId),
        page.click('[data-testid="tracking-submit"]')
      ]);
      const store = await getData(page);
      const item = (store.items || []).find((entry) => entry.id === createdCarId);
      if (!item || !item.pendingTracking) throw new Error('pending tracking submission not saved');
      return 'tracking submission waiting for admin review';
    });
    await logout(page);

    await runStep('ADM-04', '最高管理者', '審核追蹤提報並結案', async () => {
      if (!createdCarId) throw new Error('missing car id for final review');
      await login(page, 'easonwu', '2wsx#EDC');
      await gotoHash(page, 'detail/' + createdCarId);
      await page.waitForFunction(() => !!document.querySelector('.detail-header'), { timeout: 15000 });
      const approveButton = page.locator('[data-testid="case-tracking-approve-close"]');
      if (!await approveButton.count()) throw new Error('approve tracking button not found');
      await approveButton.click();
      await page.waitForTimeout(300);
      await page.waitForFunction(() => !document.querySelector('[data-testid="case-tracking-approve-close"]'), { timeout: 10000 }).catch(() => {});
      const store = await getData(page);
      const item = (store.items || []).find((entry) => entry.id === createdCarId);
      if (!item) throw new Error('CAR missing after final review');
      if (item.pendingTracking) throw new Error('pendingTracking should be cleared after approval');
      if (!item.closedDate) throw new Error('closedDate missing after final approval');
      await gotoHash(page, 'training');
      await page.waitForFunction(() => !!document.querySelector('.training-dashboard-page') || !!document.querySelector('.training-table-card'), { timeout: 15000 });
      await screenshot(page, 'admin-training-dashboard-final.png');
      return 'tracking approved and case closed';
    });
  } finally {
    results.finishedAt = new Date().toISOString();
    results.summary = {
      passed: results.steps.filter((step) => step.status === 'passed').length,
      failed: results.steps.filter((step) => step.status === 'failed').length,
      pageErrors: results.pageErrors.length,
      flowLogs: results.console.filter((entry) => entry.text.startsWith('[ISMS:')).length
    };
    fs.writeFileSync(RESULT_PATH, JSON.stringify(results, null, 2));
    if (results.summary.failed || results.summary.pageErrors) {
      process.exitCode = 1;
    }
    await browser.close();
  }
})().catch((error) => {
  results.fatal = error && error.stack ? error.stack : String(error);
  results.finishedAt = new Date().toISOString();
  results.summary = {
    passed: results.steps.filter((step) => step.status === 'passed').length,
    failed: results.steps.filter((step) => step.status === 'failed').length,
    pageErrors: results.pageErrors.length,
    flowLogs: results.console.filter((entry) => entry.text.startsWith('[ISMS:')).length
  };
  fs.writeFileSync(RESULT_PATH, JSON.stringify(results, null, 2));
  console.error(results.fatal);
  process.exit(1);
});
