const fs = require('fs');
const path = require('path');
const { getBuildInfo } = require('./build-version-info.cjs');
const { buildAuthorizationTemplatePdf } = require('./build-authorization-template-pdf.cjs');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'homepage-ntu');
const args = process.argv.slice(2);

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const hit = args.find((entry) => entry.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const backendBase = getArg('backend-base', 'http://140.112.3.65:8088');
const publicSubdir = getArg('public-subdir', 'isms');
const publicUser = getArg('public-user', 'easonwu');
const publicBase = getArg('public-base', `http://homepage.ntu.edu.tw/~${publicUser}/${publicSubdir}/`);
const mode = getArg('mode', 'full');
const redirectTarget = getArg('redirect-target', backendBase.endsWith('/') ? backendBase : `${backendBase}/`);
const buildInfo = getBuildInfo('homepage-ntu', ROOT);

const filesToCopy = [
  'index.html',
  'styles.css',
  'favicon.svg',
  'favicon.ico',
  'asset-loader.js',
  'collection-cache-module.js',
  'service-registry-module.js',
  'app-core-service-module.js',
  'app-runtime-service-module.js',
  'app-bootstrap-access-module.js',
  'app-bootstrap-wiring-module.js',
  'app-bootstrap-state-module.js',
  'app-service-access-module.js',
  'app-route-module.js',
  'app-page-orchestration-module.js',
  'app-visibility-module.js',
  'app-action-module.js',
  'app-shell-orchestration-module.js',
  'app-shell-runtime-module.js',
  'app-entry-module.js',
  'app-entry-runtime-module.js',
  'app-auth-session-module.js',
  'app-auth-session-runtime-module.js',
  'app-router-module.js',
  'app-router-runtime-module.js',
  'app-bootstrap-module.js',
  'admin-collection-cache-module.js',
  'units.js',
  'm365-config.js',
  'm365-api-client.js',
  'attachment-module.js',
  'data-module.js',
  'cache-invalidation-module.js',
  'auth-module.js',
  'unit-module.js',
  'ui-module.js',
  'policy-module.js',
  'workflow-support-module.js',
  'collection-contract-module.js',
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
  const target = path.join(DIST, relPath);
  const stat = fs.statSync(source);
  ensureDir(path.dirname(target));
  if (stat.isDirectory()) {
    fs.cpSync(source, target, { recursive: true, force: true });
    return;
  }
  fs.copyFileSync(source, target);
}

function buildHomepageIndex() {
  const indexPath = path.join(DIST, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  const homepageCsp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://ntums365.sharepoint.com",
    `connect-src 'self' ${backendBase} https://ntums365.sharepoint.com`,
    "font-src 'self' data: https://fonts.gstatic.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "child-src 'none'"
  ].join('; ');
  html = html.replace(
    /<meta http-equiv=\"Content-Security-Policy\"[\s\S]*?content=\"[^\"]*\">/,
    `  <meta http-equiv=\"Content-Security-Policy\"\n    content=\"${homepageCsp}\">`
  );
  html = html.replace(
    '<script src="asset-loader.js"></script>',
    `<script src="asset-loader.js?v=${buildInfo.versionKey}"></script>`
  );
  fs.writeFileSync(indexPath, html, 'utf8');
}

function buildHomepageRedirectIndex() {
  const redirectHtml = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Cross-Origin-Embedder-Policy" content="require-corp">
  <meta http-equiv="Cross-Origin-Opener-Policy" content="same-origin">
  <meta http-equiv="Cross-Origin-Resource-Policy" content="same-origin">
  <title>內部稽核管考追蹤系統入口</title>
  <meta http-equiv="refresh" content="1; url=${redirectTarget}">
  <meta name="robots" content="noindex,nofollow">
  <style>
    :root {
      color-scheme: light;
      --bg: #eef4fb;
      --panel: rgba(255, 255, 255, 0.88);
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
      transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
    }
    .btn-primary {
      background: var(--accent);
      color: #fff;
      box-shadow: 0 12px 24px rgba(29, 95, 174, 0.18);
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.9);
      color: var(--accent);
      border: 1px solid rgba(29, 95, 174, 0.18);
    }
    .btn:hover { transform: translateY(-1px); }
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
    .hint {
      margin-top: 18px;
      font-size: 14px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="badge">
      <span class="badge-mark">NTU</span>
      <span>INTERNAL AUDIT ENTRY</span>
    </div>
    <h1>內部稽核管考追蹤系統</h1>
    <p>此入口頁會自動導向校內正式系統。若 1 秒後未自動跳轉，請直接使用下方按鈕進入。系統僅限校內網路或允許來源連線。</p>
    <div class="actions">
      <a class="btn btn-primary" href="${redirectTarget}">進入系統</a>
      <a class="btn btn-secondary" href="http://homepage.ntu.edu.tw/~${publicUser}/">回個人首頁</a>
    </div>
    <div class="meta">
      <div>導向目標：<code>${redirectTarget}</code></div>
      <div>目前模式：Homepage 入口頁，實際系統仍由校內主機提供服務。</div>
    </div>
    <div class="hint">若仍無法開啟，請確認目前在校內網路，或直接聯繫系統管理員檢查校內入口。</div>
  </main>
  <script>
    window.setTimeout(function () {
      window.location.replace(${JSON.stringify(redirectTarget)});
    }, 900);
  </script>
</body>
</html>
`;
  fs.writeFileSync(path.join(DIST, 'index.html'), redirectHtml, 'utf8');
}

function buildHomepageOverride() {
  const httpOverride = `(function () {\n  window.__M365_UNIT_CONTACT_CONFIG_OVERRIDE__ = {\n    activeProfile: 'a3CampusBackend',\n    strictRemoteData: true,\n    unitContactMode: 'm365-api',\n    unitContactSubmitEndpoint: '${backendBase}/api/unit-contact/apply',\n    unitContactStatusEndpoint: '${backendBase}/api/unit-contact/status',\n    unitContactStatusLookupMethod: 'POST',\n    correctiveActionsMode: 'm365-api',\n    correctiveActionsEndpoint: '${backendBase}/api/corrective-actions',\n    correctiveActionsHealthEndpoint: '${backendBase}/api/corrective-actions/health',\n    checklistMode: 'm365-api',\n    checklistEndpoint: '${backendBase}/api/checklists',\n    checklistHealthEndpoint: '${backendBase}/api/checklists/health',\n    trainingMode: 'm365-api',\n    trainingFormsEndpoint: '${backendBase}/api/training/forms',\n    trainingRostersEndpoint: '${backendBase}/api/training/rosters',\n    trainingHealthEndpoint: '${backendBase}/api/training/health',\n    authMode: 'm365-api',\n    authEndpoint: '${backendBase}/api/auth',\n    authHealthEndpoint: '${backendBase}/api/auth/health',\n    systemUsersMode: 'm365-api',\n    systemUsersEndpoint: '${backendBase}/api/system-users',\n    systemUsersHealthEndpoint: '${backendBase}/api/system-users/health',\n    reviewScopesMode: 'm365-api',\n    reviewScopesEndpoint: '${backendBase}/api/review-scopes',\n    reviewScopesHealthEndpoint: '${backendBase}/api/review-scopes/health',\n    attachmentsMode: 'm365-api',\n    attachmentsEndpoint: '${backendBase}/api/attachments',\n    attachmentsHealthEndpoint: '${backendBase}/api/attachments/health',\n    sharePointSiteUrl: 'https://ntums365.sharepoint.com/sites/ISMSFormsWorkspace',\n    sharePointSiteName: 'ISMSFormsWorkspace',\n    sharePointProvisioningModel: 'delegated-site-owner',\n    sharePointLists: {\n      applications: 'UnitContactApplications',\n      unitAdmins: 'UnitAdmins',\n      audit: 'OpsAudit',\n      correctiveActions: 'CorrectiveActions',\n      checklists: 'Checklists',\n      trainingForms: 'TrainingForms',\n      trainingRosters: 'TrainingRosters',\n      systemUsers: 'SystemUsers',\n      reviewScopes: 'UnitReviewScopes'\n    }\n  };\n})();\n`;
  const httpsTemplate = `(function () {\n  window.__M365_UNIT_CONTACT_CONFIG_OVERRIDE__ = {\n    activeProfile: 'a3CampusBackend',\n    strictRemoteData: true,\n    unitContactMode: 'm365-api',\n    unitContactSubmitEndpoint: 'https://YOUR-BACKEND-HOST/api/unit-contact/apply',\n    unitContactStatusEndpoint: 'https://YOUR-BACKEND-HOST/api/unit-contact/status',\n    unitContactStatusLookupMethod: 'POST',\n    correctiveActionsMode: 'm365-api',\n    correctiveActionsEndpoint: 'https://YOUR-BACKEND-HOST/api/corrective-actions',\n    correctiveActionsHealthEndpoint: 'https://YOUR-BACKEND-HOST/api/corrective-actions/health',\n    checklistMode: 'm365-api',\n    checklistEndpoint: 'https://YOUR-BACKEND-HOST/api/checklists',\n    checklistHealthEndpoint: 'https://YOUR-BACKEND-HOST/api/checklists/health',\n    trainingMode: 'm365-api',\n    trainingFormsEndpoint: 'https://YOUR-BACKEND-HOST/api/training/forms',\n    trainingRostersEndpoint: 'https://YOUR-BACKEND-HOST/api/training/rosters',\n    trainingHealthEndpoint: 'https://YOUR-BACKEND-HOST/api/training/health',\n    authMode: 'm365-api',\n    authEndpoint: 'https://YOUR-BACKEND-HOST/api/auth',\n    authHealthEndpoint: 'https://YOUR-BACKEND-HOST/api/auth/health',\n    systemUsersMode: 'm365-api',\n    systemUsersEndpoint: 'https://YOUR-BACKEND-HOST/api/system-users',\n    systemUsersHealthEndpoint: 'https://YOUR-BACKEND-HOST/api/system-users/health',\n    reviewScopesMode: 'm365-api',\n    reviewScopesEndpoint: 'https://YOUR-BACKEND-HOST/api/review-scopes',\n    reviewScopesHealthEndpoint: 'https://YOUR-BACKEND-HOST/api/review-scopes/health',\n    attachmentsMode: 'm365-api',\n    attachmentsEndpoint: 'https://YOUR-BACKEND-HOST/api/attachments',\n    attachmentsHealthEndpoint: 'https://YOUR-BACKEND-HOST/api/attachments/health'\n  };\n})();\n`;
  fs.writeFileSync(path.join(DIST, 'm365-config.override.js'), httpOverride, 'utf8');
  fs.writeFileSync(path.join(DIST, 'm365-config.override.https-template.js'), httpsTemplate, 'utf8');
}

function buildReadme() {
  const content = `ISMS Homepage FTP Deploy Package\n================================\n\nPackage path:\n${DIST}\n\nPublic entry (expected):\n${publicBase}\n\nBackend base:\n${backendBase}\n\nMode:\n${mode}\n\nWhat this package contains:\n- Static frontend files only\n- Homepage-specific m365-config.override.js\n- HTTPS-ready m365-config.override.https-template.js\n- index.html for the selected homepage mode\n\nImportant:\n1. This package assumes the backend stays at ${backendBase}\n2. If users open the homepage over HTTPS while the backend is still HTTP, browsers will block API calls as mixed content\n3. Redirect mode avoids mixed-content by sending users straight to the campus backend URL\n\nFTP upload target:\n- Host: homepage.ntu.edu.tw\n- Protocol: FTP\n- Encryption: Explicit TLS\n- Login type: Ask for password\n- Upload folder: public_html/${publicSubdir}\n\nAfter upload:\n1. Verify ${publicBase}\n2. If mode=redirect, confirm the page auto-redirects to ${redirectTarget}\n3. If mode=full, verify login and core flows all load normally\n`;
  fs.writeFileSync(path.join(DIST, 'README-homepage-upload.txt'), content, 'utf8');
}

function buildManifest() {
  const manifest = {
    builtAt: buildInfo.builtAt,
    versionKey: buildInfo.versionKey,
    buildInfo,
    mode,
    backendBase,
    redirectTarget,
    publicBase,
    files: filesToCopy,
    note: mode === 'redirect'
      ? 'Homepage package is an auto-redirect entry page that forwards users to the campus backend.'
      : 'Homepage package requires HTTP homepage access until backend HTTPS is available.'
  };
  fs.writeFileSync(path.join(DIST, 'deploy-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
}

async function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  ensureDir(DIST);
  filesToCopy.forEach(copyRelative);
  await buildAuthorizationTemplatePdf(DIST, buildInfo);
  if (mode === 'redirect') {
    buildHomepageRedirectIndex();
  } else {
    buildHomepageIndex();
  }
  buildHomepageOverride();
  buildReadme();
  buildManifest();

  console.log(`homepage package ready: ${DIST}`);
  console.log(`public entry: ${publicBase}`);
  console.log(`backend base: ${backendBase}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
