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

  await step('asset:unit-contact-application-module copy', async () => {
    const response = await fetch(`${DEFAULT_BASE}/unit-contact-application-module.js`);
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!text.includes('申請單位管理人員')) throw new Error('unit-contact apply title missing');
    if (!text.includes('查詢申請狀態')) throw new Error('unit-contact status title missing');
    if (!text.includes('帳號啟用說明')) throw new Error('unit-contact activation title missing');
    if (/\?{4,}/.test(text)) throw new Error('unit-contact module contains placeholder question marks');
    return { status: response.status };
  }, { critical: true });

  await step('asset:checklist-module encoding', async () => {
    const response = await fetch(`${DEFAULT_BASE}/checklist-module.js`);
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!text.includes('function renderChecklistList()')) throw new Error('renderChecklistList missing');
    if (!text.includes('\\u5167\\u7a3d\\u6aa2\\u6838\\u8868')) throw new Error('expected checklist title escape missing');
    if (/\?{4,}/.test(text)) throw new Error('checklist module contains placeholder question marks');
    return { status: response.status };
  }, { critical: true });

  await step('asset:admin-module copy', async () => {
    const response = await fetch(`${DEFAULT_BASE}/admin-module.js`);
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!text.includes('自訂單位審核與合併')) throw new Error('unit review title missing');
    if (!text.includes('稽核追蹤')) throw new Error('audit trail eyebrow missing');
    if (text.includes('System Governance')) throw new Error('legacy unit review eyebrow still present');
    if (text.includes('Audit Trail')) throw new Error('legacy audit title still present');
    if (/\?{4,}/.test(text)) throw new Error('admin module contains placeholder question marks');
    return { status: response.status };
  }, { critical: true });

  await step('asset:unit-module copy', async () => {
    const response = await fetch(`${DEFAULT_BASE}/unit-module.js`);
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!text.includes('中心 / 研究單位')) throw new Error('unit category label missing');
    if (!text.includes('教育訓練名單')) throw new Error('unit scope summary label missing');
    if (/\?{4,}/.test(text)) throw new Error('unit module contains placeholder question marks');
    return { status: response.status };
  }, { critical: true });

  await step('asset:shell-module copy', async () => {
    const response = await fetch(`${DEFAULT_BASE}/shell-module.js`);
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!text.includes('ISMS 管考與追蹤平台')) throw new Error('shell branding subtitle missing');
    if (text.includes('ISMS Corrective Action Tracking') || text.includes('ISMS Corrective Action')) {
      throw new Error('legacy shell branding still present');
    }
    return { status: response.status };
  }, { critical: true });

  for (const endpoint of ['unit-contact', 'corrective-actions', 'checklists', 'training', 'system-users', 'auth', 'audit-trail', 'review-scopes']) {
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
    if (Object.prototype.hasOwnProperty.call(json.item || {}, 'password')) throw new Error('password field leaked in auth response');
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
    const items = Array.isArray(json && json.items) ? json.items : [];
    const count = items.length;
    if (count < 1) throw new Error('system-users list is empty');
    if (items.some((item) => Object.prototype.hasOwnProperty.call(item || {}, 'password'))) {
      throw new Error('password field leaked in system-users list');
    }
    return { count };
  }, { critical: true });

  await step('audit-trail list authorized', async () => {
    const { response, json } = await requestJson(`${DEFAULT_BASE}/api/audit-trail?limit=20`, {
      headers: {
        Authorization: `Bearer ${adminSessionToken}`
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!json || !Array.isArray(json.items) || !json.summary) throw new Error('audit trail response invalid');
    return {
      count: json.items.length,
      latestOccurredAt: json.summary.latestOccurredAt || ''
    };
  }, { critical: true });

  await step('auth verify authorized', async () => {
    const { response, json } = await requestJson(`${DEFAULT_BASE}/api/auth/verify`, {
      headers: {
        Authorization: `Bearer ${adminSessionToken}`
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!json || !json.ok || !json.item || json.item.username !== 'admin') throw new Error('verify response invalid');
    return { username: json.item.username };
  }, { critical: true });

  await step('auth logout', async () => {
    const { response, json } = await requestJson(`${DEFAULT_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminSessionToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'auth.logout',
        payload: {}
      })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!json || json.ok !== true || json.loggedOut !== true) throw new Error('logout response invalid');
    return { loggedOut: true };
  }, { critical: true });

  await step('auth verify old session denied', async () => {
    const { response } = await requestJson(`${DEFAULT_BASE}/api/auth/verify`, {
      headers: {
        Authorization: `Bearer ${adminSessionToken}`
      }
    });
    if (response.status !== 401) throw new Error(`expected 401, got ${response.status}`);
    return { status: response.status };
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
