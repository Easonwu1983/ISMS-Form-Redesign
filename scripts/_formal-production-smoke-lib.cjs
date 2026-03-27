const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const LIVE_BASE = String(process.env.ISMS_LIVE_BASE || 'http://140.112.97.150').trim().replace(/\/+$/, '');
const PAGES_BASE = String(process.env.ISMS_CLOUDFLARE_PAGES_BASE || 'https://isms-campus-portal.pages.dev').trim().replace(/\/+$/, '');
const VERSION_BASES = String(process.env.ISMS_VERSION_BASES || `${LIVE_BASE},${PAGES_BASE}`).trim();
const FORMAL_LOG_DIR = path.join(ROOT, 'logs', 'formal-production');

function buildFormalEnv() {
  return {
    ...process.env,
    ISMS_LIVE_BASE: LIVE_BASE,
    ISMS_CLOUDFLARE_PAGES_BASE: PAGES_BASE,
    ISMS_VERSION_BASES: VERSION_BASES
  };
}

function ensureFormalLogDir() {
  fs.mkdirSync(FORMAL_LOG_DIR, { recursive: true });
}

function buildManifestUrl(base) {
  const safeBase = String(base || '').trim().replace(/\/+$/, '');
  return `${safeBase}/deploy-manifest.json?ts=${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function fetchManifest(base) {
  const safeBase = String(base || '').trim().replace(/\/+$/, '');
  const url = buildManifestUrl(safeBase);
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return {
        base: safeBase,
        url,
        ok: false,
        status: response.status
      };
    }
    const body = await response.json();
    return {
      base: safeBase,
      url,
      ok: true,
      status: response.status,
      versionKey: String(body && body.versionKey || body && body.buildInfo && body.buildInfo.versionKey || '').trim(),
      commit: String(body && body.commit || body && body.buildInfo && body.buildInfo.commit || '').trim()
    };
  } catch (error) {
    return {
      base: safeBase,
      url,
      ok: false,
      error: String(error && error.message || error || 'unknown')
    };
  }
}

async function collectVersionReport() {
  const bases = Array.from(new Set(VERSION_BASES.split(',').map((entry) => String(entry || '').trim()).filter(Boolean)));
  const manifests = await Promise.all(bases.map(fetchManifest));
  return {
    liveBase: LIVE_BASE,
    pagesBase: PAGES_BASE,
    versionBases: bases,
    manifests
  };
}

function writeLayerReport(layerName, report) {
  ensureFormalLogDir();
  const stamp = String(report.startedAt || new Date().toISOString()).replace(/[:.]/g, '-');
  const filePath = path.join(FORMAL_LOG_DIR, `${stamp}-${layerName}.json`);
  const latestPath = path.join(FORMAL_LOG_DIR, `latest-${layerName}.json`);
  const payload = JSON.stringify(report, null, 2);
  fs.writeFileSync(filePath, payload);
  fs.writeFileSync(latestPath, payload);
  return filePath;
}

function runNodeStep(step) {
  const attempts = Number.isFinite(Number(step && step.attempts)) ? Math.max(1, Math.floor(Number(step.attempts))) : 1;
  const attemptResults = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const result = spawnSync(process.execPath, [path.join(ROOT, step.script)], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: false,
      env: buildFormalEnv()
    });
    const durationMs = Date.now() - startedMs;
    attemptResults.push({
      attempt,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs,
      ok: !result.error && typeof result.status === 'number' && result.status === 0,
      status: typeof result.status === 'number' ? result.status : null,
      error: result.error ? String(result.error && result.error.message || result.error) : ''
    });
    if (result.error) {
      return {
        label: step.label,
        script: step.script,
        ok: false,
        attempts,
        durationMs: attemptResults.reduce((sum, item) => sum + Number(item.durationMs || 0), 0),
        attemptsReport: attemptResults,
        error: String(result.error && result.error.message || result.error)
      };
    }
    if (typeof result.status === 'number' && result.status === 0) {
      return {
        label: step.label,
        script: step.script,
        ok: true,
        attempts,
        durationMs: attemptResults.reduce((sum, item) => sum + Number(item.durationMs || 0), 0),
        attemptsReport: attemptResults
      };
    }
    if (attempt < attempts) {
      console.warn(`${step.label} attempt ${attempt} failed; retrying...`);
    }
  }
  const lastAttempt = attemptResults[attemptResults.length - 1] || {};
  return {
    label: step.label,
    script: step.script,
    ok: false,
    attempts,
    durationMs: attemptResults.reduce((sum, item) => sum + Number(item.durationMs || 0), 0),
    attemptsReport: attemptResults,
    error: `${step.label} failed with exit code ${lastAttempt.status}`
  };
}

async function runLayer(layerName, steps) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  console.log(`formal production ${layerName} smoke bases: live=${LIVE_BASE} pages=${PAGES_BASE}`);
  const stepResults = [];
  let failure = null;
  for (const step of steps) {
    const result = runNodeStep(step);
    stepResults.push(result);
    if (!result.ok) {
      failure = new Error(result.error || `${step.label} failed`);
      break;
    }
  }
  const versionReport = await collectVersionReport();
  const report = {
    layer: layerName,
    ok: !failure,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
    liveBase: LIVE_BASE,
    pagesBase: PAGES_BASE,
    versionBases: versionReport.versionBases,
    manifests: versionReport.manifests,
    steps: stepResults
  };
  const reportPath = writeLayerReport(layerName, report);
  console.log(`formal production ${layerName} report: ${path.relative(ROOT, reportPath)}`);
  if (failure) throw failure;
  console.log(`formal production ${layerName} smoke passed.`);
}

module.exports = {
  LIVE_BASE,
  PAGES_BASE,
  VERSION_BASES,
  FORMAL_LOG_DIR,
  buildFormalEnv,
  collectVersionReport,
  runNodeStep,
  runLayer
};
