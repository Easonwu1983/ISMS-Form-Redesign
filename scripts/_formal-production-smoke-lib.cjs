const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const LIVE_BASE = String(process.env.ISMS_LIVE_BASE || 'http://140.112.97.150').trim().replace(/\/+$/, '');
const PAGES_BASE = String(process.env.ISMS_CLOUDFLARE_PAGES_BASE || 'https://isms-campus-portal.pages.dev').trim().replace(/\/+$/, '');
const VERSION_BASES = String(process.env.ISMS_VERSION_BASES || `${LIVE_BASE},${PAGES_BASE}`).trim();

function buildFormalEnv() {
  return {
    ...process.env,
    ISMS_LIVE_BASE: LIVE_BASE,
    ISMS_CLOUDFLARE_PAGES_BASE: PAGES_BASE,
    ISMS_VERSION_BASES: VERSION_BASES
  };
}

function runNodeStep(step) {
  const attempts = Number.isFinite(Number(step && step.attempts)) ? Math.max(1, Math.floor(Number(step.attempts))) : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = spawnSync(process.execPath, [path.join(ROOT, step.script)], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: false,
      env: buildFormalEnv()
    });
    if (result.error) throw result.error;
    if (typeof result.status === 'number' && result.status === 0) return;
    if (attempt < attempts) {
      console.warn(`${step.label} attempt ${attempt} failed; retrying...`);
    } else {
      throw new Error(`${step.label} failed with exit code ${result.status}`);
    }
  }
}

function runLayer(layerName, steps) {
  console.log(`formal production ${layerName} smoke bases: live=${LIVE_BASE} pages=${PAGES_BASE}`);
  steps.forEach(runNodeStep);
  console.log(`formal production ${layerName} smoke passed.`);
}

module.exports = {
  LIVE_BASE,
  PAGES_BASE,
  VERSION_BASES,
  buildFormalEnv,
  runNodeStep,
  runLayer
};
