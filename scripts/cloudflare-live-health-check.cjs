const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const RUNTIME_DIR = path.join(ROOT, '.runtime');
const LOG_DIR = path.join(ROOT, 'logs');
const OUT_PATH = path.join(LOG_DIR, 'cloudflare-live-health-check.json');
const PAGES_BASE = String(process.env.ISMS_CLOUDFLARE_PAGES_BASE || 'https://isms-campus-portal.pages.dev').replace(/\/+$/, '');
const TUNNEL_URL_PATH = process.env.ISMS_CLOUDFLARE_TUNNEL_URL_PATH || path.join(RUNTIME_DIR, 'cloudflare-quick-tunnel.url');

async function requestJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  return { response, text, json };
}

async function requestText(url) {
  const response = await fetch(url);
  const text = await response.text();
  return { response, text };
}

async function run() {
  const report = {
    startedAt: new Date().toISOString(),
    pagesBase: PAGES_BASE,
    tunnelUrlPath: TUNNEL_URL_PATH,
    checks: []
  };
  const errors = [];

  async function check(name, fn, critical) {
    try {
      const value = await fn();
      report.checks.push({ name, ok: true, critical: !!critical, value });
    } catch (error) {
      const message = String(error && error.message || error || 'check failed');
      report.checks.push({ name, ok: false, critical: !!critical, error: message });
      if (critical) errors.push(`${name}: ${message}`);
    }
  }

  await check('pages:homepage', async () => {
    const { response, text } = await requestText(`${PAGES_BASE}/`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!/內部稽核管考追蹤系統|登入系統|ISMS/i.test(text)) {
      throw new Error('landing page did not contain expected login markers');
    }
    return { status: response.status };
  }, true);

  await check('pages:auth-health', async () => {
    const { response, json } = await requestJson(`${PAGES_BASE}/api/auth/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!json || json.ok === false || json.ready === false) {
      throw new Error(json && (json.message || json.error) || 'auth health not ready');
    }
    return { status: response.status, ready: json.ready !== false };
  }, true);

  await check('pages:audit-health', async () => {
    const { response, json } = await requestJson(`${PAGES_BASE}/api/audit-trail/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!json || json.ok === false || json.ready === false) {
      throw new Error(json && (json.message || json.error) || 'audit trail health not ready');
    }
    return { status: response.status, ready: json.ready !== false };
  }, true);

  const tunnelUrl = fs.existsSync(TUNNEL_URL_PATH)
    ? String(fs.readFileSync(TUNNEL_URL_PATH, 'utf8') || '').trim()
    : '';

  report.tunnelUrl = tunnelUrl;

  await check('tunnel:url-present', async () => {
    if (!tunnelUrl) throw new Error('quick tunnel url file is missing or empty');
    return { tunnelUrl };
  }, true);

  if (tunnelUrl) {
    await check('tunnel:auth-health', async () => {
      const { response, json } = await requestJson(`${tunnelUrl}/api/auth/health`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!json || json.ok === false || json.ready === false) {
        throw new Error(json && (json.message || json.error) || 'tunnel auth health not ready');
      }
      return { status: response.status, ready: json.ready !== false };
    }, true);
  }

  report.finishedAt = new Date().toISOString();
  report.ok = errors.length === 0;
  if (errors.length) report.errors = errors;
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exit(1);
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
