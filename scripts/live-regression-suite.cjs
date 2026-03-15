const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = process.cwd();

const SUITE = [
  { label: 'campus-live-regression-smoke', script: 'scripts/campus-live-regression-smoke.cjs' },
  { label: 'live-security-smoke', script: 'scripts/live-security-smoke.cjs' },
  { label: 'cloudflare-pages-regression-smoke', script: 'scripts/cloudflare-pages-regression-smoke.cjs' },
  { label: 'campus-browser-regression-smoke', script: 'scripts/campus-browser-regression-smoke.cjs' },
  { label: 'unit-contact-public-visual-smoke', script: 'scripts/unit-contact-public-visual-smoke.cjs' },
  { label: 'campus-unit-contact-public-visual-smoke', script: 'scripts/campus-unit-contact-public-visual-smoke.cjs' },
  { label: 'unit-contact-account-to-fill-smoke', script: 'scripts/unit-contact-account-to-fill-smoke.cjs' }
];

function runScript(entry) {
  console.log(`\n=== ${entry.label} ===`);
  const result = spawnSync(process.execPath, [path.join(ROOT, entry.script)], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });
  if (result.error) throw result.error;
  if (typeof result.status === 'number' && result.status !== 0) {
    const error = new Error(`${entry.label} failed with exit code ${result.status}`);
    error.exitCode = result.status;
    throw error;
  }
}

try {
  for (const entry of SUITE) {
    runScript(entry);
  }
  console.log('\nAll live regression suites passed.');
} catch (error) {
  console.error('\nLive regression suite failed:', error.message || error);
  process.exit(typeof error.exitCode === 'number' ? error.exitCode : 1);
}
