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

function assertTrackedTreeClean() {
  const status = runGit(['status', '--porcelain=v1', '--untracked-files=no']);
  if (status) {
    throw new Error(`tracked working tree has pending changes:\n${status}`);
  }
}

try {
  assertTrackedTreeClean();
  runNode('scripts/version-governance-smoke.cjs');
  console.log('release gate passed.');
} catch (error) {
  console.error('release gate failed:', error && error.stack ? error.stack : String(error));
  process.exit(1);
}
