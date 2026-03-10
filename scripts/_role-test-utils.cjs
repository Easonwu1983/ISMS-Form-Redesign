const fs = require('fs');
const path = require('path');
const { chromium } = require('./_playwright.cjs');

const BASE_URL = 'http://127.0.0.1:8080/';
const BROWSER_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
];
const ARTIFACT_TZ = process.env.TEST_ARTIFACT_TZ || 'Asia/Taipei';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getArtifactDateStamp(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ARTIFACT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function createArtifactRun(prefix) {
  const dateStamp = getArtifactDateStamp();
  const outDir = path.join(process.cwd(), 'test-artifacts', `${prefix}-${dateStamp}`);
  ensureDir(outDir);
  return { dateStamp, outDir };
}

async function launchBrowser() {
  const executablePath = BROWSER_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  return chromium.launch(executablePath ? { headless: true, executablePath } : { headless: true });
}

function createResultEnvelope(extra) {
  return {
    startedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    console: [],
    pageErrors: [],
    ...extra
  };
}

function attachDiagnostics(page, results) {
  page.on('console', (msg) => {
    if (!results.console) return;
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      results.console.push({ type, text: msg.text() });
    }
  });
  page.on('pageerror', (error) => {
    if (!results.pageErrors) return;
    results.pageErrors.push(String(error && error.stack ? error.stack : error));
  });
}

function addStep(results, id, role, title, status, detail, extra) {
  results.steps.push({ id, role, title, status, detail, ...(extra || {}) });
}

async function runStep(results, id, role, title, fn) {
  try {
    const detail = await fn();
    addStep(results, id, role, title, 'passed', detail || 'ok');
    return detail;
  } catch (error) {
    const message = error && error.stack ? error.stack : String(error);
    addStep(results, id, role, title, 'failed', message);
    return null;
  }
}

async function gotoHash(page, hash) {
  const target = '#' + String(hash || '').replace(/^#/, '');
  await page.evaluate((value) => { window.location.hash = value; }, target);
  await page.waitForTimeout(180);
}

async function currentHash(page) {
  return page.evaluate(() => window.location.hash || '');
}

async function waitForHash(page, expected, timeout = 7000) {
  await page.waitForFunction((hash) => window.location.hash === hash, expected, { timeout });
}

async function login(page, username, password) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  if (await page.locator('.btn-logout').count()) {
    await page.evaluate(() => window._logout());
  }
  await page.waitForSelector('#login-form');
  await page.fill('#login-user', username);
  await page.fill('#login-pass', password);
  await Promise.all([
    page.waitForFunction(() => !!document.querySelector('#app'), { timeout: 7000 }),
    page.click('#login-form button[type="submit"]')
  ]);
  await page.waitForTimeout(250);
}

async function logout(page) {
  if (await page.locator('.btn-logout').count()) {
    await page.click('.btn-logout');
    await page.waitForSelector('#login-form');
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
  await page.waitForSelector('#login-form');
}

async function readJsonFromStorage(page, key) {
  return page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  }, key);
}

async function chooseUnitForHandlerUsername(page, baseId, handlerSelectId, username) {
  await page.evaluate(({ baseId, handlerSelectId, username }) => {
    const categorySelect = document.getElementById(baseId + '-category');
    const parentSelect = document.getElementById(baseId + '-parent');
    const childSelect = document.getElementById(baseId + '-child');
    const handlerSelect = document.getElementById(handlerSelectId);
    if (!parentSelect || !childSelect || !handlerSelect) {
      throw new Error(`Missing handler unit controls for ${baseId}`);
    }

    const dispatch = (element) => element.dispatchEvent(new Event('change', { bubbles: true }));
    const selectableOptions = (select) => Array.from(select.options).filter((entry) => String(entry.value || '').trim());
    const findHandler = () => Array.from(handlerSelect.options).find((entry) => entry.dataset.username === username);
    const categoryOptions = categorySelect ? selectableOptions(categorySelect) : [{ value: '' }];

    for (const categoryOption of categoryOptions) {
      if (categorySelect) {
        categorySelect.value = categoryOption.value;
        dispatch(categorySelect);
      }

      const parentOptions = selectableOptions(parentSelect);
      for (const parentOption of parentOptions) {
        parentSelect.value = parentOption.value;
        dispatch(parentSelect);

        const childOptions = childSelect.disabled ? [] : selectableOptions(childSelect);
        if (childOptions.length) {
          for (const childOption of childOptions) {
            childSelect.value = childOption.value;
            dispatch(childSelect);
            if (findHandler()) return;
          }
        } else {
          const directHandler = findHandler();
          if (directHandler) return;
        }
      }
    }

    const snapshot = {
      categories: categorySelect ? selectableOptions(categorySelect).map((entry) => String(entry.textContent || '').trim()) : [],
      parents: selectableOptions(parentSelect).map((entry) => String(entry.textContent || '').trim()),
      children: selectableOptions(childSelect).map((entry) => String(entry.textContent || '').trim()),
      handlers: Array.from(handlerSelect.options).map((entry) => ({
        text: String(entry.textContent || '').trim(),
        username: String(entry.dataset.username || '').trim()
      }))
    };
    throw new Error(`Unable to find handler ${username}: ${JSON.stringify(snapshot)}`);
  }, { baseId, handlerSelectId, username });
  await page.waitForTimeout(180);
}

function finalizeResults(results) {
  const steps = Array.isArray(results.steps) ? results.steps : [];
  results.finishedAt = new Date().toISOString();
  results.summary = {
    passed: steps.filter((step) => step.status === 'passed').length,
    failed: steps.filter((step) => step.status !== 'passed').length,
    consoleErrors: Array.isArray(results.console) ? results.console.length : 0,
    pageErrors: Array.isArray(results.pageErrors) ? results.pageErrors.length : 0
  };
  return results;
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

module.exports = {
  BASE_URL,
  attachDiagnostics,
  chooseUnitForHandlerUsername,
  createArtifactRun,
  createResultEnvelope,
  currentHash,
  finalizeResults,
  getArtifactDateStamp,
  gotoHash,
  launchBrowser,
  login,
  logout,
  readJsonFromStorage,
  resetApp,
  runStep,
  waitForHash,
  writeJson
};
