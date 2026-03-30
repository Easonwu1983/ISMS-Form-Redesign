const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const LIVE_BASE = String(process.env.ISMS_LIVE_BASE || 'http://140.112.97.150').trim().replace(/\/+$/, '');
const PAGES_BASE = String(process.env.ISMS_CLOUDFLARE_PAGES_BASE || 'https://isms-campus-portal.pages.dev').trim().replace(/\/+$/, '');
const VERSION_BASES = String(process.env.ISMS_VERSION_BASES || `${LIVE_BASE},${PAGES_BASE}`).trim();
const FORMAL_LOG_DIR = path.join(ROOT, 'logs', 'formal-production');
const CAMPUS_LIVE_REPORT_PATH = path.join(ROOT, 'logs', 'campus-live-regression-smoke.json');
const PAGES_REPORT_PATH = path.join(ROOT, 'logs', 'cloudflare-pages-regression-smoke.json');

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

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
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
  const steps = Array.isArray(report && report.steps)
    ? report.steps.map((step) => ({
      label: step.label || '',
      ok: !!step.ok,
      attempts: Number(step.attempts || 1),
      durationMs: Number(step.durationMs || 0),
      error: step.error || ''
    }))
    : [];
  const retryCount = steps.reduce((sum, step) => sum + Math.max(0, Number(step.attempts || 1) - 1), 0);
  const slowestStep = steps.reduce((current, step) => {
    if (!current || step.durationMs > current.durationMs) return step;
    return current;
  }, null);
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
    retryCount,
    slowestStep: slowestStep ? {
      label: slowestStep.label,
      durationMs: Number(slowestStep.durationMs || 0)
    } : null,
    liveBase: report && report.liveBase || LIVE_BASE,
    pagesBase: report && report.pagesBase || PAGES_BASE,
    versions,
    steps
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
    `- retryCount: ${summary.retryCount || 0}`,
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
  if (summary.slowestStep) {
    lines.push('', `- slowestStep: ${summary.slowestStep.label} (${summary.slowestStep.durationMs} ms)`);
  }
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
  const layerNames = ['health', 'api', 'browser', 'a11y', 'visual', 'full'];
  const layers = {};
  layerNames.forEach((layerName) => {
    layers[layerName] = readLatestSummary(layerName);
  });
  const fullSummary = layers.full || (report ? buildLayerSummary(report) : null);
  if (!fullSummary) {
    throw new Error('latest full summary unavailable');
  }
  const versions = Array.isArray(fullSummary && fullSummary.versions) ? fullSummary.versions : [];
  const metrics = buildReleaseMetrics(layers, versions);
  const coverage = buildReleaseCoverage();
  const latencyHighlights = buildLatencyHighlights();
  const cacheSignals = buildCacheSignals();
  return {
    generatedAt: new Date().toISOString(),
    ok: !!(fullSummary && fullSummary.ok),
    liveBase: fullSummary && fullSummary.liveBase || LIVE_BASE,
    pagesBase: fullSummary && fullSummary.pagesBase || PAGES_BASE,
    versionKeys: Array.from(new Set(versions.map((entry) => String(entry && entry.versionKey || '').trim()).filter(Boolean))),
    versions,
    layers,
    metrics,
    coverage,
    latencyHighlights,
    cacheSignals
  };
}

function classifyApiCheckName(name) {
  const value = String(name || '').trim().toLowerCase();
  if (!value) return 'other';
  if (value.startsWith('health:')) return 'health';
  if (value.startsWith('asset:')) return 'assets';
  if (value.startsWith('auth ') || value.startsWith('unit admin login')) return 'auth';
  if (value.includes('system-user')) return 'system-users';
  if (value.includes('review-scopes')) return 'review-scopes';
  if (value.includes('unit-contact')) return 'unit-contact';
  if (value.startsWith('audit-trail')) return 'audit-trail';
  if (value.startsWith('unit-governance')) return 'unit-governance';
  if (value.startsWith('security-window')) return 'security-window';
  if (value.startsWith('checklists')) return 'checklists';
  if (value.startsWith('training-')) return 'training';
  if (value.startsWith('homepage') || value.startsWith('m365 override') || value.startsWith('deploy manifest')) return 'frontend';
  return 'other';
}

function classifyPagesStepName(name) {
  const value = String(name || '').trim().toLowerCase();
  if (!value) return 'other';
  const prefix = value.split(':')[0];
  return prefix || 'other';
}

function buildCoverageBuckets(entries, classifier) {
  const bucketMap = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const name = String(entry && entry.name || '').trim();
    const key = classifier(name);
    const current = bucketMap.get(key) || {
      module: key,
      total: 0,
      failed: 0,
      totalDurationMs: 0,
      slowestName: '',
      slowestDurationMs: 0
    };
    current.total += 1;
    if (!(entry && entry.ok)) current.failed += 1;
    const durationMs = Math.max(0, Number(entry && entry.durationMs || 0));
    current.totalDurationMs += durationMs;
    if (durationMs >= current.slowestDurationMs) {
      current.slowestDurationMs = durationMs;
      current.slowestName = name;
    }
    bucketMap.set(key, current);
  });
  return Array.from(bucketMap.values()).sort((left, right) => {
    if (right.total !== left.total) return right.total - left.total;
    return left.module.localeCompare(right.module);
  });
}

function buildReleaseCoverage() {
  const campusLiveReport = readJsonIfExists(CAMPUS_LIVE_REPORT_PATH);
  const pagesReport = readJsonIfExists(PAGES_REPORT_PATH);
  return {
    api: buildCoverageBuckets(campusLiveReport && campusLiveReport.checks, classifyApiCheckName),
    pages: buildCoverageBuckets(pagesReport && pagesReport.steps, classifyPagesStepName)
  };
}

function buildLatencyHighlights() {
  const campusLiveReport = readJsonIfExists(CAMPUS_LIVE_REPORT_PATH);
  const pagesReport = readJsonIfExists(PAGES_REPORT_PATH);
  const toEntries = function (items, labelKey) {
    return (Array.isArray(items) ? items : [])
      .map((entry) => ({
        label: String(entry && entry[labelKey] || '').trim(),
        durationMs: Math.max(0, Number(entry && entry.durationMs || 0)),
        ok: !!(entry && entry.ok)
      }))
      .filter((entry) => entry.label)
      .sort((left, right) => right.durationMs - left.durationMs)
      .slice(0, 5);
  };
  return {
    apiChecks: toEntries(campusLiveReport && campusLiveReport.checks, 'name'),
    pagesSteps: toEntries(pagesReport && pagesReport.steps, 'name')
  };
}

function buildCacheSignals() {
  const campusLiveReport = readJsonIfExists(CAMPUS_LIVE_REPORT_PATH);
  const pagesReport = readJsonIfExists(PAGES_REPORT_PATH);
  const apiChecks = Array.isArray(campusLiveReport && campusLiveReport.checks) ? campusLiveReport.checks : [];
  const pagesSteps = Array.isArray(pagesReport && pagesReport.steps) ? pagesReport.steps : [];
  const getCacheState = (entry) => String(entry && entry.value && entry.value.cacheState || '').trim();
  const getCacheReason = (entry) => String(entry && entry.value && entry.value.cacheReason || '').trim() || 'unknown';
  const isCacheHitState = (value) => {
    return value === 'hit' || value === 'cached-unfiltered' || value === 'fast-path';
  };
  const getSummaryModule = (entry) => {
    const name = String(entry && entry.name || '').trim().toLowerCase();
    if (name.startsWith('audit-trail summary-only')) return 'audit-trail';
    if (name.startsWith('checklists summary-only')) return 'checklists';
    if (name.startsWith('training-forms summary-only')) return 'training-forms';
    return '';
  };
  const apiSummaryChecks = apiChecks.filter((entry) => /summary/i.test(String(entry && entry.name || '')));
  const apiSummaryOnlyChecks = apiChecks.filter((entry) => /summary-only/i.test(String(entry && entry.name || '')));
  const pagesPagerSteps = pagesSteps.filter((entry) => /pager/i.test(String(entry && entry.name || '')));
  const pagesSummarySteps = pagesSteps.filter((entry) => /summary/i.test(String(entry && entry.name || '')));
  const warmPairs = [
    { label: 'audit-trail summary-only', cold: 'audit-trail summary-only present', warm: 'audit-trail summary-only warm' },
    { label: 'checklists summary-only', cold: 'checklists summary-only present', warm: 'checklists summary-only warm' },
    { label: 'training-forms summary-only', cold: 'training-forms summary-only present', warm: 'training-forms summary-only warm' }
  ].map((pair) => {
    const coldEntry = apiChecks.find((entry) => String(entry && entry.name || '').trim() === pair.cold);
    const warmEntry = apiChecks.find((entry) => String(entry && entry.name || '').trim() === pair.warm);
    if (!coldEntry || !warmEntry) return null;
    const coldMs = Math.max(0, Number(coldEntry && coldEntry.durationMs || 0));
    const warmMs = Math.max(0, Number(warmEntry && warmEntry.durationMs || 0));
    const coldCache = String(coldEntry && coldEntry.value && coldEntry.value.cacheState || '').trim();
    const warmCache = String(warmEntry && warmEntry.value && warmEntry.value.cacheState || '').trim();
    return {
      label: pair.label,
      coldMs: coldMs,
      warmMs: warmMs,
      deltaMs: coldMs - warmMs,
      improved: warmMs < coldMs,
      ok: !!(coldEntry && coldEntry.ok) && !!(warmEntry && warmEntry.ok),
      coldCache: coldCache,
      warmCache: warmCache
    };
  }).filter(Boolean);
  const apiCacheHitStates = apiSummaryOnlyChecks.filter((entry) => isCacheHitState(getCacheState(entry)));
  const apiCacheMissStates = apiSummaryOnlyChecks.filter((entry) => getCacheState(entry) === 'computed');
  const apiCacheMissReasons = apiCacheMissStates.reduce((accumulator, entry) => {
    const reason = getCacheReason(entry);
    accumulator[reason] = Number(accumulator[reason] || 0) + 1;
    return accumulator;
  }, {});
  const apiModuleSignals = Array.from(new Set(apiSummaryOnlyChecks
    .map((entry) => getSummaryModule(entry))
    .filter(Boolean)))
    .sort()
    .map((moduleName) => {
      const entries = apiSummaryOnlyChecks.filter((entry) => getSummaryModule(entry) === moduleName);
      const hitCount = entries.filter((entry) => isCacheHitState(getCacheState(entry))).length;
      const missEntries = entries.filter((entry) => getCacheState(entry) === 'computed');
      const missReasons = missEntries.reduce((accumulator, entry) => {
        const reason = getCacheReason(entry);
        accumulator[reason] = Number(accumulator[reason] || 0) + 1;
        return accumulator;
      }, {});
      const warmState = warmPairs.find((entry) => entry.label === `${moduleName} summary-only`) || null;
      return {
        module: moduleName,
        totalChecks: entries.length,
        hits: hitCount,
        misses: missEntries.length,
        missReasons,
        warmImproved: !!(warmState && warmState.improved),
        warmCache: warmState && warmState.warmCache || '',
        coldMs: warmState && warmState.coldMs || 0,
        warmMs: warmState && warmState.warmMs || 0
      };
    });
  return {
    apiSummaryChecks: apiSummaryChecks.length,
    apiSummaryOnlyChecks: apiSummaryOnlyChecks.length,
    apiSummaryFailed: apiSummaryChecks.filter((entry) => !(entry && entry.ok)).length,
    apiCacheHits: apiCacheHitStates.length,
    apiCacheMisses: apiCacheMissStates.length,
    apiCacheMissReasons,
    apiModuleSignals,
    pagesPagerSteps: pagesPagerSteps.length,
    pagesPagerFailed: pagesPagerSteps.filter((entry) => !(entry && entry.ok)).length,
    pagesSummarySteps: pagesSummarySteps.length,
    warmStateChecks: warmPairs.length,
    warmStateImproved: warmPairs.filter((entry) => entry.improved).length,
    warmStateCacheHits: warmPairs.filter((entry) => isCacheHitState(entry.warmCache)).length,
    warmStateFailed: warmPairs.filter((entry) => !entry.ok).length,
    warmPairs: warmPairs
  };
}

function buildReleaseMetrics(layers, versions) {
  const layerEntries = ['health', 'api', 'browser', 'a11y', 'visual', 'full']
    .map((name) => ({ name, summary: layers && layers[name] }))
    .filter((entry) => entry.summary && typeof entry.summary === 'object');
  const comparableLayers = layerEntries.filter((entry) => entry.name !== 'full');
  const slowestLayer = comparableLayers.reduce((current, entry) => {
    const durationMs = Number(entry.summary && entry.summary.durationMs || 0);
    if (!current || durationMs > current.durationMs) {
      return { name: entry.name, durationMs };
    }
    return current;
  }, null);
  const layerDurations = {};
  let totalRetryCount = 0;
  let totalStepCount = 0;
  const unstableSteps = [];
  layerEntries.forEach((entry) => {
    const summary = entry.summary || {};
    layerDurations[entry.name] = Number(summary.durationMs || 0);
    const steps = Array.isArray(summary.steps) ? summary.steps : [];
    steps.forEach((step) => {
      const attempts = Math.max(1, Number(step && step.attempts || 1));
      const retries = Math.max(0, attempts - 1);
      totalRetryCount += retries;
      totalStepCount += 1;
      if (retries > 0 || !step.ok) {
        unstableSteps.push({
          layer: entry.name,
          label: String(step && step.label || '').trim(),
          ok: !!(step && step.ok),
          retries,
          durationMs: Number(step && step.durationMs || 0)
        });
      }
    });
  });
  const okVersions = versions.filter((entry) => entry && entry.ok);
  const uniqueVersionKeys = Array.from(new Set(okVersions.map((entry) => String(entry && entry.versionKey || '').trim()).filter(Boolean)));
  return {
    totalDurationMs: Number(layers && layers.full && layers.full.durationMs || 0),
    layerDurations,
    slowestLayer,
    totalRetryCount,
    totalStepCount,
    unstableSteps,
    versionConsistent: versions.every((entry) => entry && entry.ok) && uniqueVersionKeys.length <= 1,
    versionEndpointCount: versions.length,
    versionKeyCount: uniqueVersionKeys.length
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
    '## Metrics',
    '',
    `- totalDurationMs: ${releaseReport.metrics && releaseReport.metrics.totalDurationMs || 0}`,
    `- totalStepCount: ${releaseReport.metrics && releaseReport.metrics.totalStepCount || 0}`,
    `- totalRetryCount: ${releaseReport.metrics && releaseReport.metrics.totalRetryCount || 0}`,
    `- versionConsistent: ${releaseReport.metrics && releaseReport.metrics.versionConsistent ? 'yes' : 'no'}`,
    `- slowestLayer: ${releaseReport.metrics && releaseReport.metrics.slowestLayer ? `${releaseReport.metrics.slowestLayer.name} (${releaseReport.metrics.slowestLayer.durationMs} ms)` : 'n/a'}`,
    '',
    '## Coverage',
    '',
    '### API Modules',
    '',
    ...(Array.isArray(releaseReport.coverage && releaseReport.coverage.api) && releaseReport.coverage.api.length
      ? releaseReport.coverage.api.map((entry) => `- ${entry.module}: total=${entry.total}, failed=${entry.failed}, totalDurationMs=${entry.totalDurationMs}, slowest=${entry.slowestName || 'n/a'} (${entry.slowestDurationMs || 0} ms)`)
      : ['- n/a']),
    '',
    '### Pages Modules',
    '',
    ...(Array.isArray(releaseReport.coverage && releaseReport.coverage.pages) && releaseReport.coverage.pages.length
      ? releaseReport.coverage.pages.map((entry) => `- ${entry.module}: total=${entry.total}, failed=${entry.failed}, totalDurationMs=${entry.totalDurationMs}, slowest=${entry.slowestName || 'n/a'} (${entry.slowestDurationMs || 0} ms)`)
      : ['- n/a']),
    '',
    '## Cache Signals',
    '',
    `- apiSummaryChecks: ${releaseReport.cacheSignals && releaseReport.cacheSignals.apiSummaryChecks || 0}`,
    `- apiSummaryOnlyChecks: ${releaseReport.cacheSignals && releaseReport.cacheSignals.apiSummaryOnlyChecks || 0}`,
      `- apiSummaryFailed: ${releaseReport.cacheSignals && releaseReport.cacheSignals.apiSummaryFailed || 0}`,
      `- apiCacheHits: ${releaseReport.cacheSignals && releaseReport.cacheSignals.apiCacheHits || 0}`,
      `- apiCacheMisses: ${releaseReport.cacheSignals && releaseReport.cacheSignals.apiCacheMisses || 0}`,
      `- pagesPagerSteps: ${releaseReport.cacheSignals && releaseReport.cacheSignals.pagesPagerSteps || 0}`,
      `- pagesPagerFailed: ${releaseReport.cacheSignals && releaseReport.cacheSignals.pagesPagerFailed || 0}`,
    `- pagesSummarySteps: ${releaseReport.cacheSignals && releaseReport.cacheSignals.pagesSummarySteps || 0}`,
    `- warmStateChecks: ${releaseReport.cacheSignals && releaseReport.cacheSignals.warmStateChecks || 0}`,
      `- warmStateImproved: ${releaseReport.cacheSignals && releaseReport.cacheSignals.warmStateImproved || 0}`,
      `- warmStateCacheHits: ${releaseReport.cacheSignals && releaseReport.cacheSignals.warmStateCacheHits || 0}`,
      `- warmStateFailed: ${releaseReport.cacheSignals && releaseReport.cacheSignals.warmStateFailed || 0}`,
      '',
      '### Cache Miss Reasons',
      '',
      ...(releaseReport.cacheSignals && releaseReport.cacheSignals.apiCacheMissReasons && Object.keys(releaseReport.cacheSignals.apiCacheMissReasons).length
        ? Object.entries(releaseReport.cacheSignals.apiCacheMissReasons)
          .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0))
          .map(([reason, count]) => `- ${reason}: ${count}`)
        : ['- n/a']),
      '',
      '### API Summary Cache By Module',
      '',
      ...(Array.isArray(releaseReport.cacheSignals && releaseReport.cacheSignals.apiModuleSignals) && releaseReport.cacheSignals.apiModuleSignals.length
        ? releaseReport.cacheSignals.apiModuleSignals
          .map((entry) => {
            const missReasons = entry && entry.missReasons && Object.keys(entry.missReasons).length
              ? Object.entries(entry.missReasons)
                .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0))
                .map(([reason, count]) => `${reason}:${count}`)
                .join(', ')
              : 'n/a';
            return `- ${entry.module}: checks=${entry.totalChecks || 0}, hits=${entry.hits || 0}, misses=${entry.misses || 0}, warmImproved=${entry.warmImproved ? 'yes' : 'no'}, warmCache=${entry.warmCache || 'n/a'}, cold=${entry.coldMs || 0} ms, warm=${entry.warmMs || 0} ms, missReasons=${missReasons}`;
          })
        : ['- n/a']),
      '',
      '### Warm State',
      '',
    ...(Array.isArray(releaseReport.cacheSignals && releaseReport.cacheSignals.warmPairs) && releaseReport.cacheSignals.warmPairs.length
      ? releaseReport.cacheSignals.warmPairs.map((entry) => `- ${entry.label}: cold=${entry.coldMs} ms (${entry.coldCache || 'n/a'}), warm=${entry.warmMs} ms (${entry.warmCache || 'n/a'}), delta=${entry.deltaMs} ms, improved=${entry.improved ? 'yes' : 'no'}, status=${entry.ok ? 'passed' : 'failed'}`)
      : ['- n/a']),
    '',
    '## Latency Hotspots',
    '',
    '### API Checks',
    '',
    ...(Array.isArray(releaseReport.latencyHighlights && releaseReport.latencyHighlights.apiChecks) && releaseReport.latencyHighlights.apiChecks.length
      ? releaseReport.latencyHighlights.apiChecks.map((entry) => `- ${entry.label}: ${entry.durationMs} ms (${entry.ok ? 'passed' : 'failed'})`)
      : ['- n/a']),
    '',
    '### Pages Steps',
    '',
    ...(Array.isArray(releaseReport.latencyHighlights && releaseReport.latencyHighlights.pagesSteps) && releaseReport.latencyHighlights.pagesSteps.length
      ? releaseReport.latencyHighlights.pagesSteps.map((entry) => `- ${entry.label}: ${entry.durationMs} ms (${entry.ok ? 'passed' : 'failed'})`)
      : ['- n/a']),
    '',
    '## Versions',
    ''
  ];
  releaseReport.versions.forEach((entry) => {
    lines.push(`- ${entry.base}: ${entry.ok ? `${entry.versionKey || 'ok'} (${entry.commit || 'no-commit'})` : `error (${entry.status || entry.error || 'unknown'})`}`);
  });
  lines.push('', '## Layers', '');
  ['health', 'api', 'browser', 'a11y', 'visual', 'full'].forEach((layerName) => {
    const summary = releaseReport.layers[layerName];
    if (!summary) {
      lines.push(`- ${layerName}: missing`);
      return;
    }
    lines.push(`- ${layerName}: ${summary.ok ? 'passed' : 'failed'} (${summary.durationMs} ms, retries=${summary.retryCount || 0})`);
  });
  if (releaseReport.metrics && Array.isArray(releaseReport.metrics.unstableSteps) && releaseReport.metrics.unstableSteps.length) {
    lines.push('', '## Unstable Steps', '');
    releaseReport.metrics.unstableSteps.forEach((step) => {
      lines.push(`- ${step.layer}/${step.label}: ${step.ok ? 'passed' : 'failed'} (${step.durationMs} ms, retries=${step.retries})`);
    });
  }
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
    const scriptPath = path.join(ROOT, step.script);
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: ROOT,
      stdio: 'pipe',
      shell: false,
      env: buildFormalEnv(),
      encoding: 'utf8',
      windowsHide: true
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
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
