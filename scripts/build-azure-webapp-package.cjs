const fs = require('fs');
const path = require('path');
const { getBuildInfo } = require('./build-version-info.cjs');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'azure-webapp-backend');
const buildInfo = getBuildInfo('azure-app-service', ROOT);

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
    name: 'isms-campus-backend-azure',
    private: true,
    version: '0.1.0',
    description: 'Minimal Azure App Service package for ISMS campus backend',
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

function writeReadme() {
  const content = `ISMS Azure Web App Backend Package\n=================================\n\nContents:\n- m365/campus-backend\n- m365/azure-function shared contracts\n- scripts/_m365-a3-backend-utils.cjs\n- minimal package.json\n\nStartup command:\nnode m365/campus-backend/server.cjs\n\nConfigure app settings before go-live. See:\n- ../../infra/azure/app-service.appsettings.sample.json\n- ../../docs/azure-minimal-go-live.md\n`;
  fs.writeFileSync(path.join(DIST, 'README-azure-webapp.txt'), content, 'utf8');
}

function writeManifest() {
  fs.writeFileSync(path.join(DIST, 'deploy-manifest.json'), JSON.stringify({
    builtAt: buildInfo.builtAt,
    versionKey: buildInfo.versionKey,
    buildInfo,
    platform: 'azure-app-service',
    copied: copyTargets
  }, null, 2), 'utf8');
}

fs.rmSync(DIST, { recursive: true, force: true });
ensureDir(DIST);
copyTargets.forEach(copyRelative);
writePackageJson();
writeReadme();
writeManifest();

console.log(`azure webapp backend package ready: ${DIST}`);
