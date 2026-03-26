const http = require('http');
const https = require('https');
const { URL } = require('url');
const net = require('net');
const { getBuildInfo } = require('./scripts/build-version-info.cjs');

const LISTEN_PORT = Number(process.env.ISMS_GATEWAY_PORT || 8088);
const UPSTREAM_HOST = process.env.ISMS_UPSTREAM_HOST || '127.0.0.1';
const UPSTREAM_PORT = Number(process.env.ISMS_UPSTREAM_PORT || 18080);
const FRONTEND_BASE = String(
  process.env.ISMS_FRONTEND_BASE
  || process.env.ISMS_CAMPUS_FRONTEND_BASE
  || 'https://isms-campus-portal.pages.dev'
).trim().replace(/\/+$/, '');
const ALLOWED_IPV4_CIDRS = [
  '127.0.0.0/8',
  '140.112.0.0/16'
];
const ALLOWED_IPV6_PREFIXES = [
  '::1',
  '2001:288:'
];
const buildInfo = getBuildInfo('campus-gateway', process.cwd());

function buildSecurityHeaders(pathname) {
  const path = String(pathname || '');
  const isApi = path.startsWith('/api/');
  const isHtml = path === '/' || path.endsWith('.html') || (!path.includes('.') && !isApi);
  const headers = {
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), usb=(), payment=(), browsing-topics=()',
    'cross-origin-embedder-policy': 'require-corp',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin'
  };
  if (isApi || isHtml || path.endsWith('m365-config.override.js') || path === '/deploy-manifest.json') {
    headers['cache-control'] = 'no-store, no-cache, must-revalidate';
    headers['pragma'] = 'no-cache';
  }
  if (isHtml) {
    headers['content-security-policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https://ntums365.sharepoint.com; connect-src 'self' https://ntums365.sharepoint.com; font-src 'self' data: https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'; child-src 'none';";
  }
  return headers;
}

function normalizeRemoteAddress(remoteAddress) {
  const value = String(remoteAddress || '').trim().toLowerCase();
  if (!value) return '';
  if (value.startsWith('::ffff:')) return value.slice(7);
  const percentIndex = value.indexOf('%');
  return percentIndex >= 0 ? value.slice(0, percentIndex) : value;
}

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => ((acc << 8) >>> 0) + Number(part), 0) >>> 0;
}

function matchesIpv4Cidr(ip, cidr) {
  const [network, prefixRaw] = String(cidr).split('/');
  const prefix = Number(prefixRaw);
  if (net.isIP(ip) !== 4 || net.isIP(network) !== 4 || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }
  const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(network) & mask);
}

function isAllowedRemoteAddress(remoteAddress) {
  const ip = normalizeRemoteAddress(remoteAddress);
  if (!ip) return false;
  if (net.isIP(ip) === 4) {
    return ALLOWED_IPV4_CIDRS.some((cidr) => matchesIpv4Cidr(ip, cidr));
  }
  if (ip === '::1') return true;
  return ALLOWED_IPV6_PREFIXES.some((prefix) => ip.startsWith(prefix));
}

function shouldReturnHtml(req) {
  const accept = String((req && req.headers && req.headers.accept) || '').toLowerCase();
  const pathname = String(req && req.url || '');
  if (pathname.startsWith('/api/')) return false;
  return accept.includes('text/html') || accept.includes('*/*');
}

function normalizeRequestTarget(reqUrl) {
  const raw = String(reqUrl || '').trim();
  if (!raw) return '/';
  if (raw === '//') return '/';
  if (raw.startsWith('//')) return `/${raw.replace(/^\/+/, '')}`;
  try {
    const parsed = new URL(raw, 'http://localhost');
    return `${parsed.pathname || '/'}${parsed.search || ''}`;
  } catch (_) {
    return '/';
  }
}

function writeForbiddenHtml(res, ip) {
  const payload = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>存取受限</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at top, rgba(20, 78, 153, 0.10), transparent 42%),
        linear-gradient(180deg, #f7f9fc 0%, #eef3f8 100%);
      font-family: "Noto Sans TC", "Segoe UI", sans-serif;
      color: #17324d;
    }
    .card {
      width: min(92vw, 640px);
      padding: 32px;
      border: 1px solid rgba(23, 50, 77, 0.12);
      border-radius: 24px;
      background: rgba(255, 255, 255, 0.94);
      box-shadow: 0 18px 50px rgba(32, 64, 104, 0.12);
    }
    .eyebrow {
      display: inline-block;
      margin-bottom: 14px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(20, 78, 153, 0.08);
      color: #1f4f87;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.18em;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 32px;
      line-height: 1.15;
    }
    p {
      margin: 0 0 12px;
      line-height: 1.7;
      color: #4a617a;
    }
    .meta {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid rgba(23, 50, 77, 0.10);
      font-size: 14px;
      color: #6a7f95;
    }
    code {
      padding: 2px 6px;
      border-radius: 8px;
      background: rgba(20, 78, 153, 0.08);
      color: #1c4c80;
      font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="eyebrow">CAMPUS ACCESS ONLY</div>
    <h1>此系統僅開放校內網路存取</h1>
    <p>目前偵測到的來源 IP 不在允許清單內，因此系統拒絕連線。</p>
    <p>若你是校內同仁，請先確認已連上校內網路或校內 VPN，再重新整理頁面。</p>
    <div class="meta">來源位址：<code>${ip || 'unknown'}</code></div>
  </main>
</body>
</html>`;
  res.writeHead(403, {
    ...buildSecurityHeaders('/'),
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function writeDeployManifest(res) {
  const payload = JSON.stringify({
    builtAt: buildInfo.builtAt,
    versionKey: buildInfo.versionKey,
    buildInfo,
    platform: 'campus-gateway',
    backendBase: `http://${UPSTREAM_HOST}:${UPSTREAM_PORT}`,
    assetIntegrity: {}
  }, null, 2);
  res.writeHead(200, {
    ...buildSecurityHeaders('/deploy-manifest.json'),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function writeM365Override(res) {
  const payload = `(function () {
  window.__M365_UNIT_CONTACT_CONFIG_OVERRIDE__ = {
    activeProfile: 'a3CampusBackend',
    strictRemoteData: true,
    unitContactMode: 'm365-api',
    unitContactSubmitEndpoint: '/api/unit-contact/apply',
    unitContactStatusEndpoint: '/api/unit-contact/status',
    unitContactStatusLookupMethod: 'POST',
    correctiveActionsMode: 'm365-api',
    correctiveActionsEndpoint: '/api/corrective-actions',
    correctiveActionsHealthEndpoint: '/api/corrective-actions/health',
    checklistMode: 'm365-api',
    checklistEndpoint: '/api/checklists',
    checklistHealthEndpoint: '/api/checklists/health',
    trainingMode: 'm365-api',
    trainingFormsEndpoint: '/api/training/forms',
    trainingRostersEndpoint: '/api/training/rosters',
    trainingHealthEndpoint: '/api/training/health',
    authMode: 'm365-api',
    authEndpoint: '/api/auth',
    authHealthEndpoint: '/api/auth/health',
    systemUsersMode: 'm365-api',
    systemUsersEndpoint: '/api/system-users',
    systemUsersHealthEndpoint: '/api/system-users/health',
    reviewScopesMode: 'm365-api',
    reviewScopesEndpoint: '/api/review-scopes',
    reviewScopesHealthEndpoint: '/api/review-scopes/health',
    attachmentsMode: 'm365-api',
    attachmentsEndpoint: '/api/attachments',
    attachmentsHealthEndpoint: '/api/attachments/health'
  };
})();`;
  res.writeHead(200, {
    ...buildSecurityHeaders('/m365-config.override.js'),
    'Content-Type': 'application/javascript; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function writeForbiddenJson(res, ip) {
  const payload = JSON.stringify({
    ok: false,
    error: 'forbidden',
    message: 'Only campus IP addresses are allowed.',
    remoteAddress: ip
  });
  res.writeHead(403, {
    ...buildSecurityHeaders('/api/forbidden'),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function writeForbidden(req, res, ip) {
  if (shouldReturnHtml(req)) {
    writeForbiddenHtml(res, ip);
    return;
  }
  writeForbiddenJson(res, ip);
}

function proxyRequest(req, res, remoteAddress) {
  const targetUrl = new URL(normalizeRequestTarget(req.url), `http://${UPSTREAM_HOST}:${UPSTREAM_PORT}`);
  const isApiRoute = targetUrl.pathname === '/deploy-manifest.json' || targetUrl.pathname.startsWith('/api/');
  const upstreamBase = isApiRoute ? `http://${UPSTREAM_HOST}:${UPSTREAM_PORT}` : FRONTEND_BASE;
  const upstreamUrl = new URL(`${targetUrl.pathname}${targetUrl.search}`, upstreamBase);
  const transport = upstreamUrl.protocol === 'https:' ? https : http;
  const upstream = transport.request({
    protocol: upstreamUrl.protocol,
    hostname: upstreamUrl.hostname,
    port: upstreamUrl.port,
    method: req.method,
    path: `${upstreamUrl.pathname}${upstreamUrl.search}`,
    headers: {
      ...req.headers,
      host: upstreamUrl.host,
      'x-forwarded-for': remoteAddress,
      'x-forwarded-proto': upstreamUrl.protocol === 'https:' ? 'https' : 'http'
    }
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, {
      ...upstreamRes.headers,
      ...buildSecurityHeaders(targetUrl.pathname)
    });
    upstreamRes.pipe(res);
  });

  upstream.on('error', (error) => {
    const payload = JSON.stringify({
      ok: false,
      error: 'bad_gateway',
      message: error.message
    });
    if (!res.headersSent) {
      res.writeHead(502, {
        ...buildSecurityHeaders('/api/bad-gateway'),
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload)
      });
    }
    res.end(payload);
  });

  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const remoteAddress = normalizeRemoteAddress(req.socket.remoteAddress);
  const targetUrl = new URL(normalizeRequestTarget(req.url), `http://${UPSTREAM_HOST}:${UPSTREAM_PORT}`);
  if (targetUrl.pathname === '/deploy-manifest.json') {
    writeDeployManifest(res);
    return;
  }
  if (targetUrl.pathname === '/m365-config.override.js') {
    writeM365Override(res);
    return;
  }
  if (!isAllowedRemoteAddress(remoteAddress)) {
    console.warn(`[gateway] blocked ${remoteAddress} ${req.method} ${req.url}`);
    writeForbidden(req, res, remoteAddress);
    return;
  }
  console.log(`[gateway] allow ${remoteAddress} ${req.method} ${req.url}`);
  proxyRequest(req, res, remoteAddress);
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(`[gateway] listening on http://0.0.0.0:${LISTEN_PORT}`);
  console.log(`[gateway] upstream http://${UPSTREAM_HOST}:${UPSTREAM_PORT}`);
});
