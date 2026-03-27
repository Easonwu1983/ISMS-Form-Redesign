const http = require('http');
const https = require('https');

const DEFAULT_CANDIDATES = [
  'http://127.0.0.1:18080',
  'http://140.112.97.150'
];

function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/.test(parsed.protocol)) return '';
    return parsed.origin;
  } catch (_) {
    return '';
  }
}

function parseCandidateOrigins(rawValue) {
  const list = String(rawValue || '')
    .split(/[\r\n,;]+/)
    .map(normalizeOrigin)
    .filter(Boolean);
  if (!list.length) return DEFAULT_CANDIDATES.slice();
  return Array.from(new Set(list));
}

function matchesExpectedContentType(response, expectedContentType) {
  const expected = String(expectedContentType || '').trim().toLowerCase();
  if (!expected) return true;
  const headerValue = String(response.headers['content-type'] || '').trim().toLowerCase();
  return headerValue.includes(expected);
}

function probeOrigin(origin, probePath, timeoutMs, expectedContentType) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const base = normalizeOrigin(origin);
    if (!base) {
      resolve({ origin: '', ok: false, status: 0, durationMs: 0, error: 'invalid-origin' });
      return;
    }
    const url = new URL(String(probePath || '/').trim() || '/', base);
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      timeout: Number(timeoutMs) || 4000
    }, (response) => {
      const status = Number(response.statusCode) || 0;
      const contentTypeOk = matchesExpectedContentType(response, expectedContentType);
      response.resume();
      resolve({
        origin: base,
        ok: expectedContentType ? status === 200 && contentTypeOk : status === 200 || status === 401,
        status,
        durationMs: Date.now() - startedAt,
        error: contentTypeOk ? '' : `unexpected-content-type:${String(response.headers['content-type'] || '').trim()}`
      });
    });
    request.on('timeout', function () {
      request.destroy(new Error('timeout'));
    });
    request.on('error', function (error) {
      resolve({
        origin: base,
        ok: false,
        status: 0,
        durationMs: Date.now() - startedAt,
        error: error && error.message ? error.message : 'request-failed'
      });
    });
    request.end();
  });
}

async function resolveCampusApiOrigin(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const explicitOrigin = normalizeOrigin(opts.requestedOrigin || '');
  const candidateOrigins = parseCandidateOrigins(opts.candidates || process.env.ISMS_API_UPSTREAMS || '');
  const orderedOrigins = explicitOrigin
    ? [explicitOrigin].concat(candidateOrigins.filter((origin) => origin !== explicitOrigin))
    : candidateOrigins;
  const probePath = String(opts.probePath || '/api/unit-governance?limit=1').trim() || '/api/unit-governance?limit=1';
  const expectedContentType = String(opts.expectedContentType || '').trim().toLowerCase();
  const timeoutMs = Number(opts.timeoutMs) || 4000;
  const results = [];
  for (const origin of orderedOrigins) {
    const result = await probeOrigin(origin, probePath, timeoutMs, expectedContentType);
    results.push(result);
    if (result.ok) {
      return {
        origin: result.origin,
        candidates: results.concat(orderedOrigins.slice(results.length).map((pendingOrigin) => ({
          origin: pendingOrigin,
          ok: false,
          status: 0,
          durationMs: 0,
          error: 'not-probed'
        }))),
        probePath,
        expectedContentType
      };
    }
  }
  return {
    origin: orderedOrigins[0] || DEFAULT_CANDIDATES[0],
    candidates: results,
    probePath,
    expectedContentType
  };
}

module.exports = {
  DEFAULT_CANDIDATES,
  normalizeOrigin,
  parseCandidateOrigins,
  matchesExpectedContentType,
  probeOrigin,
  resolveCampusApiOrigin
};

if (require.main === module) {
  const requestedOrigin = String(process.argv[2] || '').trim();
  const probePath = String(process.argv[3] || '/api/unit-governance?limit=1').trim() || '/api/unit-governance?limit=1';
  const expectedContentType = String(process.argv[4] || '').trim();
  resolveCampusApiOrigin({ requestedOrigin, probePath, expectedContentType }).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
