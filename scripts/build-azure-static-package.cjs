const fs = require('fs');
const path = require('path');
const { getBuildInfo } = require('./build-version-info.cjs');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'azure-staticwebapp');
const args = process.argv.slice(2);

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const hit = args.find((entry) => entry.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const backendBase = getArg('backend-base', 'https://YOUR-BACKEND.azurewebsites.net');
const outputDir = path.resolve(getArg('output-dir', DIST));
const buildInfo = getBuildInfo('azure-static-web-apps', ROOT);

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
    /<meta http-equiv=\"Content-Security-Policy\"[\s\S]*?content=\"[^\"]*\">/,
    `  <meta http-equiv=\"Content-Security-Policy\"\n    content=\"${csp}\">`
  );
  const buildInfoScript = `<script>window.__APP_BUILD_INFO__ = ${JSON.stringify(buildInfo).replace(/</g, '\u003c')};</script>`;
  html = html.replace(
    '<script src="asset-loader.js"></script>',
    `${buildInfoScript}\n  <script src="asset-loader.js?v=${buildInfo.versionKey}"></script>`
  );
  fs.writeFileSync(indexPath, html, 'utf8');
}

function buildOverride() {
  const content = `(function () {\n  window.__M365_UNIT_CONTACT_CONFIG_OVERRIDE__ = {\n    activeProfile: 'azureHttpsBackend',\n    strictRemoteData: true,\n    unitContactMode: 'm365-api',\n    unitContactSubmitEndpoint: '${backendBase}/api/unit-contact/apply',\n    unitContactStatusEndpoint: '${backendBase}/api/unit-contact/status',\n    unitContactStatusLookupMethod: 'POST',\n    correctiveActionsMode: 'm365-api',\n    correctiveActionsEndpoint: '${backendBase}/api/corrective-actions',\n    correctiveActionsHealthEndpoint: '${backendBase}/api/corrective-actions/health',\n    checklistMode: 'm365-api',\n    checklistEndpoint: '${backendBase}/api/checklists',\n    checklistHealthEndpoint: '${backendBase}/api/checklists/health',\n    trainingMode: 'm365-api',\n    trainingFormsEndpoint: '${backendBase}/api/training/forms',\n    trainingRostersEndpoint: '${backendBase}/api/training/rosters',\n    trainingHealthEndpoint: '${backendBase}/api/training/health',\n    authMode: 'm365-api',\n    authEndpoint: '${backendBase}/api/auth',\n    authHealthEndpoint: '${backendBase}/api/auth/health',\n    systemUsersMode: 'm365-api',\n    systemUsersEndpoint: '${backendBase}/api/system-users',\n    systemUsersHealthEndpoint: '${backendBase}/api/system-users/health',\n    reviewScopesMode: 'm365-api',\n    reviewScopesEndpoint: '${backendBase}/api/review-scopes',\n    reviewScopesHealthEndpoint: '${backendBase}/api/review-scopes/health',\n    attachmentsMode: 'm365-api',\n    attachmentsEndpoint: '${backendBase}/api/attachments',\n    attachmentsHealthEndpoint: '${backendBase}/api/attachments/health',\n    sharePointSiteUrl: 'https://ntums365.sharepoint.com/sites/ISMSFormsWorkspace',\n    sharePointSiteName: 'ISMSFormsWorkspace',\n    sharePointProvisioningModel: 'app-only-or-managed-identity',\n    sharePointLists: {\n      applications: 'UnitContactApplications',\n      unitAdmins: 'UnitAdmins',\n      audit: 'OpsAudit',\n      correctiveActions: 'CorrectiveActions',\n      checklists: 'Checklists',\n      trainingForms: 'TrainingForms',\n      trainingRosters: 'TrainingRosters',\n      systemUsers: 'SystemUsers',\n      reviewScopes: 'UnitReviewScopes'\n    }\n  };\n})();\n`;
  fs.writeFileSync(path.join(outputDir, 'm365-config.override.js'), content, 'utf8');
}

function buildStaticWebAppConfig() {
  const config = {
    navigationFallback: {
      rewrite: '/index.html',
      exclude: [
        '/vendor/*',
        '/*.css',
        '/*.js',
        '/*.svg',
        '/*.png',
        '/*.jpg',
        '/*.ico',
        '/*.json',
        '/favicon.*'
      ]
    },
    globalHeaders: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin'
    }
  };
  fs.writeFileSync(path.join(outputDir, 'staticwebapp.config.json'), JSON.stringify(config, null, 2), 'utf8');
}

function buildReadme() {
  const content = `ISMS Azure Static Web App Package\n================================\n\nPackage path:\n${outputDir}\n\nBackend base:\n${backendBase}\n\nContents:\n- static frontend bundle\n- Azure-ready m365-config.override.js\n- staticwebapp.config.json\n\nIntended deployment:\n- Frontend: Azure Static Web Apps\n- Backend: Azure App Service or Azure Functions over HTTPS\n\nBefore go-live:\n1. Confirm ${backendBase}/api/auth/health responds over HTTPS\n2. Deploy this folder to Azure Static Web Apps\n3. Verify login, checklist, training, corrective action, attachment flows\n`;
  fs.writeFileSync(path.join(outputDir, 'README-azure-static.txt'), content, 'utf8');
}

function buildManifest() {
  const manifest = {
    builtAt: buildInfo.builtAt,
    versionKey: buildInfo.versionKey,
    buildInfo,
    backendBase,
    files: filesToCopy,
    platform: 'azure-static-web-apps'
  };
  fs.writeFileSync(path.join(outputDir, 'deploy-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
}

fs.rmSync(outputDir, { recursive: true, force: true });
ensureDir(outputDir);
filesToCopy.forEach(copyRelative);
rewriteIndex();
buildOverride();
buildStaticWebAppConfig();
buildReadme();
buildManifest();

console.log(`azure static package ready: ${outputDir}`);
console.log(`backend base: ${backendBase}`);
