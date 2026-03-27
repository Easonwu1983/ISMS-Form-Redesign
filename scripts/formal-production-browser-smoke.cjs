const { runLayer } = require('./_formal-production-smoke-lib.cjs');

const STEPS = [
  { label: 'security-regression', script: 'scripts/security-regression.cjs', attempts: 2 }
];

try {
  runLayer('browser', STEPS);
} catch (error) {
  console.error('formal production browser smoke failed:', error && error.stack ? error.stack : String(error));
  process.exit(1);
}
