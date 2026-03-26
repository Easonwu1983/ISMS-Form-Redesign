const path = require('path');
const {
  attachDiagnostics,
  chooseUnitForHandlerUsername,
  createArtifactRun,
  createResultEnvelope,
  currentHash,
  finalizeResults,
  gotoHash,
  launchBrowser,
  login,
  logout,
  resetApp,
  runStep,
  waitForHash,
  writeJson
} = require('./_role-test-utils.cjs');

const OUT_DIR = createArtifactRun('role-flow-regression').outDir;
const RESULT_PATH = path.join(OUT_DIR, 'flow-probe.json');

async function setChoice(page, testId, checked = true) {
  await page.evaluate(({ testId, checked }) => {
    const input = document.querySelector(`[data-testid="${testId}"]`);
    if (!input) throw new Error(`missing choice ${testId}`);
    input.checked = checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, { testId, checked });
}

async function waitForSessionToken(page, timeout = 30000) {
  await page.waitForFunction(() => {
    const currentUser = window._authModule && typeof window._authModule.currentUser === 'function'
      ? window._authModule.currentUser()
      : null;
    return !!(currentUser && String(currentUser.sessionToken || '').trim());
  }, undefined, { timeout });
}

async function loginForApiToken(page, username, password) {
  const response = await page.evaluate(async ({ username, password }) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ISMS-Contract-Version': '2026-03-12'
      },
      body: JSON.stringify({
        action: 'auth.login',
        payload: { username, password },
        clientContext: {
          contractVersion: '2026-03-12',
          source: 'role-flow-probe',
          frontendOrigin: window.location.origin,
          frontendHash: window.location.hash || '',
          sentAt: new Date().toISOString()
        }
      })
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch (_) {
      parsed = { ok: false, message: text };
    }
    return {
      ok: res.ok && parsed && parsed.ok !== false,
      status: res.status,
      parsed,
      sessionToken: parsed && parsed.session ? String(parsed.session.token || '').trim() : ''
    };
  }, { username, password });
  if (!response.ok || !response.sessionToken) {
    throw new Error(`api login failed: ${response.status} ${JSON.stringify(response.parsed || {})}`);
  }
  return response.sessionToken;
}

function stripKnownProbeNoise(results) {
  const noisePattern = /app\.js\?v=.*:3335:17/;
  if (Array.isArray(results.console)) {
    results.console = results.console.filter((entry) => !noisePattern.test(String(entry && entry.text || '')));
  }
  if (Array.isArray(results.pageErrors)) {
    results.pageErrors = results.pageErrors.filter((entry) => !noisePattern.test(String(entry || '')));
  }
}

async function upsertTempUnitManager(page, suffix, avoidUnit) {
  const username = `probe-unit-manager-${suffix}`;
  const password = `ProbePass${suffix}A1`;
  const candidateUnits = ['主計室', '秘書室', '圖書館', '教務處', '總務處', '學務處', '人事室', '研究發展處'];
  const unit = candidateUnits.find((entry) => entry && entry !== avoidUnit) || `測試單位-${suffix}`;
  const response = await page.evaluate(async ({ username, password, unit, suffix }) => {
    const user = window._authModule && typeof window._authModule.currentUser === 'function'
      ? window._authModule.currentUser()
      : null;
    const headers = {
      'Content-Type': 'application/json',
      'X-ISMS-Contract-Version': '2026-03-12'
    };
    if (user && user.sessionToken) headers.Authorization = 'Bearer ' + String(user.sessionToken);
    if (user && user.activeUnit) headers['X-ISMS-Active-Unit'] = encodeURIComponent(String(user.activeUnit));
    const body = {
      action: 'system-user.upsert',
      payload: {
        username,
        password,
        name: `Flow Probe Manager ${suffix}`,
        email: `${username}@example.com`,
        role: '單位管理員',
        securityRoles: ['一級單位資安窗口'],
        unit,
        units: [unit],
        activeUnit: unit,
        forcePasswordChange: false
      },
      clientContext: {
        contractVersion: '2026-03-12',
        source: 'role-flow-probe',
        frontendOrigin: window.location.origin,
        frontendHash: window.location.hash || '',
        sentAt: new Date().toISOString()
      }
    };
    const res = await fetch('/api/system-users/upsert', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body)
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch (_) {
      parsed = { ok: false, message: text };
    }
    return {
      ok: res.ok && parsed && parsed.ok !== false,
      status: res.status,
      parsed
    };
  }, { username, password, unit, suffix });
  if (!response.ok) {
    throw new Error(`failed to create temp unit manager: ${response.status} ${JSON.stringify(response.parsed || {})}`);
  }
  return { username, password, unit };
}

async function deleteTempUnitManager(page, username) {
  if (!username) return;
  await page.evaluate(async ({ username }) => {
    const user = window._authModule && typeof window._authModule.currentUser === 'function'
      ? window._authModule.currentUser()
      : null;
    const headers = {
      'Content-Type': 'application/json',
      'X-ISMS-Contract-Version': '2026-03-12'
    };
    if (user && user.sessionToken) headers.Authorization = 'Bearer ' + String(user.sessionToken);
    if (user && user.activeUnit) headers['X-ISMS-Active-Unit'] = encodeURIComponent(String(user.activeUnit));
    const body = {
      action: 'system-user.delete',
      payload: { username },
      clientContext: {
        contractVersion: '2026-03-12',
        source: 'role-flow-probe',
        frontendOrigin: window.location.origin,
        frontendHash: window.location.hash || '',
        sentAt: new Date().toISOString()
      }
    };
    await fetch('/api/system-users/' + encodeURIComponent(username) + '/delete', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body)
    });
  }, { username }).catch(() => {});
}

async function respondCaseViaApi(page, caseId, payload, sessionToken) {
  return page.evaluate(async ({ caseId, payload, sessionToken }) => {
    const headers = {
      'Content-Type': 'application/json',
      'X-ISMS-Contract-Version': '2026-03-12'
    };
    if (sessionToken) headers.Authorization = 'Bearer ' + String(sessionToken);
    const body = {
      action: 'corrective-action.respond',
      payload,
      clientContext: {
        contractVersion: '2026-03-12',
        source: 'role-flow-probe',
        frontendOrigin: window.location.origin,
        frontendHash: window.location.hash || '',
        sentAt: new Date().toISOString()
      }
    };
    const res = await fetch('/api/corrective-actions/' + encodeURIComponent(caseId) + '/respond', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body)
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch (_) {
      parsed = { ok: false, message: text };
    }
    return {
      ok: res.ok && parsed && parsed.ok !== false,
      status: res.status,
      parsed
    };
  }, { caseId, payload, sessionToken });
}

(async () => {
  const probeSuffix = `${Date.now()}`;
  const results = createResultEnvelope({
    steps: [],
    context: {
      admin: { username: 'easonwu', password: '2wsx#EDC' },
      unitManager: { username: 'unit1', password: 'unit123' },
      otherUnitManager: null,
      probeSuffix
    }
  });
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  attachDiagnostics(page, results);
  let carId = null;
  let tempManager = null;
  try {
    await resetApp(page);

    await runStep(results, 'PROBE-ADM-01', '最高管理者', '建立矯正單', async () => {
      await login(page, results.context.admin.username, results.context.admin.password);
      try {
        await waitForSessionToken(page);
        await gotoHash(page, 'create');
        await page.waitForSelector('[data-testid="create-form"]');
        await chooseUnitForHandlerUsername(page, 'f-hunit', 'f-hname', 'unit1');
        await page.evaluate(() => {
          const select = document.querySelector('[data-testid="create-handler-name"]');
          const target = Array.from(select.options).find((option) => option.dataset.username === 'unit1');
          if (!target) throw new Error('missing handler option unit1');
          select.value = target.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        const handlerUnit = await page.$eval('[data-testid="f-hunit"]', (el) => String(el.value || '').trim()).catch(() => '');
        await setChoice(page, 'defType-input-0');
        await setChoice(page, 'source-input-0');
        await setChoice(page, 'category-input-0', true);
        await page.fill('[data-testid="create-id"]', `CAR-PROBE-${results.context.probeSuffix}`);
        await page.fill('[data-testid="create-problem"]', `Flow probe problem ${results.context.probeSuffix}`);
        await page.fill('[data-testid="create-occurrence"]', `Flow probe occurrence ${results.context.probeSuffix}`);
        await page.fill('[data-testid="create-due"]', new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0]);
        await Promise.all([
          page.waitForFunction(() => window.location.hash.startsWith('#detail/'), { timeout: 8000 }),
          page.click('[data-testid="create-submit"]')
        ]);
        carId = decodeURIComponent((await currentHash(page)).replace(/^#detail\//, ''));
        if (!carId) throw new Error('missing created car id');
        if (!/^CAR-PROBE-\d+$/.test(carId)) throw new Error('unexpected generated car id ' + carId);
        tempManager = await upsertTempUnitManager(page, results.context.probeSuffix, handlerUnit);
        results.context.otherUnitManager = tempManager;
        return carId;
      } finally {
        await logout(page).catch(() => {});
      }
    });

    await runStep(results, 'PROBE-RP-01', '單位窗口', '回填矯正措施', async () => {
      if (!carId) throw new Error('missing car id from create step');
      try {
        await resetApp(page);
        const sessionToken = await loginForApiToken(page, results.context.unitManager.username, results.context.unitManager.password);
        const response = await respondCaseViaApi(page, carId, {
          correctiveAction: 'Flow probe corrective action',
          correctiveDueDate: new Date(Date.now() + 86400000 * 10).toISOString().split('T')[0],
          rootCause: 'Flow probe root cause',
          rootElimination: 'Flow probe elimination',
          rootElimDueDate: null,
          riskDesc: '',
          riskAcceptor: '',
          riskAcceptDate: null,
          riskAssessDate: null,
          evidence: [],
          actorName: '王經理',
          actorUsername: results.context.unitManager.username
        }, sessionToken);
        if (!response.ok) {
          throw new Error(`respond api failed: ${response.status} ${JSON.stringify(response.parsed || {})}`);
        }
        return carId;
      } finally {
        await logout(page).catch(() => {});
      }
    });

    await runStep(results, 'PROBE-RP-02', '單位管理員', '不可檢視跨單位案件', async () => {
      if (!carId) throw new Error('missing car id from previous steps');
      if (!results.context.otherUnitManager) throw new Error('missing temp unit manager from create step');
      await login(page, results.context.otherUnitManager.username, results.context.otherUnitManager.password);
      try {
        await waitForSessionToken(page);
        await gotoHash(page, 'detail/' + carId);
        const openedHash = await currentHash(page);
        if (openedHash === '#detail/' + carId) throw new Error('cross-unit manager unexpectedly opened same-unit case');
        await gotoHash(page, 'security-window');
        if ((await currentHash(page)) === '#security-window') throw new Error('unit manager unexpectedly opened security-window');
        return carId;
      } finally {
        await logout(page).catch(() => {});
      }
    });

    await runStep(results, 'PROBE-ADM-02', '最高管理者', '可檢視案件與管理頁', async () => {
      if (!carId) throw new Error('missing car id from previous steps');
      await login(page, results.context.admin.username, results.context.admin.password);
      try {
        await waitForSessionToken(page);
        const caseVisible = await page.evaluate(async (targetId) => {
          const user = window._authModule && typeof window._authModule.currentUser === 'function'
            ? window._authModule.currentUser()
            : null;
          const headers = {};
          if (user && user.sessionToken) headers.Authorization = 'Bearer ' + String(user.sessionToken);
          const res = await fetch('/api/corrective-actions', { headers });
          const body = await res.json().catch(() => ({}));
          const items = []
            .concat(Array.isArray(body) ? body : [])
            .concat(Array.isArray(body?.items) ? body.items : [])
            .concat(Array.isArray(body?.value) ? body.value : []);
          return items.some((item) => String(item && item.id || '').trim() === targetId);
        }, carId);
        if (!caseVisible) throw new Error('admin cannot access corrective action via api: ' + carId);
        await gotoHash(page, 'users');
        if ((await currentHash(page)) !== '#users') throw new Error('admin cannot open users route');
        await gotoHash(page, 'security-window');
        if ((await currentHash(page)) !== '#security-window') throw new Error('admin cannot open security-window route');
        await gotoHash(page, 'training-roster');
        if ((await currentHash(page)) !== '#training-roster') throw new Error('admin cannot open training-roster route');
        return carId;
      } finally {
        await logout(page).catch(() => {});
      }
    });
  } finally {
    if (tempManager && tempManager.username) {
      await login(page, results.context.admin.username, results.context.admin.password).catch(() => {});
      await deleteTempUnitManager(page, tempManager.username);
      await logout(page).catch(() => {});
    }
    await browser.close();
    stripKnownProbeNoise(results);
    const finalized = finalizeResults(results);
    writeJson(RESULT_PATH, finalized);
    if (finalized.summary.failed || finalized.summary.pageErrors) {
      process.exitCode = 1;
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
