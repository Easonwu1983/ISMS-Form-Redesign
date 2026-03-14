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

const filesToCopy = [
  'index.html',
  'styles.css',
  'favicon.svg',
  'asset-loader.js',
  'units.js',
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
  const csp = [
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
    /<meta http-equiv="Content-Security-Policy"[\s\S]*?content="[^"]*">/,
    `  <meta http-equiv="Content-Security-Policy"\n    content="${csp}">`
  );
  fs.writeFileSync(indexPath, html, 'utf8');
}

function writeOverride() {
  const content = `(function () {\n  window.__M365_UNIT_CONTACT_CONFIG_OVERRIDE__ = {\n    activeProfile: 'cloudflarePagesTunnel',\n    strictRemoteData: true,\n    unitContactMode: 'm365-api',\n    unitContactSubmitEndpoint: '${backendBase}/api/unit-contact/apply',\n    unitContactStatusEndpoint: '${backendBase}/api/unit-contact/status',\n    unitContactStatusLookupMethod: 'POST',\n    correctiveActionsMode: 'm365-api',\n    correctiveActionsEndpoint: '${backendBase}/api/corrective-actions',\n    correctiveActionsHealthEndpoint: '${backendBase}/api/corrective-actions/health',\n    checklistMode: 'm365-api',\n    checklistEndpoint: '${backendBase}/api/checklists',\n    checklistHealthEndpoint: '${backendBase}/api/checklists/health',\n    trainingMode: 'm365-api',\n    trainingFormsEndpoint: '${backendBase}/api/training/forms',\n    trainingRostersEndpoint: '${backendBase}/api/training/rosters',\n    trainingHealthEndpoint: '${backendBase}/api/training/health',\n    authMode: 'm365-api',\n    authEndpoint: '${backendBase}/api/auth',\n    authHealthEndpoint: '${backendBase}/api/auth/health',\n    systemUsersMode: 'm365-api',\n    systemUsersEndpoint: '${backendBase}/api/system-users',\n    systemUsersHealthEndpoint: '${backendBase}/api/system-users/health',\n    reviewScopesMode: 'm365-api',\n    reviewScopesEndpoint: '${backendBase}/api/review-scopes',\n    reviewScopesHealthEndpoint: '${backendBase}/api/review-scopes/health',\n    attachmentsMode: 'm365-api',\n    attachmentsEndpoint: '${backendBase}/api/attachments',\n    attachmentsHealthEndpoint: '${backendBase}/api/attachments/health',\n    sharePointSiteUrl: 'https://ntums365.sharepoint.com/sites/ISMSFormsWorkspace',\n    sharePointSiteName: 'ISMSFormsWorkspace',\n    sharePointProvisioningModel: 'delegated-cli-or-app-only',\n    sharePointLists: {\n      applications: 'UnitContactApplications',\n      unitAdmins: 'UnitAdmins',\n      audit: 'OpsAudit',\n      correctiveActions: 'CorrectiveActions',\n      checklists: 'Checklists',\n      trainingForms: 'TrainingForms',\n      trainingRosters: 'TrainingRosters',\n      systemUsers: 'SystemUsers',\n      reviewScopes: 'UnitReviewScopes'\n    }\n  };\n})();\n`;
  fs.writeFileSync(path.join(outputDir, 'm365-config.override.js'), content, 'utf8');
}

function writeHeaders() {
  const content = `/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n`;
  fs.writeFileSync(path.join(outputDir, '_headers'), content, 'utf8');
}

function writeReadme() {
  const content = `ISMS Cloudflare Pages Package\n=============================\n\nPackage path:\n${outputDir}\n\nBackend base:\n${backendBase}\n\nIntended deployment:\n- Frontend: Cloudflare Pages\n- Backend: Cloudflare Tunnel -> current backend host\n\nBefore go-live:\n1. Confirm ${backendBase}/api/auth/health responds over HTTPS\n2. Deploy this folder to Cloudflare Pages\n3. Verify login and core business flows\n`;
  fs.writeFileSync(path.join(outputDir, 'README-cloudflare-pages.txt'), content, 'utf8');
}

function writeManifest() {
  fs.writeFileSync(path.join(outputDir, 'deploy-manifest.json'), JSON.stringify({
    builtAt: new Date().toISOString(),
    backendBase,
    platform: 'cloudflare-pages'
  }, null, 2), 'utf8');
}

fs.rmSync(outputDir, { recursive: true, force: true });
ensureDir(outputDir);
filesToCopy.forEach(copyRelative);
rewriteIndex();
writeOverride();
writeHeaders();
writeReadme();
writeManifest();

console.log(`cloudflare pages package ready: ${outputDir}`);
console.log(`backend base: ${backendBase}`);
