'use strict';

const http = require('http');
const BASE = process.env.BENCH_URL || 'http://140.112.97.150';
const ADMIN_USER = 'easonwu';
const ADMIN_PASS = '2wsx#EDC';
let token = null;

function req(method, path) {
  return new Promise(function (resolve) {
    const url = new URL(path, BASE);
    const start = Date.now();
    const r = http.request({
      hostname: url.hostname, port: url.port || 80,
      path: url.pathname + url.search, method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      timeout: 30000
    }, function (res) {
      let data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        resolve({ status: res.statusCode, ms: Date.now() - start, bytes: Buffer.byteLength(data), ok: res.statusCode < 400 });
      });
    });
    r.on('error', function (e) { resolve({ status: 0, ms: Date.now() - start, bytes: 0, ok: false, err: e.message }); });
    r.on('timeout', function () { r.destroy(); resolve({ status: 0, ms: Date.now() - start, bytes: 0, ok: false, err: 'timeout' }); });
    if (method === 'POST') {
      r.write(JSON.stringify({ action: 'auth.login', payload: { username: ADMIN_USER, password: ADMIN_PASS } }));
    }
    r.end();
  });
}

async function login() {
  const res = await req('POST', '/api/auth/login');
  if (res.ok) {
    try {
      // parse token from response - need full response
      const url = new URL('/api/auth/login', BASE);
      return new Promise(function (resolve) {
        const body = JSON.stringify({ action: 'auth.login', payload: { username: ADMIN_USER, password: ADMIN_PASS } });
        const r = http.request({
          hostname: url.hostname, port: url.port || 80,
          path: url.pathname, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, function (res) {
          let data = '';
          res.on('data', function (c) { data += c; });
          res.on('end', function () {
            try { const p = JSON.parse(data); token = (p.session && p.session.token) || (p.item && p.item.sessionToken); } catch (_) {}
            resolve(!!token);
          });
        });
        r.on('error', function () { resolve(false); });
        r.write(body); r.end();
      });
    } catch (_) {}
  }
  return false;
}

async function bench(label, path, runs) {
  const times = [];
  const sizes = [];
  for (let i = 0; i < (runs || 5); i++) {
    const r = await req('GET', path);
    if (r.ok) { times.push(r.ms); sizes.push(r.bytes); }
  }
  if (!times.length) return { label, avg: 0, p50: 0, p95: 0, max: 0, size: 0, ok: false };
  times.sort(function (a, b) { return a - b; });
  const avg = Math.round(times.reduce(function (s, t) { return s + t; }, 0) / times.length);
  const size = Math.round(sizes[0] / 1024 * 10) / 10;
  return { label, avg, p50: times[Math.floor(times.length * 0.5)], p95: times[Math.floor(times.length * 0.95)], max: times[times.length - 1], size, ok: true };
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  ISMS 各模組載入速度基準測試                                ║');
  console.log('║  每個端點執行 5 次取平均                                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (!(await login())) { console.error('Login failed'); process.exit(1); }
  console.log('✅ 登入成功\n');

  const tests = [
    // 靜態資源
    { label: '首頁 HTML (index.html)', path: '/' },
    { label: 'CSS (styles.purged.min.css)', path: '/styles.purged.min.css' },
    { label: 'Core Bundle (app-core.bundle.min.js)', path: '/app-core.bundle.min.js' },
    { label: '單位核心 (units-core.json)', path: '/units-core.json' },
    { label: '單位詳細 (units-detail.json)', path: '/units-detail.json' },
    { label: '單位完整 (units-data.json)', path: '/units-data.json' },
    // API - Health
    { label: 'Auth Health', path: '/api/auth/health' },
    { label: 'Training Health', path: '/api/training/health' },
    // API - 資料查詢
    { label: '儀表板 Summary (5 SQL)', path: '/api/dashboard/summary?auditYear=115' },
    { label: '我的待辦 (my-tasks)', path: '/api/my-tasks?auditYear=115' },
    { label: '檢核表列表', path: '/api/checklists?limit=50' },
    { label: '教育訓練列表', path: '/api/training/forms?limit=50' },
    { label: '教育訓練名單', path: '/api/training/rosters?limit=200' },
    { label: '矯正單列表', path: '/api/corrective-actions?limit=50' },
    { label: '帳號管理', path: '/api/system-users?limit=20' },
    { label: '操作軌跡 (heavy)', path: '/api/audit-trail?limit=50' },
    { label: '單位管理人申請', path: '/api/unit-contact/applications?limit=50' },
    { label: '資安窗口盤點', path: '/api/security-window/inventory' },
    { label: '單位治理', path: '/api/unit-governance' },
    { label: '年度結算', path: '/api/audit-year/summary' },
  ];

  console.log('  ' + '端點'.padEnd(40) + 'Avg'.padStart(6) + '  P50'.padStart(6) + '  P95'.padStart(6) + '  Max'.padStart(6) + '  Size'.padStart(8));
  console.log('  ' + '─'.repeat(72));

  const results = [];
  for (const t of tests) {
    const r = await bench(t.label, t.path);
    results.push(r);
    var sizeLabel = r.size >= 1024 ? (Math.round(r.size / 1024 * 10) / 10 + 'MB') : (r.size + 'KB');
    var status = !r.ok ? '❌' : (r.avg < 10 ? '🟢' : (r.avg < 100 ? '🟡' : '🔴'));
    console.log('  ' + status + ' ' + r.label.padEnd(39) + String(r.avg + 'ms').padStart(6) + String(r.p50 + 'ms').padStart(6) + String(r.p95 + 'ms').padStart(6) + String(r.max + 'ms').padStart(6) + String(sizeLabel).padStart(8));
  }

  console.log('\n  ' + '─'.repeat(72));
  var staticResults = results.filter(function (r) { return !r.label.includes('api') && !r.label.includes('Health') && !r.label.includes('Summary') && !r.label.includes('待辦') && !r.label.includes('列表') && !r.label.includes('名單') && !r.label.includes('管理') && !r.label.includes('軌跡') && !r.label.includes('申請') && !r.label.includes('盤點') && !r.label.includes('治理') && !r.label.includes('結算'); });
  var apiResults = results.filter(function (r) { return !staticResults.includes(r); });
  var staticAvg = staticResults.length ? Math.round(staticResults.reduce(function (s, r) { return s + r.avg; }, 0) / staticResults.length) : 0;
  var apiAvg = apiResults.length ? Math.round(apiResults.reduce(function (s, r) { return s + r.avg; }, 0) / apiResults.length) : 0;
  var slowest = results.reduce(function (max, r) { return r.avg > max.avg ? r : max; }, results[0]);

  console.log('\n  📊 摘要');
  console.log('  靜態資源平均：' + staticAvg + 'ms');
  console.log('  API 端點平均：' + apiAvg + 'ms');
  console.log('  最慢端點：' + slowest.label + ' (' + slowest.avg + 'ms)');

  var grade = apiAvg < 20 ? 'A+（極優）' : (apiAvg < 50 ? 'A（優秀）' : (apiAvg < 200 ? 'B（良好）' : 'C（需優化）'));
  console.log('  效能等級：' + grade);
  console.log('');
}

main().catch(function (err) { console.error(err); process.exit(1); });
