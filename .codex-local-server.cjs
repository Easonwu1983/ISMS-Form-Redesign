const http = require('http');
const fs = require('fs');
const path = require('path');
const { getBuildInfo } = require('./scripts/build-version-info.cjs');

const root = process.cwd();
const port = Number(process.env.PORT) || 8080;
const host = '127.0.0.1';
const buildInfo = getBuildInfo('codex-local-server', root);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function safePath(urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  const cleaned = decoded === '/' ? '/index.html' : decoded;
  const resolved = path.normalize(path.join(root, cleaned));
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

function writeManifest(res) {
  const payload = JSON.stringify({
    builtAt: buildInfo.builtAt,
    versionKey: buildInfo.versionKey,
    buildInfo,
    platform: 'codex-local-server',
    source: 'repo-root',
    assetIntegrity: {}
  }, null, 2);
  res.writeHead(200, {
    'Content-Type': mime['.json'],
    'Cache-Control': 'no-store, no-cache, must-revalidate'
  });
  res.end(payload);
}

const server = http.createServer((req, res) => {
  const filePath = safePath(req.url);
  const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  if (requestPath === '/m365-config.override.js') {
    res.writeHead(200, { 'Content-Type': mime['.js'] });
    res.end('(function(){ window.__M365_UNIT_CONTACT_CONFIG_OVERRIDE__ = window.__M365_UNIT_CONTACT_CONFIG_OVERRIDE__ || {}; })();');
    return;
  }

  if (requestPath === '/deploy-manifest.json') {
    writeManifest(res);
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(port, host, () => {
  console.log(`Serving ${root} at http://${host}:${port}`);
});
