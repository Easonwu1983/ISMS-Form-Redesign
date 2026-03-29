const { runLayer } = require('./_formal-production-smoke-lib.cjs');

const STEPS = [
  { label: 'accessibility-regression', script: 'scripts/accessibility-regression.cjs' },
  { label: 'accessibility-axe-regression', script: 'scripts/accessibility-axe-regression.cjs' }
];

runLayer('a11y', STEPS).catch((error) => {
  console.error('formal production a11y smoke failed:', error && error.stack ? error.stack : String(error));
  process.exit(1);
});
