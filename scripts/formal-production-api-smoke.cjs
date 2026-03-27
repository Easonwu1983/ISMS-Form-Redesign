const { runLayer } = require('./_formal-production-smoke-lib.cjs');

const STEPS = [
  { label: 'campus-live-regression-smoke', script: 'scripts/campus-live-regression-smoke.cjs', attempts: 2 },
  { label: 'version-governance-smoke', script: 'scripts/version-governance-smoke.cjs' }
];

try {
  runLayer('api', STEPS);
} catch (error) {
  console.error('formal production api smoke failed:', error && error.stack ? error.stack : String(error));
  process.exit(1);
}
