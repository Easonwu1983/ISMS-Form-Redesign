const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = process.cwd();

const STEPS = [
  { label: 'release-gate', command: ['node', path.join(ROOT, 'scripts/release-gate.cjs')] },
  { label: 'test:all', command: ['node', path.join(ROOT, 'scripts/run-test-suite.cjs'), 'all'] }
];

const LIVE_BASE = String(process.env.ISMS_LIVE_BASE || '').trim();
const PAGES_BASE = String(process.env.ISMS_CLOUDFLARE_PAGES_BASE || '').trim();
const TEST_BASE_URL = String(process.env.TEST_BASE_URL || '').trim();
const includeBrowserZoom = TEST_BASE_URL || LIVE_BASE;
const includeStress = TEST_BASE_URL || LIVE_BASE;
const includeLiveSuite = LIVE_BASE && PAGES_BASE;

if (TEST_BASE_URL || LIVE_BASE) {
  STEPS.push({
    label: 'e2e-core-flows',
    command: ['node', path.join(ROOT, 'tests/e2e-core-flows.cjs')]
  });
  STEPS.push({
    label: 'comprehensive-test-suite',
    command: ['node', path.join(ROOT, 'tests/comprehensive-test-suite.cjs')]
  });
}

if (includeBrowserZoom) {
  STEPS.push({
    label: 'browser-zoom-regression',
    command: ['node', path.join(ROOT, 'scripts/browser-zoom-regression.cjs')]
  });
}

if (includeStress) {
  STEPS.push({
    label: 'stress-regression',
    command: ['node', path.join(ROOT, 'scripts/stress-regression.cjs')]
  });
}

if (includeLiveSuite) {
  STEPS.push({
    label: 'live-regression-suite',
    command: ['node', path.join(ROOT, 'scripts/live-regression-suite.cjs')]
  });
}

function runStep(step) {
  console.log(`\n=== ${step.label} ===`);
  const result = spawnSync(process.execPath, step.command.slice(1), {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
    shell: false
  });
  if (result.error) throw result.error;
  if (typeof result.status === 'number' && result.status !== 0) {
    const error = new Error(`${step.label} failed with exit code ${result.status}`);
    error.exitCode = result.status;
    throw error;
  }
}

try {
  for (const step of STEPS) {
    runStep(step);
  }
  if (!includeBrowserZoom) {
    console.log('\nBrowser zoom regression skipped: TEST_BASE_URL or ISMS_LIVE_BASE not set.');
  }
  if (!includeStress) {
    console.log('\nStress regression skipped: TEST_BASE_URL or ISMS_LIVE_BASE not set.');
  }
  if (!includeLiveSuite) {
    console.log('\nLive regression suite skipped: ISMS_LIVE_BASE and ISMS_CLOUDFLARE_PAGES_BASE not both set.');
  }
  console.log('\nCI gate passed.');
} catch (error) {
  console.error('\nCI gate failed:', error.message || error);
  process.exit(typeof error.exitCode === 'number' ? error.exitCode : 1);
}
