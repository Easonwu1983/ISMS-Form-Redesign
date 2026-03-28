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

function buildLayerSummary(report) {
  const manifests = Array.isArray(report && report.manifests) ? report.manifests : [];
  const versions = manifests.map((entry) => ({
    base: entry.base || '',
    ok: !!entry.ok,
    versionKey: entry.versionKey || '',
    commit: entry.commit || '',
    status: entry.status || null,
    error: entry.error || ''
  }));
  return {
    layer: String(report && report.layer || '').trim(),
    ok: !!(report && report.ok),
    startedAt: report && report.startedAt || '',
    finishedAt: report && report.finishedAt || '',
    durationMs: Number(report && report.durationMs || 0),
    liveBase: report && report.liveBase || LIVE_BASE,
    pagesBase: report && report.pagesBase || PAGES_BASE,
    versions,
    steps: Array.isArray(report && report.steps)
      ? report.steps.map((step) => ({
        label: step.label || '',
        ok: !!step.ok,
        attempts: Number(step.attempts || 1),
        durationMs: Number(step.durationMs || 0),
        error: step.error || ''
      }))
      : []
  };
}

function writeLayerSummary(layerName, report) {
  ensureFormalLogDir();
  const summary = buildLayerSummary(report);
  const jsonPath = path.join(FORMAL_LOG_DIR, `latest-${layerName}-summary.json`);
  const mdPath = path.join(FORMAL_LOG_DIR, `latest-${layerName}-summary.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  const lines = [
    `# Formal Production ${layerName} Summary`,
    '',
    `- status: ${summary.ok ? 'passed' : 'failed'}`,
    `- startedAt: ${summary.startedAt}`,
    `- finishedAt: ${summary.finishedAt}`,
    `- durationMs: ${summary.durationMs}`,
    `- liveBase: ${summary.liveBase}`,
    `- pagesBase: ${summary.pagesBase}`,
    '',
    '## Versions',
    ''
  ];
  summary.versions.forEach((entry) => {
    lines.push(`- ${entry.base}: ${entry.ok ? (entry.versionKey || 'ok') : `error (${entry.status || entry.error || 'unknown'})`}`);
  });
  lines.push('', '## Steps', '');
  summary.steps.forEach((step) => {
    lines.push(`- ${step.label}: ${step.ok ? 'passed' : 'failed'} (${step.durationMs} ms, attempts=${step.attempts})${step.error ? ` - ${step.error}` : ''}`);
  });
  lines.push('');
  fs.writeFileSync(mdPath, lines.join('\n'));
  return { jsonPath, mdPath };
}

function readLatestSummary(layerName) {
  const filePath = path.join(FORMAL_LOG_DIR, `latest-${layerName}-summary.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function buildReleaseReport(report) {
  const layerNames = ['health', 'api', 'browser', 'visual', 'full'];
  const layers = {};
  layerNames.forEach((layerName) => {
    layers[layerName] = readLatestSummary(layerName);
  });
  const fullSummary = layers.full || buildLayerSummary(report);
  const versions = Array.isArray(fullSummary && fullSummary.versions) ? fullSummary.versions : [];
  return {
    generatedAt: new Date().toISOString(),
    ok: !!(fullSummary && fullSummary.ok),
    liveBase: fullSummary && fullSummary.liveBase || LIVE_BASE,
    pagesBase: fullSummary && fullSummary.pagesBase || PAGES_BASE,
    versionKeys: Array.from(new Set(versions.map((entry) => String(entry && entry.versionKey || '').trim()).filter(Boolean))),
    versions,
    layers
  };
}

function writeReleaseReport(report) {
  ensureFormalLogDir();
  const releaseReport = buildReleaseReport(report);
  const jsonPath = path.join(FORMAL_LOG_DIR, 'latest-release-report.json');
  const mdPath = path.join(FORMAL_LOG_DIR, 'latest-release-report.md');
  fs.writeFileSync(jsonPath, JSON.stringify(releaseReport, null, 2));
  const lines = [
    '# Formal Production Release Report',
    '',
    `- generatedAt: ${releaseReport.generatedAt}`,
    `- status: ${releaseReport.ok ? 'passed' : 'failed'}`,
    `- liveBase: ${releaseReport.liveBase}`,
    `- pagesBase: ${releaseReport.pagesBase}`,
    `- versionKeys: ${releaseReport.versionKeys.join(', ') || 'n/a'}`,
    '',
    '## Versions',
    ''
  ];
  releaseReport.versions.forEach((entry) => {
    lines.push(`- ${entry.base}: ${entry.ok ? `${entry.versionKey || 'ok'} (${entry.commit || 'no-commit'})` : `error (${entry.status || entry.error || 'unknown'})`}`);
  });
  lines.push('', '## Layers', '');
  ['health', 'api', 'browser', 'visual', 'full'].forEach((layerName) => {
    const summary = releaseReport.layers[layerName];
    if (!summary) {
      lines.push(`- ${layerName}: missing`);
      return;
    }
    lines.push(`- ${layerName}: ${summary.ok ? 'passed' : 'failed'} (${summary.durationMs} ms)`);
  });
  lines.push('');
  fs.writeFileSync(mdPath, lines.join('\n'));
  return { jsonPath, mdPath };
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
  const summaryPaths = writeLayerSummary(layerName, report);
  console.log(`formal production ${layerName} report: ${path.relative(ROOT, reportPath)}`);
  console.log(`formal production ${layerName} summary: ${path.relative(ROOT, summaryPaths.jsonPath)}`);
  if (failure) throw failure;
  console.log(`formal production ${layerName} smoke passed.`);
  return report;
}

module.exports = {
  LIVE_BASE,
  PAGES_BASE,
  VERSION_BASES,
  FORMAL_LOG_DIR,
  buildFormalEnv,
  collectVersionReport,
  runNodeStep,
  runLayer,
  writeReleaseReport
};
