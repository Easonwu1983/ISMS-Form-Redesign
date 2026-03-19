const path = require('path');
const {
  BASE_URL,
  attachDiagnostics,
  createArtifactRun,
  createResultEnvelope,
  finalizeResults,
  launchBrowser,
  login,
  runStep,
  writeJson
} = require('./_role-test-utils.cjs');

const OUT = createArtifactRun('audit-followup-smoke');
const RESULT_PATH = path.join(OUT.outDir, 'audit-followup-smoke.json');
const RESULTS = createResultEnvelope({
  steps: [],
  pageErrors: [],
  console: [],
  artifacts: []
});

function apiUrl(endpoint) {
  return new URL(endpoint, BASE_URL).toString();
}

async function requestJson(endpoint, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const response = await fetch(apiUrl(endpoint), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (_) {
      json = { raw: text };
    }
  }
  return { response, json, text };
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function loginToken(username, password) {
  const { response, json } = await requestJson('/api/auth/login', {
    method: 'POST',
    body: { action: 'auth.login', payload: { username, password } }
  });
  if (!response.ok) {
    throw new Error(`login failed for ${username}: HTTP ${response.status}`);
  }
  const token = String(json && json.session && json.session.token || '').trim();
  if (!token) throw new Error(`missing session token for ${username}`);
  return { token, user: json && json.item ? json.item : null };
}

async function main() {
  await runStep(RESULTS, 'delete-guard', 'api', 'system user delete is blocked when corrective actions are open', async () => {
    const { token } = await loginToken('admin', 'admin123');

    const usersResp = await requestJson('/api/system-users', { headers: authHeaders(token) });
    if (!usersResp.response.ok) throw new Error(`system users list failed: HTTP ${usersResp.response.status}`);
    const users = Array.isArray(usersResp.json && usersResp.json.items) ? usersResp.json.items : [];
    const openTargets = ['user1', 'unit1'];
    const targetUser = openTargets.find((username) => users.some((user) => String(user && user.username || '').trim() === username));
    if (!targetUser) throw new Error('no suitable smoke account found for delete guard verification');
    const snapshot = users.find((user) => String(user && user.username || '').trim() === targetUser);

    const casesResp = await requestJson('/api/corrective-actions', { headers: authHeaders(token) });
    if (!casesResp.response.ok) throw new Error(`corrective-actions list failed: HTTP ${casesResp.response.status}`);
    const cases = Array.isArray(casesResp.json && casesResp.json.items) ? casesResp.json.items : [];
    const openCases = cases.filter((item) => String(item && item.status || '').trim() !== '結案');
    const related = openCases.filter((item) => {
      const handler = String(item && item.handlerUsername || '').trim().toLowerCase();
      const reviewer = String(item && item.reviewerUsername || item.reviewer || '').trim().toLowerCase();
      if (handler === targetUser) return true;
      if (reviewer === targetUser) return true;
      const trackings = Array.isArray(item && item.trackings) ? item.trackings : [];
      return trackings.some((tracking) => {
        const tracker = String(tracking && tracking.tracker || '').trim().toLowerCase();
        const trackingReviewer = String(tracking && tracking.reviewer || '').trim().toLowerCase();
        return tracker === targetUser || trackingReviewer === targetUser;
      });
    });
    if (!related.length) {
      throw new Error(`no open corrective-action references found for ${targetUser}; refuse to run destructive delete test`);
    }

    const deleteResp = await requestJson(`/api/system-users/${encodeURIComponent(targetUser)}/delete`, {
      method: 'POST',
      headers: authHeaders(token),
      body: {
        action: 'system-user.delete',
        payload: { username: targetUser }
      }
    });

    if (deleteResp.response.status !== 409) {
      if (deleteResp.response.ok) {
        const restorePassword = targetUser === 'unit1' ? 'unit123' : 'user123';
        await requestJson('/api/system-users/upsert', {
          method: 'POST',
          headers: authHeaders(token),
          body: {
            action: 'system-user.upsert',
            payload: {
              username: snapshot.username,
              name: snapshot.name,
              email: snapshot.email,
              role: snapshot.role,
              unit: snapshot.unit,
              activeUnit: snapshot.activeUnit || snapshot.unit,
              units: Array.isArray(snapshot.units) ? snapshot.units : [snapshot.unit].filter(Boolean),
              password: restorePassword
            }
          }
        });
      }
      throw new Error(`expected 409 when deleting ${targetUser} with open corrective actions, got HTTP ${deleteResp.response.status}`);
    }

    const message = String(deleteResp.json && (deleteResp.json.message || deleteResp.json.error || deleteResp.json.detail) || '').trim();
    if (!message) {
      throw new Error('delete guard returned 409 but no error message was provided');
    }
    return { username: targetUser, blockingCases: related.length, message };
  });

  await runStep(RESULTS, 'handler-self-exclusion', 'ui', 'case handler selector excludes current user', async () => {
    const browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
    attachDiagnostics(page, RESULTS);
    try {
      await login(page, 'admin', 'admin123');
      await page.goto(`${BASE_URL}#create`, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForSelector('#f-hunit', { state: 'attached', timeout: 15000 });
      await page.waitForSelector('#f-hname', { state: 'attached', timeout: 15000 });
      await page.waitForFunction(() => window._authModule && typeof window._authModule.currentUser === 'function' && !!window._authModule.currentUser(), { timeout: 15000 });
      const currentUser = await page.evaluate(() => window._authModule.currentUser());
      const currentUsername = String(currentUser && currentUser.username || '').trim();
      let currentUnit = String(currentUser && (currentUser.unit || currentUser.activeUnit || '') || '').trim();
      if (!currentUsername) throw new Error('current user username unavailable');
      if (!currentUnit) {
        currentUnit = await page.$$eval('#f-hunit option', (entries) => {
          const values = entries.map((entry) => String(entry.value || '').trim()).filter(Boolean);
          return values[0] || '';
        });
      }
      if (!currentUnit) throw new Error('current user unit unavailable');

      await page.evaluate((unit) => {
        const unitModule = window._unitModule;
        if (!unitModule || typeof unitModule.splitUnitValue !== 'function' || typeof unitModule.categorizeTopLevelUnit !== 'function') {
          throw new Error('unit module helpers unavailable');
        }
        const parsed = unitModule.splitUnitValue(unit);
        const category = parsed.parent ? unitModule.categorizeTopLevelUnit(parsed.parent) : '';
        const categoryEl = document.getElementById('f-hunit-category');
        const parentEl = document.getElementById('f-hunit-parent');
        const childEl = document.getElementById('f-hunit-child');
        if (!categoryEl || !parentEl || !childEl) throw new Error('missing handler unit cascade controls');
        if (category) {
          categoryEl.value = category;
          categoryEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (parsed.parent) {
          parentEl.value = parsed.parent;
          parentEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (parsed.child) {
          childEl.value = parsed.child;
          childEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, currentUnit);

      await page.waitForTimeout(1000);

      const options = await page.$$eval('#f-hname option', (entries) => entries.map((entry) => ({
        value: String(entry.value || '').trim(),
        username: String(entry.dataset.username || '').trim(),
        text: String(entry.textContent || '').trim()
      })));

      if (!options.length) throw new Error('handler option list is empty');
      if (options.length <= 1) {
        return { currentUsername, currentUnit, optionCount: options.length, skipped: true, reason: 'no alternate handlers available' };
      }
      if (!options.some((option) => option.username && option.username !== currentUsername)) {
        throw new Error('handler select does not include any alternate handler options');
      }
      if (options.some((option) => option.username === currentUsername)) {
        throw new Error(`current user ${currentUsername} still appears in handler selector`);
      }
      return { currentUsername, currentUnit, optionCount: options.length };
    } finally {
      await page.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  });

  finalizeResults(RESULTS);
  writeJson(RESULT_PATH, RESULTS);
  console.log(JSON.stringify(RESULTS, null, 2));
  if (RESULTS.steps.some((step) => step.status !== 'passed')) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  RESULTS.finishedAt = new Date().toISOString();
  RESULTS.steps.push({
    id: 'fatal',
    role: 'system',
    title: 'audit follow-up smoke fatal error',
    status: 'failed',
    detail: String(error && error.stack ? error.stack : error)
  });
  writeJson(RESULT_PATH, RESULTS);
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
