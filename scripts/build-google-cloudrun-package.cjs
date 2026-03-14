const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'google-cloudrun-backend');

const copyTargets = [
  'm365/campus-backend',
  'm365/azure-function',
  'scripts/_m365-a3-backend-utils.cjs'
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

function writePackageJson() {
  const pkg = {
    name: 'isms-campus-backend-cloudrun',
    private: true,
    version: '0.1.0',
    description: 'Minimal Google Cloud Run package for ISMS campus backend',
    engines: {
      node: '22.x'
    },
    scripts: {
      start: 'node m365/campus-backend/server.cjs',
      check: 'node --check scripts/_m365-a3-backend-utils.cjs && node --check m365/campus-backend/server.cjs'
    }
  };
  fs.writeFileSync(path.join(DIST, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');
}

function writeDockerfile() {
  const content = `FROM node:22-bookworm-slim\nWORKDIR /app\nCOPY package.json ./package.json\nCOPY m365 ./m365\nCOPY scripts ./scripts\nENV NODE_ENV=production\nENV PORT=8080\nEXPOSE 8080\nCMD [\"node\", \"m365/campus-backend/server.cjs\"]\n`;
  fs.writeFileSync(path.join(DIST, 'Dockerfile'), content, 'utf8');
}

function writeReadme() {
  const content = `ISMS Google Cloud Run Backend Package\n====================================\n\nContents:\n- m365/campus-backend\n- m365/azure-function shared contracts\n- scripts/_m365-a3-backend-utils.cjs\n- minimal package.json\n- Dockerfile\n\nDeploy target:\n- Google Cloud Run\n\nImportant app settings:\n- M365_A3_TOKEN_MODE=app-only\n- M365_A3_TENANT_ID\n- M365_A3_CLIENT_ID\n- M365_A3_CLIENT_SECRET\n- UNIT_CONTACT_ALLOWED_ORIGINS\n- AUTH_SESSION_SECRET\n`;
  fs.writeFileSync(path.join(DIST, 'README-google-cloudrun.txt'), content, 'utf8');
}

function writeManifest() {
  fs.writeFileSync(path.join(DIST, 'deploy-manifest.json'), JSON.stringify({
    builtAt: new Date().toISOString(),
    platform: 'google-cloud-run',
    copied: copyTargets
  }, null, 2), 'utf8');
}

fs.rmSync(DIST, { recursive: true, force: true });
ensureDir(DIST);
copyTargets.forEach(copyRelative);
writePackageJson();
writeDockerfile();
writeReadme();
writeManifest();

console.log(`google cloud run package ready: ${DIST}`);
