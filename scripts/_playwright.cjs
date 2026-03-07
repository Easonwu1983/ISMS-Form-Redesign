const path = require('path');

function loadPlaywright() {
  const candidates = [
    'playwright',
    path.join(process.cwd(), 'node_modules', 'playwright'),
    path.join(process.cwd(), '.codex-playwright', 'node_modules', 'playwright')
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (_) { }
  }
  throw new Error('Cannot find playwright. Install it in node_modules or .codex-playwright/node_modules.');
}

module.exports = loadPlaywright();
