const fs = require('fs');
const path = require('path');
const {
  createArtifactRun,
  createResultEnvelope,
  finalizeResults,
  runStep,
  writeJson
} = require('./_role-test-utils.cjs');

const OUT_DIR = createArtifactRun('vm-entry-smoke').outDir;
const RESULT_PATH = path.join(OUT_DIR, 'vm-entry-smoke.json');
const BASE_URL = String(process.env.ISMS_VM_BASE || process.env.ISMS_LIVE_BASE || 'http://140.112.97.150').trim().replace(/\/+$/, '');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, attempts = 3) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
      const text = await response.text();
      if (!response.ok && response.status >= 500 && i < attempts - 1) {
        await wait(500 * (i + 1));
        continue;
      }
      return { response, text };
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await wait(500 * (i + 1));
        continue;
      }
    }
  }
  throw lastError || new Error('fetch failed');
}

async function fetchJson(url) {
  const { response, text } = await fetchText(url);
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  return { response, text, json };
}

function assertPdf(textBytes) {
  if (textBytes.length < 1024) {
    throw new Error('PDF too small');
  }
  if (textBytes.slice(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('Not a PDF');
  }
}

(async () => {
  const results = createResultEnvelope({ steps: [], targets: [BASE_URL] });

  try {
    await runStep(results, 'homepage', 'VM entry', 'homepage reachable', async () => {
      const { response, text } = await fetchText(`${BASE_URL}/`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!text.includes('內部稽核管考追蹤系統')) throw new Error('homepage title missing');
      return { status: response.status };
    }, { critical: true });

    await runStep(results, 'deploy-manifest', 'VM entry', 'deploy manifest matches runtime', async () => {
      const { response, json } = await fetchJson(`${BASE_URL}/deploy-manifest.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buildInfo = json && json.buildInfo && typeof json.buildInfo === 'object' ? json.buildInfo : {};
      const versionKey = String(json && json.versionKey || buildInfo.versionKey || '').trim();
      if (!versionKey) throw new Error('versionKey missing');
      if (!buildInfo.commit) throw new Error('commit missing');
      return { status: response.status, versionKey };
    }, { critical: true });

    await runStep(results, 'm365-override', 'VM entry', 'override profile served', async () => {
      const { response, text } = await fetchText(`${BASE_URL}/m365-config.override.js`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!text.includes("activeProfile: 'a3CampusBackend'")) throw new Error('activeProfile missing');
      return { status: response.status };
    }, { critical: true });

    await runStep(results, 'authorization-pdf', 'VM entry', 'authorization PDF downloadable', async () => {
      const response = await fetch(`${BASE_URL}/unit-contact-authorization-template.pdf`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      assertPdf(bytes);
      return { status: response.status, bytes: bytes.length, contentType: response.headers.get('content-type') || '' };
    }, { critical: true });

    for (const endpoint of [
      '/api/unit-contact/health',
      '/api/corrective-actions/health',
      '/api/checklists/health',
      '/api/training/health',
      '/api/system-users/health',
      '/api/auth/health',
      '/api/audit-trail/health',
      '/api/review-scopes/health'
    ]) {
      await runStep(results, endpoint, 'VM entry', `${endpoint} ready`, async () => {
        const { response, json } = await fetchJson(`${BASE_URL}${endpoint}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (!json || json.ready !== true) throw new Error(`${endpoint} not ready`);
        return { status: response.status, ready: true };
      }, { critical: true });
    }

    results.ok = true;
  } catch (error) {
    results.ok = false;
    results.error = String(error && error.stack ? error.stack : error);
    throw error;
  } finally {
    results.finishedAt = new Date().toISOString();
    writeJson(RESULT_PATH, finalizeResults(results));
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
