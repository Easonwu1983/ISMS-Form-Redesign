const { runLayer } = require('./_formal-production-smoke-lib.cjs');

const STEPS = [
  { label: 'formal-production-health-smoke', script: 'scripts/formal-production-health-smoke.cjs' },
  { label: 'formal-production-api-smoke', script: 'scripts/formal-production-api-smoke.cjs' },
  { label: 'formal-production-browser-smoke', script: 'scripts/formal-production-browser-smoke.cjs' },
  { label: 'formal-production-visual-smoke', script: 'scripts/formal-production-visual-smoke.cjs' }
];

try {
  runLayer('full', STEPS);
} catch (error) {
  console.error('formal production smoke failed:', error && error.stack ? error.stack : String(error));
  process.exit(1);
}
