const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), 'logs');
const OUT_PATH = path.join(LOG_DIR, 'live-security-smoke.json');

function normalizeBase(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function uniqueTargets(targets) {
  const seen = new Set();
  return targets.filter((target) => {
    if (!target.base) return false;
    const key = normalizeBase(target.base);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    target.base = key;
    return true;
  });
}

const TARGETS = uniqueTargets([
  { id: 'campus-local', base: process.env.ISMS_CAMPUS_LOCAL_BASE || 'http://127.0.0.1:8088' },
  { id: 'campus-public', base: process.env.ISMS_CAMPUS_PUBLIC_BASE || 'http://140.112.3.65:8088' },
  { id: 'cloudflare-pages', base: process.env.ISMS_CLOUDFLARE_PAGES_BASE || 'https://isms-campus-portal.pages.dev' }
]);

async function requestText(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  return { response, text };
}

async function requestJson(url, options) {
  const { response, text } = await requestText(url, options);
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  return { response, text, json };
}

async function run() {
  const report = {
    startedAt: new Date().toISOString(),
    targets: TARGETS.map((target) => ({ id: target.id, base: target.base })),
    checks: []
  };

  function pushCheck(target, name, ok, value, critical) {
    report.checks.push({
      target,
      name,
      ok,
      critical: !!critical,
      ...(ok ? { value } : { error: String(value) })
    });
  }

  async function step(target, name, fn, critical) {
    try {
      const value = await fn();
      pushCheck(target.id, name, true, value, critical);
      return value;
    } catch (error) {
      const message = String(error && error.message || error || 'check failed');
      pushCheck(target.id, name, false, message, critical);
      if (critical) throw error;
      return null;
    }
  }

  for (const target of TARGETS) {
    let sessionToken = '';

    await step(target, 'homepage', async () => {
      const { response, text } = await requestText(`${target.base}/`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!/登入系統|ISMS|內部稽核/.test(text)) {
        throw new Error('missing expected login markers');
      }
      return { status: response.status };
    }, true);

    for (const endpoint of ['auth', 'system-users', 'audit-trail']) {
      await step(target, `health:${endpoint}`, async () => {
        const { response, json } = await requestJson(`${target.base}/api/${endpoint}/health`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (!json || json.ok === false || json.ready === false) {
          throw new Error(json && (json.message || json.error) || `${endpoint} health not ready`);
        }
        return { status: response.status, ready: json.ready !== false };
      }, true);
    }

    await step(target, 'auth.login.success', async () => {
      const { response, json } = await requestJson(`${target.base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'auth.login',
          payload: { username: 'admin', password: 'admin123' }
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!json || !json.ok || !json.item || json.item.username !== 'admin') {
        throw new Error('invalid auth.login response');
      }
      if (json.item.password) throw new Error('password leaked in auth.login response');
      sessionToken = String(json && json.session && json.session.token || '').trim();
      if (!sessionToken) throw new Error('missing session token');
      return { username: json.item.username, role: json.item.role };
    }, true);

    await step(target, 'auth.login.failure', async () => {
      const { response } = await requestJson(`${target.base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'auth.login',
          payload: { username: 'admin', password: 'wrong-password' }
        })
      });
      if (response.status !== 401) throw new Error(`expected 401, got ${response.status}`);
      return { status: response.status };
    }, true);

    await step(target, 'system-users.anonymous.denied', async () => {
      const { response } = await requestJson(`${target.base}/api/system-users`);
      if (response.status !== 401) throw new Error(`expected 401, got ${response.status}`);
      return { status: response.status };
    }, true);

    await step(target, 'audit-trail.anonymous.denied', async () => {
      const { response } = await requestJson(`${target.base}/api/audit-trail?limit=5`);
      if (response.status !== 401) throw new Error(`expected 401, got ${response.status}`);
      return { status: response.status };
    }, true);

    await step(target, 'system-users.authorized', async () => {
      const { response, json } = await requestJson(`${target.base}/api/system-users`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const items = Array.isArray(json && json.items) ? json.items : [];
      if (!items.length) throw new Error('system-users returned zero rows');
      if (items.some((item) => Object.prototype.hasOwnProperty.call(item || {}, 'password'))) {
        throw new Error('password leaked in system-users list');
      }
      return { count: items.length };
    }, true);

    await step(target, 'audit-trail.authorized', async () => {
      const { response, json } = await requestJson(`${target.base}/api/audit-trail?limit=10`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!json || !Array.isArray(json.items) || !json.summary) {
        throw new Error('invalid audit-trail response');
      }
      return {
        count: json.items.length,
        latestOccurredAt: json.summary.latestOccurredAt || ''
      };
    }, true);

    await step(target, 'auth.verify.authorized', async () => {
      const { response, json } = await requestJson(`${target.base}/api/auth/verify`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!json || !json.ok || !json.item || json.item.username !== 'admin') {
        throw new Error('invalid auth.verify response');
      }
      return { username: json.item.username };
    }, true);

    await step(target, 'auth.logout', async () => {
      const { response, json } = await requestJson(`${target.base}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'auth.logout', payload: {} })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!json || json.ok !== true || json.loggedOut !== true) {
        throw new Error('invalid auth.logout response');
      }
      return { loggedOut: true };
    }, true);

    await step(target, 'auth.verify.old-session.denied', async () => {
      const { response } = await requestJson(`${target.base}/api/auth/verify`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`
        }
      });
      if (response.status !== 401) throw new Error(`expected 401, got ${response.status}`);
      return { status: response.status };
    }, true);
  }

  report.finishedAt = new Date().toISOString();
  report.summary = {
    passed: report.checks.filter((entry) => entry.ok).length,
    failed: report.checks.filter((entry) => !entry.ok).length
  };
  report.ok = report.summary.failed === 0;

  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

run().catch((error) => {
  const report = {
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    ok: false,
    error: String(error && error.stack || error)
  };
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.error(report.error);
  process.exit(1);
});
