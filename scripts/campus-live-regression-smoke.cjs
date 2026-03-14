const fs = require('fs');
const path = require('path');

const DEFAULT_BASE = process.env.ISMS_LIVE_BASE || 'http://127.0.0.1:8088';
const OUT_PATH = path.join(process.cwd(), 'logs', 'campus-live-regression-smoke.json');

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
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
    baseUrl: DEFAULT_BASE,
    checks: []
  };
  let adminSessionToken = '';

  async function step(name, fn, options) {
    const opts = options || {};
    try {
      const value = await fn();
      report.checks.push({ name, ok: true, critical: !!opts.critical, value });
    } catch (error) {
      report.checks.push({ name, ok: false, critical: !!opts.critical, error: String(error && error.message || error || 'check failed') });
      if (opts.critical) throw error;
    }
  }

  await step('homepage', async () => {
    const response = await fetch(`${DEFAULT_BASE}/`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { status: response.status };
  }, { critical: true });

  await step('m365 override profile', async () => {
    const response = await fetch(`${DEFAULT_BASE}/m365-config.override.js`);
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!text.includes("activeProfile: 'a3CampusBackend'")) throw new Error('activeProfile is not a3CampusBackend');
    if (!text.includes("systemUsersEndpoint: '/api/system-users'")) throw new Error('systemUsersEndpoint override missing');
    return { status: response.status };
  }, { critical: true });

  for (const endpoint of ['unit-contact', 'corrective-actions', 'checklists', 'training', 'system-users', 'auth']) {
    await step(`health:${endpoint}`, async () => {
      const { response, json } = await requestJson(`${DEFAULT_BASE}/api/${endpoint}/health`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!json || json.ok === false || json.ready === false) throw new Error(json && (json.message || json.error) || 'health not ready');
      return { status: response.status, ready: json.ready !== false };
    }, { critical: true });
  }

  await step('health:attachments', async () => {
    const { response, json } = await requestJson(`${DEFAULT_BASE}/api/attachments/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { status: response.status, ready: json && json.ready !== false, message: json && json.message || '' };
  });

  await step('auth login success', async () => {
    const { response, json } = await requestJson(`${DEFAULT_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'auth.login', payload: { username: 'admin', password: 'admin123' } })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!json || !json.ok || !json.item || json.item.username !== 'admin') throw new Error('login response invalid');
    if (json.item.password) throw new Error('password leaked in auth response');
    adminSessionToken = String(json && json.session && json.session.token || '').trim();
    if (!adminSessionToken) throw new Error('missing session token');
    return { username: json.item.username, role: json.item.role };
  }, { critical: true });

  await step('auth login failure', async () => {
    const { response, json } = await requestJson(`${DEFAULT_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'auth.login', payload: { username: 'admin', password: 'wrong-password' } })
    });
    if (response.status !== 401) throw new Error(`expected 401, got ${response.status}`);
    return { status: response.status, ok: json && json.ok === false };
  }, { critical: true });

  await step('system-users list anonymous denied', async () => {
    const { response } = await requestJson(`${DEFAULT_BASE}/api/system-users`);
    if (response.status !== 401) throw new Error(`expected 401, got ${response.status}`);
    return { status: response.status };
  }, { critical: true });

  await step('system-users list authorized', async () => {
    const { response, json } = await requestJson(`${DEFAULT_BASE}/api/system-users`, {
      headers: {
        Authorization: `Bearer ${adminSessionToken}`
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const count = Array.isArray(json && json.items) ? json.items.length : 0;
    if (count < 1) throw new Error('system-users list is empty');
    return { count };
  }, { critical: true });

  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
