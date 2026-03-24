const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');
const path = require('path');

const ROOT = process.cwd();

function runGit(args) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (error) {
    throw new Error(`git ${args.join(' ')} failed`);
  }
}

function runNode(script) {
  const result = spawnSync(process.execPath, [path.join(ROOT, script)], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
    env: process.env
  });
  if (result.error) throw result.error;
  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`${script} failed with exit code ${result.status}`);
  }
}

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const text = fs.readFileSync(filePath, 'utf8');
    return text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`failed to read JSON ${filePath}: ${error.message || error}`);
  }
}

function assertTrackedTreeClean() {
  const status = runGit(['diff', '--name-only', '--ignore-space-at-eol', '--']);
  if (status) {
    throw new Error(`tracked working tree has pending semantic changes:\n${status}`);
  }
}

function cleanVersion(value) {
  return String(value || '').trim().replace(/^v/i, '');
}

function assertDistManifestsAligned() {
  const manifestPaths = [
    path.join(ROOT, 'dist', 'cloudflare-pages', 'deploy-manifest.json'),
    path.join(ROOT, 'dist', 'homepage-ntu', 'deploy-manifest.json'),
    path.join(ROOT, 'dist', 'azure-staticwebapp', 'deploy-manifest.json'),
    path.join(ROOT, 'dist', 'azure-webapp-backend', 'deploy-manifest.json'),
    path.join(ROOT, 'dist', 'google-firebase-hosting', 'deploy-manifest.json'),
    path.join(ROOT, 'dist', 'google-cloudrun-backend', 'deploy-manifest.json')
  ];
  const manifests = manifestPaths
    .map((filePath) => ({ filePath, manifest: readJsonIfExists(filePath) }))
    .filter((entry) => !!entry.manifest);
  if (!manifests.length) {
    throw new Error('no deploy manifests found in dist/');
  }
  const versionKeys = Array.from(new Set(manifests.map((entry) => cleanVersion(entry.manifest && entry.manifest.versionKey)).filter(Boolean)));
  if (versionKeys.length > 1) {
    throw new Error(`version mismatch across dist manifests: ${versionKeys.join(', ')}`);
  }
  const commits = Array.from(new Set(manifests.map((entry) => cleanVersion(entry.manifest && entry.manifest.buildInfo && entry.manifest.buildInfo.commit)).filter(Boolean)));
  if (commits.length > 1) {
    throw new Error(`commit mismatch across dist manifests: ${commits.join(', ')}`);
  }
  const shortCommits = Array.from(new Set(manifests.map((entry) => cleanVersion(entry.manifest && entry.manifest.buildInfo && entry.manifest.buildInfo.shortCommit)).filter(Boolean)));
  if (shortCommits.length > 1) {
    throw new Error(`shortCommit mismatch across dist manifests: ${shortCommits.join(', ')}`);
  }
  const gitHead = cleanVersion(runGit(['rev-parse', 'HEAD']));
  const gitShort = cleanVersion(runGit(['rev-parse', '--short=12', 'HEAD']));
  for (const entry of manifests) {
    const buildInfo = entry.manifest && entry.manifest.buildInfo && typeof entry.manifest.buildInfo === 'object' ? entry.manifest.buildInfo : {};
    const versionKey = cleanVersion(entry.manifest && entry.manifest.versionKey);
    const buildVersion = cleanVersion(buildInfo.shortCommit || buildInfo.versionKey || buildInfo.commit);
    if (!versionKey) {
      throw new Error(`missing versionKey in ${entry.filePath}`);
    }
    if (buildVersion && versionKey !== buildVersion) {
      throw new Error(`versionKey mismatch in ${entry.filePath}: ${versionKey} !== ${buildVersion}`);
    }
    if (gitHead && cleanVersion(buildInfo.commit) && cleanVersion(buildInfo.commit) !== gitHead) {
      throw new Error(`manifest commit mismatch in ${entry.filePath}: ${cleanVersion(buildInfo.commit)} !== ${gitHead}`);
    }
    if (gitShort && cleanVersion(buildInfo.shortCommit) && cleanVersion(buildInfo.shortCommit) !== gitShort) {
      throw new Error(`manifest shortCommit mismatch in ${entry.filePath}: ${cleanVersion(buildInfo.shortCommit)} !== ${gitShort}`);
    }
  }
}

try {
  assertTrackedTreeClean();
  assertDistManifestsAligned();
  runNode('scripts/version-governance-smoke.cjs');
  console.log('release gate passed.');
} catch (error) {
  console.error('release gate failed:', error && error.stack ? error.stack : String(error));
  process.exit(1);
}
