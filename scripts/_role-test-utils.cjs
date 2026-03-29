const fs = require('fs');
const path = require('path');
const { chromium } = require('./_playwright.cjs');

const BASE_URL = String(process.env.TEST_BASE_URL || process.env.ISMS_LIVE_BASE || 'http://127.0.0.1:8088/')
  .trim()
  .replace(/\/+$/, '');
const BROWSER_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
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
      const text = msg.text();
      if (/Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/.test(text)) {
        return;
      }
      results.console.push({ type, text });
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

async function acceptNextDialog(page, action = 'accept') {
  const handler = async (dialog) => {
    try {
      if (action === 'dismiss') await dialog.dismiss();
      else await dialog.accept();
    } catch (_) {
      // Ignore races if the page closes before the dialog is handled.
    }
  };
  page.once('dialog', handler);
}

async function gotoHash(page, hash, options = {}) {
  const target = '#' + String(hash || '').replace(/^#/, '');
  if (options.handleUnsaved !== false) {
    await acceptNextDialog(page, options.dialogAction || 'accept');
  }
  await page.evaluate((value) => { window.location.hash = value; }, target);
  await page.waitForTimeout(180);
}

async function currentHash(page) {
  return page.evaluate(() => window.location.hash || '');
}

async function waitForHash(page, expected, timeout = 7000) {
  await page.waitForFunction((hash) => window.location.hash === hash, expected, { timeout });
}

async function waitForAppReady(page, timeout = 45000) {
  await page.waitForFunction(() => {
    const app = document.getElementById('app');
    const interactiveSurface = !!(
      document.querySelector('[data-testid="login-form"]')
      || document.querySelector('.btn-logout')
      || document.querySelector('#app form')
      || document.querySelector('#app .card')
      || document.querySelector('#app .empty-state')
      || document.querySelector('#app button')
    );
    return window.__APP_READY__ === true
      || interactiveSurface
      || !!(app && app.textContent && app.textContent.trim());
  }, { timeout });
}

async function clearAuthClientState(page) {
  await page.evaluate(() => {
    const keys = ['cats_auth', '__AUTH_VERIFY_CACHE__', '__AUTH_BOOTSTRAP_FRESH__'];
    keys.forEach((key) => {
      try { localStorage.removeItem(key); } catch (_) {}
      try { sessionStorage.removeItem(key); } catch (_) {}
    });
  }).catch(() => {});
  await page.context().clearCookies().catch(() => {});
}

async function forceLogoutIfNeeded(page) {
  if (!await page.locator('.btn-logout').count()) return;
  const loggedOutViaAuthModule = await page.evaluate(async () => {
    try {
      const auth = window._authModule;
      if (!auth || typeof auth.logout !== 'function') return false;
      await auth.logout();
      return true;
    } catch (_) {
      return false;
    }
  }).catch(() => false);
  if (!loggedOutViaAuthModule) {
    await acceptNextDialog(page, 'accept');
    await page.locator('.btn-logout').first().click({ timeout: 5000 }).catch(async () => {
      await page.locator('.btn-logout').first().evaluate((element) => {
        if (element && typeof element.click === 'function') element.click();
      });
    });
  }
}

async function waitForReadyWithReload(page, timeout = 30000) {
  try {
    await waitForAppReady(page, timeout);
  } catch (_) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    await waitForAppReady(page, Math.max(timeout, 45000));
  }
}

async function login(page, username, password) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const loginForm = document.querySelector('[data-testid="login-form"]');
    const logoutButton = document.querySelector('.btn-logout');
    if (window.__APP_READY__ === true || !!logoutButton) return true;
    if (!loginForm) return false;
    const style = window.getComputedStyle(loginForm);
    const rect = loginForm.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }, { timeout: 45000 });
  if (await page.locator('.btn-logout').count()) {
    const loggedOutViaAuthModule = await page.evaluate(async () => {
      try {
        const auth = window._authModule;
        if (!auth || typeof auth.logout !== 'function') return false;
        await auth.logout();
        return true;
      } catch (_) {
        return false;
      }
    }).catch(() => false);
    if (!loggedOutViaAuthModule) {
      await acceptNextDialog(page, 'accept');
      await page.click('.btn-logout');
    }
    await clearAuthClientState(page);
    try {
      await page.waitForSelector('[data-testid="login-form"]', { timeout: 5000 });
    } catch (_) {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await clearAuthClientState(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="login-form"]', { timeout: 15000 });
    }
  }
  const loginResult = await page.evaluate(async ({ username, password }) => {
    const auth = window._authModule;
    if (!auth || typeof auth.login !== 'function') throw new Error('auth module missing');
    return auth.login(username, password);
  }, { username, password });
  if (!loginResult) {
    throw new Error('login failed');
  }
  const authMode = await page.evaluate(() => {
    try {
      return String(window.__M365_UNIT_CONTACT_CONFIG__ && window.__M365_UNIT_CONTACT_CONFIG__.authMode || '').trim();
    } catch (_) {
      return '';
    }
  }).catch(() => '');
  if (authMode === 'local-emulator') {
    await page.waitForTimeout(200);
    return;
  }
  const waitForAuthenticatedState = async () => {
    await page.waitForFunction(() => {
      const currentUser = window._authModule && typeof window._authModule.currentUser === 'function'
        ? window._authModule.currentUser()
        : null;
      return !!currentUser || !!document.querySelector('.btn-logout');
    }, { timeout: 15000 });
  };
  try {
    await waitForAuthenticatedState();
  } catch (error) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAuthenticatedState();
  }
  await page.waitForFunction(() => {
    const state = String(window.__REMOTE_BOOTSTRAP_STATE__ || '').trim();
    return state === 'ready' || state === 'idle';
  }, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(150);
}

async function logout(page) {
  if (await page.locator('.btn-logout').count()) {
    await acceptNextDialog(page, 'accept');
    const button = page.locator('.btn-logout').first();
    try {
      await button.click({ timeout: 5000 });
    } catch (error) {
      await button.evaluate((element) => {
        if (element && typeof element.click === 'function') element.click();
      });
    }
    await page.waitForSelector('[data-testid="login-form"]');
  }
}

async function resetApp(page) {
  const freshBaseUrl = (() => {
    try {
      const url = new URL(BASE_URL);
      url.searchParams.set('cb', String(Date.now()));
      url.hash = '';
      return url.toString();
    } catch (_) {
      return BASE_URL + (BASE_URL.includes('?') ? '&' : '?') + 'cb=' + Date.now();
    }
  })();

  const attemptLightReset = async () => {
    await page.goto(freshBaseUrl, { waitUntil: 'domcontentloaded' });
    await forceLogoutIfNeeded(page);
    await clearAuthClientState(page);
    await page.goto(freshBaseUrl, { waitUntil: 'domcontentloaded' });
    await waitForReadyWithReload(page, 20000);
  };

  try {
    await attemptLightReset();
    return;
  } catch (_) {
    // Fall through to full storage reset when lightweight cleanup still leaves the app stuck.
  }

  await page.goto(freshBaseUrl, { waitUntil: 'domcontentloaded' });
  await page.context().clearCookies();
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    const knownNames = ['cats_attachments_v1'];
    if (window.indexedDB) {
      if (typeof window.indexedDB.databases === 'function') {
        const dbs = await window.indexedDB.databases();
        dbs.forEach((entry) => {
          if (entry && entry.name) knownNames.push(entry.name);
        });
      }
      const uniqueNames = Array.from(new Set(knownNames.filter(Boolean)));
      for (const name of uniqueNames) {
        await new Promise((resolve) => {
          const request = window.indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
          request.onblocked = () => resolve();
        });
      }
    }
    window.location.hash = '';
  });
  await page.goto(freshBaseUrl, { waitUntil: 'domcontentloaded' });
  await waitForReadyWithReload(page, 30000);
  if (await page.locator('.btn-logout').count()) {
    await forceLogoutIfNeeded(page);
    await clearAuthClientState(page);
    await page.goto(freshBaseUrl, { waitUntil: 'domcontentloaded' });
    await waitForReadyWithReload(page, 30000);
  }
}

async function readJsonFromStorage(page, key) {
  return page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Number.isFinite(Number(parsed.version)) && Object.prototype.hasOwnProperty.call(parsed, 'payload')) {
      return parsed.payload;
    }
    return parsed;
  }, key);
}

async function chooseUnitForHandlerUsername(page, baseId, handlerSelectId, username) {
  try {
    await page.waitForFunction(({ handlerSelectId }) => {
      const handlerSelect = document.getElementById(handlerSelectId);
      return !!handlerSelect && Array.from(handlerSelect.options).some((entry) => String(entry.value || '').trim());
    }, { handlerSelectId }, { timeout: 15000 });
  } catch (_) {
    // Fall through to the direct selector search below; this still gives the page time
    // to finish background user sync before we start iterating the cascade.
  }
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
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8' });
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
