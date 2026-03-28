const fs = require('fs');
const path = require('path');
const { getBuildInfo } = require('./build-version-info.cjs');
const { buildAuthorizationTemplatePdf } = require('./build-authorization-template-pdf.cjs');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'google-firebase-hosting');
const args = process.argv.slice(2);

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const hit = args.find((entry) => entry.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const backendBase = getArg('backend-base', 'https://YOUR-CLOUD-RUN-SERVICE.run.app');
const outputDir = path.resolve(getArg('output-dir', DIST));
const buildInfo = getBuildInfo('firebase-hosting', ROOT);

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
  'app-runtime-access-module.js',
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
  'app-remote-runtime-module.js',
  'app-attachment-migration-module.js',
  'app-router-module.js',
  'app-router-runtime-module.js',
  'app-start-runtime-module.js',
  'app-bootstrap-module.js',
  'app-core-module-access-module.js',
  'app-support-bridge-module.js',
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
  html = html.replace(
    '<script src="asset-loader.js"></script>',
    `<script src="asset-loader.js?v=${buildInfo.versionKey}"></script>`
  );
  fs.writeFileSync(indexPath, html, 'utf8');
}

function writeOverride() {
  const content = `(function () {\n  window.__M365_UNIT_CONTACT_CONFIG_OVERRIDE__ = {\n    activeProfile: 'googleCloudRun',\n    strictRemoteData: true,\n    unitContactMode: 'm365-api',\n    unitContactSubmitEndpoint: '${backendBase}/api/unit-contact/apply',\n    unitContactStatusEndpoint: '${backendBase}/api/unit-contact/status',\n    unitContactStatusLookupMethod: 'POST',\n    correctiveActionsMode: 'm365-api',\n    correctiveActionsEndpoint: '${backendBase}/api/corrective-actions',\n    correctiveActionsHealthEndpoint: '${backendBase}/api/corrective-actions/health',\n    checklistMode: 'm365-api',\n    checklistEndpoint: '${backendBase}/api/checklists',\n    checklistHealthEndpoint: '${backendBase}/api/checklists/health',\n    trainingMode: 'm365-api',\n    trainingFormsEndpoint: '${backendBase}/api/training/forms',\n    trainingRostersEndpoint: '${backendBase}/api/training/rosters',\n    trainingHealthEndpoint: '${backendBase}/api/training/health',\n    authMode: 'm365-api',\n    authEndpoint: '${backendBase}/api/auth',\n    authHealthEndpoint: '${backendBase}/api/auth/health',\n    systemUsersMode: 'm365-api',\n    systemUsersEndpoint: '${backendBase}/api/system-users',\n    systemUsersHealthEndpoint: '${backendBase}/api/system-users/health',\n    reviewScopesMode: 'm365-api',\n    reviewScopesEndpoint: '${backendBase}/api/review-scopes',\n    reviewScopesHealthEndpoint: '${backendBase}/api/review-scopes/health',\n    attachmentsMode: 'm365-api',\n    attachmentsEndpoint: '${backendBase}/api/attachments',\n    attachmentsHealthEndpoint: '${backendBase}/api/attachments/health',\n    sharePointSiteUrl: 'https://ntums365.sharepoint.com/sites/ISMSFormsWorkspace',\n    sharePointSiteName: 'ISMSFormsWorkspace',\n    sharePointProvisioningModel: 'app-only-or-managed-identity',\n    sharePointLists: {\n      applications: 'UnitContactApplications',\n      unitAdmins: 'UnitAdmins',\n      audit: 'OpsAudit',\n      correctiveActions: 'CorrectiveActions',\n      checklists: 'Checklists',\n      trainingForms: 'TrainingForms',\n      trainingRosters: 'TrainingRosters',\n      systemUsers: 'SystemUsers',\n      reviewScopes: 'UnitReviewScopes'\n    }\n  };\n})();\n`;
  fs.writeFileSync(path.join(outputDir, 'm365-config.override.js'), content, 'utf8');
}

function writeFirebaseConfig() {
  const config = {
    hosting: {
      public: '.',
      ignore: ['firebase.json', '**/.*', '**/node_modules/**'],
      rewrites: [
        { source: '**', destination: '/index.html' }
      ],
        headers: [
          {
            source: '**',
            headers: [
              { key: 'X-Content-Type-Options', value: 'nosniff' },
              { key: 'X-Frame-Options', value: 'DENY' },
              { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
              { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
              { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
              { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' }
            ]
          }
        ]
      }
  };
  fs.writeFileSync(path.join(outputDir, 'firebase.json'), JSON.stringify(config, null, 2), 'utf8');
}

function writeFirebasercSample() {
  const sample = {
    projects: {
      default: 'YOUR-FIREBASE-PROJECT-ID'
    }
  };
  fs.writeFileSync(path.join(outputDir, '.firebaserc.sample.json'), JSON.stringify(sample, null, 2), 'utf8');
}

function writeReadme() {
  const content = `ISMS Google Firebase Hosting Package\n===================================\n\nPackage path:\n${outputDir}\n\nBackend base:\n${backendBase}\n\nIntended deployment:\n- Frontend: Firebase Hosting\n- Backend: Google Cloud Run HTTPS service\n\nBefore go-live:\n1. Confirm ${backendBase}/api/auth/health responds\n2. Copy .firebaserc.sample.json to .firebaserc and fill your project id\n3. Run firebase deploy --only hosting from this folder\n`;
  fs.writeFileSync(path.join(outputDir, 'README-google-firebase.txt'), content, 'utf8');
}

function writeManifest() {
  fs.writeFileSync(path.join(outputDir, 'deploy-manifest.json'), JSON.stringify({
    builtAt: buildInfo.builtAt,
    versionKey: buildInfo.versionKey,
    buildInfo,
    backendBase,
    platform: 'firebase-hosting'
  }, null, 2), 'utf8');
}

async function main() {
  fs.rmSync(outputDir, { recursive: true, force: true });
  ensureDir(outputDir);
  filesToCopy.forEach(copyRelative);
  await buildAuthorizationTemplatePdf(outputDir, buildInfo);
  rewriteIndex();
  writeOverride();
  writeFirebaseConfig();
  writeFirebasercSample();
  writeReadme();
  writeManifest();

  console.log(`google firebase package ready: ${outputDir}`);
  console.log(`backend base: ${backendBase}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

