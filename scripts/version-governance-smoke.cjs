const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('./_playwright.cjs');
const {
  attachDiagnostics,
  createArtifactRun,
  createResultEnvelope,
  finalizeResults,
  runStep,
  writeJson
} = require('./_role-test-utils.cjs');

const OUT_DIR = createArtifactRun('version-governance-smoke').outDir;
const RESULT_PATH = path.join(OUT_DIR, 'version-governance-smoke.json');
const LOCAL_MANIFEST_PATH = path.join(process.cwd(), 'dist', 'cloudflare-pages', 'deploy-manifest.json');
const BROWSER_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];
const EXPLICIT_VERSION_BASES = process.env.ISMS_VERSION_BASES
  ? String(process.env.ISMS_VERSION_BASES).split(',').map((value) => String(value || '').trim()).filter(Boolean)
  : [];
const BASE_URLS = Array.from(new Set((EXPLICIT_VERSION_BASES.length
  ? EXPLICIT_VERSION_BASES
  : [
      String(process.env.ISMS_LIVE_BASE || 'http://127.0.0.1:8088/').trim(),
      String(process.env.ISMS_CLOUDFLARE_PAGES_BASE || 'https://isms-campus-portal.pages.dev/').trim()
    ]).filter(Boolean))).map((value) => value.replace(/\/+$/, ''));

function runGit(args) {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_) {
    return '';
  }
}

const GIT_HEAD = runGit(['rev-parse', 'HEAD']);
const GIT_SHORT = runGit(['rev-parse', '--short=12', 'HEAD']);

function pickExecutablePath() {
  for (const candidate of BROWSER_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function cleanVersion(value) {
  return String(value || '').trim().replace(/^v/i, '');
}

function readJsonFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return text ? JSON.parse(text) : null;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTextWithRetry(url, attempts = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'cache-control': 'no-cache' }
      });
      const text = await response.text();
      if (!response.ok && response.status >= 500 && attempt < attempts - 1) {
        await wait(750 * (attempt + 1));
        continue;
      }
      return { response, text };
    } catch (error) {
      lastError = error;
      if (attempt >= attempts - 1) break;
      await wait(750 * (attempt + 1));
    }
  }
  throw lastError || new Error('fetch failed');
}

async function loadManifestViaBrowser(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();
  try {
    const response = await page.goto(`${baseUrl}/deploy-manifest.json`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });
    const text = await page.evaluate(() => document.body && (document.body.innerText || document.body.textContent) || '');
    return {
      response,
      text
    };
  } finally {
    await context.close().catch(() => {});
  }
}

function assertVersionConsistency(label, manifest, expectedHead) {
  const buildInfo = manifest && manifest.buildInfo && typeof manifest.buildInfo === 'object' ? manifest.buildInfo : {};
  const versionKey = cleanVersion(manifest && manifest.versionKey || buildInfo.versionKey || buildInfo.shortCommit || buildInfo.commit);
  const shortCommit = cleanVersion(buildInfo.shortCommit || buildInfo.versionKey || buildInfo.commit);
  const commit = cleanVersion(buildInfo.commit || '');
  if (!versionKey) throw new Error(`${label} versionKey missing`);
  if (shortCommit && versionKey !== shortCommit) {
    throw new Error(`${label} versionKey ${versionKey} !== shortCommit ${shortCommit}`);
  }
  if (expectedHead && commit && commit !== expectedHead) {
    throw new Error(`${label} commit ${commit} !== git HEAD ${expectedHead}`);
  }
  if (expectedHead && shortCommit && cleanVersion(expectedHead).slice(0, shortCommit.length) !== shortCommit) {
    throw new Error(`${label} shortCommit ${shortCommit} does not match HEAD ${expectedHead}`);
  }
  return { versionKey, buildInfo };
}

async function waitForAppReady(page) {
  await page.waitForFunction(() => window.__APP_READY__ === true, { timeout: 45000 });
}

async function loadManifest(baseUrl, browser) {
  const manifestUrl = `${baseUrl}/deploy-manifest.json?ts=${Date.now()}`;
  let response = null;
  let text = '';
  try {
    ({ response, text } = await fetchTextWithRetry(manifestUrl));
  } catch (error) {
    if (!browser) {
      throw error;
    }
    console.warn(`[version-governance] node fetch failed for ${manifestUrl}; retrying via browser: ${error && error.message ? error.message : error}`);
    ({ response, text } = await loadManifestViaBrowser(browser, baseUrl));
  }
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  if (!response || !response.ok) {
    throw new Error(`manifest HTTP ${response ? response.status : 'unknown'}`);
  }
  const buildInfo = json && json.buildInfo && typeof json.buildInfo === 'object' ? json.buildInfo : {};
  const versionKey = cleanVersion(json && json.versionKey || buildInfo.versionKey || buildInfo.shortCommit || buildInfo.commit);
  if (!versionKey) throw new Error('deploy manifest versionKey missing');
  const buildVersion = cleanVersion(buildInfo.shortCommit || buildInfo.versionKey || buildInfo.commit);
  if (buildVersion && versionKey !== buildVersion) {
    throw new Error(`deploy manifest versionKey ${versionKey} !== buildInfo ${buildVersion}`);
  }
  if (GIT_HEAD && buildInfo.commit && cleanVersion(buildInfo.commit) !== GIT_HEAD) {
    throw new Error(`remote manifest commit ${cleanVersion(buildInfo.commit)} !== git HEAD ${GIT_HEAD}`);
  }
  if (GIT_SHORT && buildInfo.shortCommit && cleanVersion(buildInfo.shortCommit) !== GIT_SHORT) {
    throw new Error(`remote manifest shortCommit ${cleanVersion(buildInfo.shortCommit)} !== git short ${GIT_SHORT}`);
  }
  return { json, buildInfo, versionKey };
}

async function loginAt(page, baseUrl, username, password) {
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await waitForAppReady(page);
  await page.waitForSelector('[data-testid="login-form"]', { timeout: 30000 });
  if (await page.locator('.btn-logout').count()) {
    await page.click('.btn-logout');
    await page.waitForSelector('[data-testid="login-form"]', { timeout: 30000 });
  }
  await page.fill('[data-testid="login-user"]', username);
  await page.fill('[data-testid="login-pass"]', password);
  await Promise.all([
    page.waitForFunction(() => !!window._authModule?.currentUser?.()?.sessionToken || !!document.querySelector('.btn-logout'), { timeout: 30000 }),
    page.locator('[data-testid="login-form"]').evaluate((form) => form.requestSubmit())
  ]);
  await page.waitForFunction(() => {
    const currentUser = window._authModule && typeof window._authModule.currentUser === 'function'
      ? window._authModule.currentUser()
      : null;
    return !!(currentUser && String(currentUser.sessionToken || '').trim()) || !!document.querySelector('.btn-logout');
  }, { timeout: 30000 });
}

async function verifyBase(browser, baseUrl, label, results) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();
  attachDiagnostics(page, results);
  let manifest = null;

  try {
    manifest = await loadManifest(baseUrl, browser);

    await runStep(results, `${label}:landing`, label, 'landing version chip matches deploy manifest', async () => {
      await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await waitForAppReady(page);
      await page.waitForSelector('[data-testid="app-version-chip"]', { timeout: 30000 });
      const data = await page.evaluate(() => ({
        buildInfo: window.__APP_BUILD_INFO__ || null
      }));
      const chipText = cleanVersion(await page.locator('[data-testid="app-version-chip"]').first().textContent());
      const runtimeVersion = cleanVersion(data.buildInfo && data.buildInfo.versionKey);
      if (!chipText) throw new Error('landing version chip missing');
      if (chipText !== manifest.versionKey) {
        throw new Error(`landing chip ${chipText} !== manifest ${manifest.versionKey}`);
      }
      if (runtimeVersion !== manifest.versionKey) {
        throw new Error(`runtime buildInfo ${runtimeVersion} !== manifest ${manifest.versionKey}`);
      }
      return {
        versionKey: manifest.versionKey,
        commit: manifest.buildInfo.commit || '',
        shortCommit: manifest.buildInfo.shortCommit || ''
      };
    });

    await runStep(results, `${label}:sidebar`, label, 'sidebar version chip matches deploy manifest after login', async () => {
      await loginAt(page, baseUrl, 'easonwu', '2wsx#EDC');
      await page.waitForSelector('.sidebar-footer [data-testid="app-version-chip"]', { timeout: 30000 });
      const data = await page.evaluate(() => ({
        buildInfo: window.__APP_BUILD_INFO__ || null
      }));
      const chipText = cleanVersion(await page.locator('.sidebar-footer [data-testid="app-version-chip"]').first().textContent());
      const runtimeVersion = cleanVersion(data.buildInfo && data.buildInfo.versionKey);
      if (!chipText) throw new Error('sidebar version chip missing');
      if (chipText !== manifest.versionKey) {
        throw new Error(`sidebar chip ${chipText} !== manifest ${manifest.versionKey}`);
      }
      if (runtimeVersion !== manifest.versionKey) {
        throw new Error(`runtime buildInfo ${runtimeVersion} !== manifest ${manifest.versionKey}`);
      }
      return {
        versionKey: manifest.versionKey,
        commit: manifest.buildInfo.commit || '',
        shortCommit: manifest.buildInfo.shortCommit || ''
      };
    });
  } finally {
    await context.close().catch(() => {});
  }
  return { baseUrl, label, manifest };
}

(async () => {
  const results = createResultEnvelope({
    steps: [],
    targets: BASE_URLS
  });
  const browser = await chromium.launch(pickExecutablePath() ? { headless: true, executablePath: pickExecutablePath() } : { headless: true });

  try {
    const localManifest = fs.existsSync(LOCAL_MANIFEST_PATH) ? readJsonFile(LOCAL_MANIFEST_PATH) : null;
    if (localManifest) {
      await runStep(results, 'local-manifest', 'Local build', 'local deploy manifest matches git HEAD', async () => {
        const { versionKey, buildInfo } = assertVersionConsistency('local manifest', localManifest, GIT_HEAD);
        return {
          versionKey,
          commit: cleanVersion(buildInfo.commit || ''),
          shortCommit: cleanVersion(buildInfo.shortCommit || '')
        };
      });
    }

    const manifests = [];
    for (const [index, baseUrl] of BASE_URLS.entries()) {
      manifests.push(await verifyBase(browser, baseUrl, `target-${index + 1}`, results));
    }

    const versionKeys = Array.from(new Set(manifests.map((entry) => entry.manifest && entry.manifest.versionKey ? cleanVersion(entry.manifest.versionKey) : '').filter(Boolean)));
    const commits = Array.from(new Set(manifests.map((entry) => cleanVersion(entry.manifest && entry.manifest.buildInfo && entry.manifest.buildInfo.commit || '')).filter(Boolean)));
    if (versionKeys.length > 1) {
      throw new Error(`version mismatch across targets: ${versionKeys.join(', ')}`);
    }
    if (commits.length > 1) {
      throw new Error(`commit mismatch across targets: ${commits.join(', ')}`);
    }
    results.ok = true;
  } catch (error) {
    results.ok = false;
    results.error = String(error && error.stack ? error.stack : error);
    throw error;
  } finally {
    results.finishedAt = new Date().toISOString();
    writeJson(RESULT_PATH, finalizeResults(results));
    await browser.close().catch(() => {});
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
