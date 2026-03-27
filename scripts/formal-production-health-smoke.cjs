const { runLayer } = require('./_formal-production-smoke-lib.cjs');

const STEPS = [
  { label: 'vm-entry-smoke', script: 'scripts/vm-entry-smoke.cjs' },
  { label: 'cloudflare-live-health-check', script: 'scripts/cloudflare-live-health-check.cjs' }
];

runLayer('health', STEPS).catch((error) => {
  console.error('formal production health smoke failed:', error && error.stack ? error.stack : String(error));
  process.exit(1);
});
