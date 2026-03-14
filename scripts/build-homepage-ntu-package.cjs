const fs = require('fs');
const path = require('path');

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
    /<meta http-equiv="Content-Security-Policy"[\s\S]*?content="[^"]*">/,
    `  <meta http-equiv="Content-Security-Policy"\n    content="${homepageCsp}">`
  );
  fs.writeFileSync(indexPath, html, 'utf8');
}

function buildHomepageOverride() {
  const httpOverride = `(function () {\n  window.__M365_UNIT_CONTACT_CONFIG_OVERRIDE__ = {\n    activeProfile: 'a3CampusBackend',\n    strictRemoteData: true,\n    unitContactMode: 'm365-api',\n    unitContactSubmitEndpoint: '${backendBase}/api/unit-contact/apply',\n    unitContactStatusEndpoint: '${backendBase}/api/unit-contact/status',\n    unitContactStatusLookupMethod: 'POST',\n    correctiveActionsMode: 'm365-api',\n    correctiveActionsEndpoint: '${backendBase}/api/corrective-actions',\n    correctiveActionsHealthEndpoint: '${backendBase}/api/corrective-actions/health',\n    checklistMode: 'm365-api',\n    checklistEndpoint: '${backendBase}/api/checklists',\n    checklistHealthEndpoint: '${backendBase}/api/checklists/health',\n    trainingMode: 'm365-api',\n    trainingFormsEndpoint: '${backendBase}/api/training/forms',\n    trainingRostersEndpoint: '${backendBase}/api/training/rosters',\n    trainingHealthEndpoint: '${backendBase}/api/training/health',\n    authMode: 'm365-api',\n    authEndpoint: '${backendBase}/api/auth',\n    authHealthEndpoint: '${backendBase}/api/auth/health',\n    systemUsersMode: 'm365-api',\n    systemUsersEndpoint: '${backendBase}/api/system-users',\n    systemUsersHealthEndpoint: '${backendBase}/api/system-users/health',\n    reviewScopesMode: 'm365-api',\n    reviewScopesEndpoint: '${backendBase}/api/review-scopes',\n    reviewScopesHealthEndpoint: '${backendBase}/api/review-scopes/health',\n    attachmentsMode: 'm365-api',\n    attachmentsEndpoint: '${backendBase}/api/attachments',\n    attachmentsHealthEndpoint: '${backendBase}/api/attachments/health',\n    sharePointSiteUrl: 'https://ntums365.sharepoint.com/sites/ISMSFormsWorkspace',\n    sharePointSiteName: 'ISMSFormsWorkspace',\n    sharePointProvisioningModel: 'delegated-site-owner',\n    sharePointLists: {\n      applications: 'UnitContactApplications',\n      unitAdmins: 'UnitAdmins',\n      audit: 'OpsAudit',\n      correctiveActions: 'CorrectiveActions',\n      checklists: 'Checklists',\n      trainingForms: 'TrainingForms',\n      trainingRosters: 'TrainingRosters',\n      systemUsers: 'SystemUsers',\n      reviewScopes: 'UnitReviewScopes'\n    }\n  };\n})();\n`;
  const httpsTemplate = `(function () {\n  window.__M365_UNIT_CONTACT_CONFIG_OVERRIDE__ = {\n    activeProfile: 'a3CampusBackend',\n    strictRemoteData: true,\n    unitContactMode: 'm365-api',\n    unitContactSubmitEndpoint: 'https://YOUR-BACKEND-HOST/api/unit-contact/apply',\n    unitContactStatusEndpoint: 'https://YOUR-BACKEND-HOST/api/unit-contact/status',\n    unitContactStatusLookupMethod: 'POST',\n    correctiveActionsMode: 'm365-api',\n    correctiveActionsEndpoint: 'https://YOUR-BACKEND-HOST/api/corrective-actions',\n    correctiveActionsHealthEndpoint: 'https://YOUR-BACKEND-HOST/api/corrective-actions/health',\n    checklistMode: 'm365-api',\n    checklistEndpoint: 'https://YOUR-BACKEND-HOST/api/checklists',\n    checklistHealthEndpoint: 'https://YOUR-BACKEND-HOST/api/checklists/health',\n    trainingMode: 'm365-api',\n    trainingFormsEndpoint: 'https://YOUR-BACKEND-HOST/api/training/forms',\n    trainingRostersEndpoint: 'https://YOUR-BACKEND-HOST/api/training/rosters',\n    trainingHealthEndpoint: 'https://YOUR-BACKEND-HOST/api/training/health',\n    authMode: 'm365-api',\n    authEndpoint: 'https://YOUR-BACKEND-HOST/api/auth',\n    authHealthEndpoint: 'https://YOUR-BACKEND-HOST/api/auth/health',\n    systemUsersMode: 'm365-api',\n    systemUsersEndpoint: 'https://YOUR-BACKEND-HOST/api/system-users',\n    systemUsersHealthEndpoint: 'https://YOUR-BACKEND-HOST/api/system-users/health',\n    reviewScopesMode: 'm365-api',\n    reviewScopesEndpoint: 'https://YOUR-BACKEND-HOST/api/review-scopes',\n    reviewScopesHealthEndpoint: 'https://YOUR-BACKEND-HOST/api/review-scopes/health',\n    attachmentsMode: 'm365-api',\n    attachmentsEndpoint: 'https://YOUR-BACKEND-HOST/api/attachments',\n    attachmentsHealthEndpoint: 'https://YOUR-BACKEND-HOST/api/attachments/health'\n  };\n})();\n`;
  fs.writeFileSync(path.join(DIST, 'm365-config.override.js'), httpOverride, 'utf8');
  fs.writeFileSync(path.join(DIST, 'm365-config.override.https-template.js'), httpsTemplate, 'utf8');
}

function buildReadme() {
  const content = `ISMS Homepage FTP Deploy Package\n================================\n\nPackage path:\n${DIST}\n\nPublic entry (expected):\n${publicBase}\n\nBackend base:\n${backendBase}\n\nWhat this package contains:\n- Static frontend files only\n- Homepage-specific m365-config.override.js\n- HTTPS-ready m365-config.override.https-template.js\n- index.html with homepage CSP for the current backend\n\nImportant:\n1. This package assumes the backend stays at ${backendBase}\n2. If users open the homepage over HTTPS while the backend is still HTTP, browsers will block API calls as mixed content\n3. Until the backend has HTTPS, open the homepage using the HTTP URL shown above\n\nFTP upload target:\n- Host: homepage.ntu.edu.tw\n- Protocol: FTP\n- Encryption: Explicit TLS\n- Login type: Ask for password\n- Upload folder: public_html/${publicSubdir}\n\nAfter upload:\n1. Verify ${publicBase}\n2. Verify login works\n3. Verify auth, checklist, training, corrective action flows all load normally\n`;
  fs.writeFileSync(path.join(DIST, 'README-homepage-upload.txt'), content, 'utf8');
}

function buildManifest() {
  const manifest = {
    builtAt: new Date().toISOString(),
    backendBase,
    publicBase,
    files: filesToCopy,
    note: 'Homepage package requires HTTP homepage access until backend HTTPS is available.'
  };
  fs.writeFileSync(path.join(DIST, 'deploy-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
}

fs.rmSync(DIST, { recursive: true, force: true });
ensureDir(DIST);
filesToCopy.forEach(copyRelative);
buildHomepageIndex();
buildHomepageOverride();
buildReadme();
buildManifest();

console.log(`homepage package ready: ${DIST}`);
console.log(`public entry: ${publicBase}`);
console.log(`backend base: ${backendBase}`);
