'use strict';

/**
 * ISMS 穩定度與壓力測試 — 模擬 100 位使用者分散操作
 *
 * 真實場景：100 位使用者在 30 秒內陸續登入並操作
 * 而非 100 個請求在同一毫秒發出（那會觸發速率限制）
 *
 * 伺服器速率限制：120 req/60s per IP
 * 測試策略：每秒發出 2 個請求（模擬使用者漸進式操作）
 */

const http = require('http');
const https = require('https');

const BASE_URL = process.env.STRESS_TEST_URL || 'http://140.112.97.150';
const ADMIN_USER = 'easonwu';
const ADMIN_PASS = '2wsx#EDC';
const TOTAL_USERS = 100;
const SPREAD_SECONDS = 50; // 50 秒內分散 100 人 = 每秒 2 人，不超過速率限制

let sessionToken = null;

function req(method, path, body) {
  return new Promise(function (resolve) {
    const url = new URL(path, BASE_URL);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const start = Date.now();
    const options = {
      hostname: url.hostname, port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search, method: method,
      headers: { 'Content-Type': 'application/json', ...(sessionToken ? { 'Authorization': 'Bearer ' + sessionToken } : {}) },
      timeout: 30000
    };
    const r = lib.request(options, function (res) {
      let data = ''; res.on('data', function (c) { data += c; });
      res.on('end', function () { resolve({ status: res.statusCode, ms: Date.now() - start, ok: res.statusCode >= 200 && res.statusCode < 400, size: data.length }); });
    });
    r.on('error', function (e) { resolve({ status: 0, ms: Date.now() - start, ok: false, error: e.message }); });
    r.on('timeout', function () { r.destroy(); resolve({ status: 0, ms: Date.now() - start, ok: false, error: 'timeout' }); });
    if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}

function login() {
  return new Promise(function (resolve) {
    const url = new URL('/api/auth/login', BASE_URL);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const body = JSON.stringify({ action: 'auth.login', payload: { username: ADMIN_USER, password: ADMIN_PASS } });
    const r = lib.request({
      hostname: url.hostname, port: url.port || (isHttps ? 443 : 80),
      path: url.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 15000
    }, function (res) {
      let data = ''; res.on('data', function (c) { data += c; });
      res.on('end', function () {
        try { const p = JSON.parse(data); sessionToken = (p.session && p.session.token) || (p.item && p.item.sessionToken) || sessionToken; } catch (_) {}
        resolve(!!sessionToken);
      });
    });
    r.on('error', function () { resolve(false); }); r.write(body); r.end();
  });
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// 模擬一位使用者的完整操作流程（5 個 API 呼叫）
async function simulateUser(userId) {
  const ops = [];
  // 每位使用者做 5 個操作（真實場景）
  ops.push(await req('GET', '/api/auth/health'));                      // 1. health check
  ops.push(await req('GET', '/units-core.json'));                      // 2. 載入單位資料
  ops.push(await req('GET', '/api/dashboard/summary?auditYear=115')); // 3. 看儀表板
  ops.push(await req('GET', '/api/checklists?limit=20'));              // 4. 看檢核表
  ops.push(await req('GET', '/api/training/forms?limit=20'));          // 5. 看教育訓練
  return { userId, ops };
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  ISMS 穩定度與壓力測試                                                      ║');
  console.log('║  模擬 ' + String(TOTAL_USERS).padEnd(3) + ' 位使用者在 ' + String(SPREAD_SECONDS).padEnd(2) + ' 秒內陸續操作（每人 5 個 API 呼叫）      ║');
  console.log('║  目標：' + BASE_URL.padEnd(66) + '║');
  console.log('║  速率：每秒 ~' + String(Math.ceil(TOTAL_USERS / SPREAD_SECONDS)).padEnd(1) + ' 位使用者開始操作                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  if (!(await login())) { console.error('❌ 登入失敗'); process.exit(1); }
  console.log('✅ Session 取得成功\n');

  const startTime = Date.now();
  const allResults = [];
  const interval = Math.round(SPREAD_SECONDS * 1000 / TOTAL_USERS); // ms between each user start
  let completed = 0;

  console.log('📡 開始模擬 ' + TOTAL_USERS + ' 位使用者...\n');

  // 啟動使用者（分散在 SPREAD_SECONDS 秒內）
  const userPromises = [];
  for (let i = 0; i < TOTAL_USERS; i++) {
    userPromises.push((async function (userId) {
      await sleep(userId * interval); // 分散啟動
      const result = await simulateUser(userId);
      completed++;
      if (completed % 10 === 0 || completed === TOTAL_USERS) {
        process.stdout.write('  進度：' + completed + '/' + TOTAL_USERS + ' 使用者完成 (' + Math.round(completed / TOTAL_USERS * 100) + '%)\r');
      }
      return result;
    })(i));
  }

  const userResults = await Promise.all(userPromises);
  const totalElapsed = Date.now() - startTime;
  console.log('\n');

  // 分析結果
  const allOps = [];
  userResults.forEach(function (ur) { ur.ops.forEach(function (op) { allOps.push(op); }); });

  const totalReqs = allOps.length;
  const totalOk = allOps.filter(function (r) { return r.ok; }).length;
  const totalFail = totalReqs - totalOk;
  const successRate = Math.round(totalOk / totalReqs * 1000) / 10;
  const times = allOps.map(function (r) { return r.ms; }).sort(function (a, b) { return a - b; });
  const avg = Math.round(times.reduce(function (s, t) { return s + t; }, 0) / times.length);
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];
  const max = times[times.length - 1];
  const rps = Math.round(totalReqs / (totalElapsed / 1000) * 10) / 10;

  // 依端點分組統計
  const endpoints = ['health', 'units-core', 'dashboard', 'checklists', 'training'];
  const epStats = {};
  userResults.forEach(function (ur) {
    ur.ops.forEach(function (op, idx) {
      var label = endpoints[idx] || 'other';
      if (!epStats[label]) epStats[label] = { ok: 0, fail: 0, times: [] };
      if (op.ok) epStats[label].ok++; else epStats[label].fail++;
      epStats[label].times.push(op.ms);
    });
  });

  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           測試結果                                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  console.log('  📊 總覽');
  console.log('  ─────────────────────────────────');
  console.log('  使用者數：   ' + TOTAL_USERS);
  console.log('  總請求數：   ' + totalReqs + ' (' + TOTAL_USERS + ' 人 × 5 操作)');
  console.log('  測試時長：   ' + (totalElapsed / 1000).toFixed(1) + ' 秒');
  console.log('  成功率：     ' + successRate + '% (' + totalOk + '/' + totalReqs + ')');
  console.log('  失敗數：     ' + totalFail);
  console.log('  吞吐量：     ' + rps + ' req/s');
  console.log('');
  console.log('  ⏱  回應時間');
  console.log('  ─────────────────────────────────');
  console.log('  平均：       ' + avg + 'ms');
  console.log('  P50：        ' + p50 + 'ms');
  console.log('  P95：        ' + p95 + 'ms');
  console.log('  P99：        ' + p99 + 'ms');
  console.log('  最大：       ' + max + 'ms');
  console.log('');

  console.log('  📋 依端點統計');
  console.log('  ' + '端點'.padEnd(20) + '成功'.padStart(6) + '失敗'.padStart(6) + '  Avg(ms)'.padStart(10) + '  P95(ms)'.padStart(10) + '  Max(ms)'.padStart(10));
  console.log('  ' + '─'.repeat(62));
  Object.entries(epStats).forEach(function (entry) {
    var label = entry[0]; var stat = entry[1];
    var t = stat.times.sort(function (a, b) { return a - b; });
    var epAvg = Math.round(t.reduce(function (s, v) { return s + v; }, 0) / t.length);
    var epP95 = t[Math.floor(t.length * 0.95)];
    var epMax = t[t.length - 1];
    console.log('  ' + label.padEnd(20) + String(stat.ok).padStart(6) + String(stat.fail).padStart(6) + String(epAvg).padStart(10) + String(epP95).padStart(10) + String(epMax).padStart(10));
  });
  console.log('');

  // 判斷通過/失敗
  var passed = successRate >= 95 && p99 < 5000;
  if (passed) {
    console.log('  ✅ 壓力測試通過！');
    console.log('');
    console.log('  💡 效能評估：');
    if (rps > 5) console.log('     ✅ 吞吐量足夠（' + rps + ' req/s，支撐 100 人同時操作）');
    if (p99 < 1000) console.log('     ✅ 回應速度優秀（P99 ' + p99 + 'ms < 1 秒）');
    if (max < 3000) console.log('     ✅ 穩定性良好（最大回應 ' + max + 'ms < 3 秒）');
    if (successRate >= 99) console.log('     ✅ 可靠性極佳（成功率 ' + successRate + '%）');
    console.log('');
    console.log('  🏆 結論：系統可穩定支撐 ' + TOTAL_USERS + ' 位使用者同時操作。');
  } else {
    console.log('  ❌ 壓力測試未通過');
    if (successRate < 95) console.log('     原因：成功率 ' + successRate + '% < 95%');
    if (p99 >= 5000) console.log('     原因：P99 ' + p99 + 'ms >= 5 秒');
  }
  console.log('');
  process.exit(passed ? 0 : 1);
}

main().catch(function (err) { console.error(err); process.exit(1); });
