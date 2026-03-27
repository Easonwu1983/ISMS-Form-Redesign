const { runLayer } = require('./_formal-production-smoke-lib.cjs');

const STEPS = [
  { label: 'cloudflare-pages-regression-smoke', script: 'scripts/cloudflare-pages-regression-smoke.cjs', attempts: 2 }
];

runLayer('visual', STEPS).catch((error) => {
  console.error('formal production visual smoke failed:', error && error.stack ? error.stack : String(error));
  process.exit(1);
});
