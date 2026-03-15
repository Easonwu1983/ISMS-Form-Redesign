const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'cloudflare-pages');
const args = process.argv.slice(2);

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const hit = args.find((entry) => entry.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const backendBase = getArg('backend-base', 'https://YOUR-TUNNEL-HOSTNAME');
const outputDir = path.resolve(getArg('output-dir', DIST));
const mode = getArg('mode', 'full');
const redirectTarget = getArg('redirect-target', backendBase.endsWith('/') ? backendBase : `${backendBase}/`);

const filesToCopy = [
  'index.html',
  'styles.css',
  'favicon.svg',
  'asset-loader.js',
  'units.js',
  'units-data.json',
  'm365-config.js',
  'm365-api-client.js',
  'attachment-module.js',
  'data-module.js',
  'auth-module.js',
  'unit-module.js',
  'ui-module.js',
  'policy-module.js',
  'workflow-support-module.js',
  'shell-module.js',
  'case-module.js',
  'admin-module.js',
  'checklist-module.js',
  'training-module.js',
  'unit-contact-application-module.js',
  'app.js',
  'vendor'
];

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function copyRelative(relPath) {
  const source = path.join(ROOT, relPath);
  const target = path.join(outputDir, relPath);
  const stat = fs.statSync(source);
  ensureDir(path.dirname(target));
  if (stat.isDirectory()) {
    fs.cpSync(source, target, { recursive: true, force: true });
    return;
  }
  fs.copyFileSync(source, target);
}

function rewriteIndex() {
  const indexPath = path.join(outputDir, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  const connectTarget = mode === 'full-proxy'
    ? "'self'"
    : `'self' ${backendBase} https://ntums365.sharepoint.com`;
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://ntums365.sharepoint.com",
    `connect-src ${connectTarget}`,
    "font-src 'self' data: https://fonts.gstatic.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "child-src 'none'"
  ].join('; ');
  html = html.replace(
    /<meta http-equiv="Content-Security-Policy"[\s\S]*?content="[^"]*">/,
    `  <meta http-equiv="Content-Security-Policy"\n    content="${csp}">`
  );
  fs.writeFileSync(indexPath, html, 'utf8');
}

function writeRedirectIndex() {
  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>內部稽核管考追蹤系統</title>
  <meta http-equiv="refresh" content="1; url=${redirectTarget}">
  <meta name="robots" content="noindex,nofollow">
  <style>
    :root {
      color-scheme: light;
      --bg: #eef4fb;
      --panel: rgba(255, 255, 255, 0.9);
      --line: rgba(25, 76, 143, 0.14);
      --text: #17345b;
      --muted: #5b708e;
      --accent: #1d5fae;
      --accent-soft: rgba(29, 95, 174, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", "Noto Sans TC", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(29, 95, 174, 0.14), transparent 34%),
        linear-gradient(180deg, #f6f9fd 0%, var(--bg) 100%);
      color: var(--text);
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: min(720px, 100%);
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 24px;
      box-shadow: 0 18px 48px rgba(23, 52, 91, 0.10);
      padding: 40px 36px;
      backdrop-filter: blur(14px);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.12em;
    }
    .badge-mark {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid rgba(29, 95, 174, 0.18);
      font-weight: 800;
      letter-spacing: 0.04em;
    }
    h1 {
      margin: 20px 0 12px;
      font-size: clamp(30px, 5vw, 44px);
      line-height: 1.12;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.7;
      font-size: 16px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      margin-top: 28px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      padding: 0 20px;
      border-radius: 14px;
      text-decoration: none;
      font-weight: 700;
    }
    .btn-primary {
      background: var(--accent);
      color: #fff;
      box-shadow: 0 12px 24px rgba(29, 95, 174, 0.18);
    }
    .meta {
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid rgba(29, 95, 174, 0.12);
      display: grid;
      gap: 8px;
      font-size: 14px;
      color: var(--muted);
    }
    code {
      font-family: Consolas, "Courier New", monospace;
      background: rgba(255, 255, 255, 0.82);
      padding: 2px 6px;
      border-radius: 8px;
      color: var(--text);
      word-break: break-all;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="badge">
      <span class="badge-mark">NTU</span>
      <span>CLOUDFLARE ENTRY</span>
    </div>
    <h1>內部稽核管考追蹤系統</h1>
    <p>目前入口頁由 Cloudflare HTTPS 提供，系統會在 1 秒後自動導向到目前可用的正式系統網址。</p>
    <div class="actions">
      <a class="btn btn-primary" href="${redirectTarget}">立即前往系統</a>
    </div>
    <div class="meta">
      <div>目前目標網址：<code>${redirectTarget}</code></div>
      <div>此入口頁使用 Cloudflare Pages 提供 HTTPS，後端服務則透過 Cloudflare Tunnel 轉送。</div>
    </div>
  </main>
  <script>
    window.setTimeout(function () {
      window.location.replace(${JSON.stringify(redirectTarget)});
    }, 900);
  </script>
</body>
</html>
`;
  fs.writeFileSync(path.join(outputDir, 'index.html'), html, 'utf8');
}

function buildApiEndpoint(pathname) {
  if (mode === 'full-proxy') {
    return pathname;
  }
  return `${backendBase}${pathname}`;
}

function writeOverride() {
  const content = `(function () {\n  window.__M365_UNIT_CONTACT_CONFIG_OVERRIDE__ = {\n    activeProfile: 'cloudflarePagesTunnel',\n    strictRemoteData: true,\n    unitContactMode: 'm365-api',\n    unitContactSubmitEndpoint: '${buildApiEndpoint('/api/unit-contact/apply')}',\n    unitContactStatusEndpoint: '${buildApiEndpoint('/api/unit-contact/status')}',\n    unitContactStatusLookupMethod: 'POST',\n    correctiveActionsMode: 'm365-api',\n    correctiveActionsEndpoint: '${buildApiEndpoint('/api/corrective-actions')}',\n    correctiveActionsHealthEndpoint: '${buildApiEndpoint('/api/corrective-actions/health')}',\n    checklistMode: 'm365-api',\n    checklistEndpoint: '${buildApiEndpoint('/api/checklists')}',\n    checklistHealthEndpoint: '${buildApiEndpoint('/api/checklists/health')}',\n    trainingMode: 'm365-api',\n    trainingFormsEndpoint: '${buildApiEndpoint('/api/training/forms')}',\n    trainingRostersEndpoint: '${buildApiEndpoint('/api/training/rosters')}',\n    trainingHealthEndpoint: '${buildApiEndpoint('/api/training/health')}',\n    authMode: 'm365-api',\n    authEndpoint: '${buildApiEndpoint('/api/auth')}',\n    authHealthEndpoint: '${buildApiEndpoint('/api/auth/health')}',\n    systemUsersMode: 'm365-api',\n    systemUsersEndpoint: '${buildApiEndpoint('/api/system-users')}',\n    systemUsersHealthEndpoint: '${buildApiEndpoint('/api/system-users/health')}',\n    reviewScopesMode: 'm365-api',\n    reviewScopesEndpoint: '${buildApiEndpoint('/api/review-scopes')}',\n    reviewScopesHealthEndpoint: '${buildApiEndpoint('/api/review-scopes/health')}',\n    auditTrailMode: 'm365-api',\n    auditTrailEndpoint: '${buildApiEndpoint('/api/audit-trail')}',\n    auditTrailHealthEndpoint: '${buildApiEndpoint('/api/audit-trail/health')}',\n    attachmentsMode: 'm365-api',\n    attachmentsEndpoint: '${buildApiEndpoint('/api/attachments')}',\n    attachmentsHealthEndpoint: '${buildApiEndpoint('/api/attachments/health')}',\n    sharePointSiteUrl: 'https://ntums365.sharepoint.com/sites/ISMSFormsWorkspace',\n    sharePointSiteName: 'ISMSFormsWorkspace',\n    sharePointProvisioningModel: 'delegated-cli-or-app-only',\n    sharePointLists: {\n      applications: 'UnitContactApplications',\n      unitAdmins: 'UnitAdmins',\n      audit: 'OpsAudit',\n      correctiveActions: 'CorrectiveActions',\n      checklists: 'Checklists',\n      trainingForms: 'TrainingForms',\n      trainingRosters: 'TrainingRosters',\n      systemUsers: 'SystemUsers',\n      reviewScopes: 'UnitReviewScopes'\n    }\n  };\n})();\n`;
  fs.writeFileSync(path.join(outputDir, 'm365-config.override.js'), content, 'utf8');
}

function writeWorkerProxy() {
  if (mode !== 'full-proxy') return;
  const content = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const upstream = new URL(url.pathname + url.search, ${JSON.stringify(backendBase)});
      const headers = new Headers(request.headers);
      headers.delete('host');
      return fetch(new Request(upstream.toString(), {
        method: request.method,
        headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        redirect: 'follow'
      }));
    }
    return env.ASSETS.fetch(request);
  }
};
`;
  fs.writeFileSync(path.join(outputDir, '_worker.js'), content, 'utf8');
}

function writeHeaders() {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://ntums365.sharepoint.com",
    mode === 'full-proxy'
      ? "connect-src 'self'"
      : `connect-src 'self' ${backendBase} https://ntums365.sharepoint.com`,
    "font-src 'self' data: https://fonts.gstatic.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "child-src 'none'"
  ].join('; ');
  const content = [
    '/*',
    `  Content-Security-Policy: ${csp}`,
    '  X-Content-Type-Options: nosniff',
    '  X-Frame-Options: DENY',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), usb=(), payment=(), browsing-topics=()',
    '',
    '/',
    '  Cache-Control: no-store, no-cache, must-revalidate',
    '',
    '/index.html',
    '  Cache-Control: no-store, no-cache, must-revalidate',
    '',
    '/m365-config.override.js',
    '  Cache-Control: no-store, no-cache, must-revalidate'
  ].join('\n');
  fs.writeFileSync(path.join(outputDir, '_headers'), content, 'utf8');
}

function writeReadme() {
  const content = `ISMS Cloudflare Pages Package\n=============================\n\nPackage path:\n${outputDir}\n\nMode:\n${mode}\n\nBackend base:\n${backendBase}\n\nRedirect target:\n${redirectTarget}\n\nIntended deployment:\n- Frontend: Cloudflare Pages\n- Backend: Cloudflare Tunnel -> current backend host\n\nBefore go-live:\n1. Confirm ${backendBase}/api/auth/health responds over HTTPS\n2. Deploy this folder to Cloudflare Pages\n3. If mode=redirect, verify the page auto-redirects to ${redirectTarget}\n4. If mode=full or full-proxy, verify login and core business flows\n5. If mode=full-proxy, Pages will proxy /api/* to the tunnel backend via _worker.js\n`;
  fs.writeFileSync(path.join(outputDir, 'README-cloudflare-pages.txt'), content, 'utf8');
}

function writeManifest() {
  fs.writeFileSync(path.join(outputDir, 'deploy-manifest.json'), JSON.stringify({
    builtAt: new Date().toISOString(),
    mode,
    backendBase,
    redirectTarget,
    platform: 'cloudflare-pages'
  }, null, 2), 'utf8');
}

fs.rmSync(outputDir, { recursive: true, force: true });
ensureDir(outputDir);
if (mode === 'redirect') {
  writeRedirectIndex();
} else {
  filesToCopy.forEach(copyRelative);
  rewriteIndex();
  writeOverride();
  writeWorkerProxy();
}
writeHeaders();
writeReadme();
writeManifest();

console.log(`cloudflare pages package ready: ${outputDir}`);
console.log(`backend base: ${backendBase}`);
console.log(`mode: ${mode}`);

