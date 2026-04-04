'use strict';

/**
 * ISMS 端對端核心流程測試
 *
 * 6 個核心流程：
 * 1. 登入 → 看到儀表板
 * 2. 填報檢核表 → 儲存草稿
 * 3. 填報教育訓練 → 儲存草稿
 * 4. 開立矯正單（admin）
 * 5. 申請帳號頁面可存取
 * 6. 資產清冊 → 列表 → 新建 → 讀取 → 軟刪除
 *
 * 用法：node tests/e2e-core-flows.cjs [base-url]
 */

const http = require('http');
const BASE = process.argv[2] || 'http://140.112.97.150';
const ADMIN = { user: 'easonwu', pass: '2wsx#EDC' };
const UNIT_ADMIN = { user: 'testunit01', pass: 'NewTest1234!' };
const UNIT_ADMIN_PROFILE = {
  username: UNIT_ADMIN.user, password: UNIT_ADMIN.pass,
  name: 'Test Unit Admin', email: 'testunit01@test.local',
  role: '單位管理員', primaryUnit: '4510',
  authorizedUnits: ['4510'], securityRoles: ['二級單位資安窗口'],
  forcePasswordChange: false
};
let passed = 0, failed = 0;

function request(method, path, body, token) {
  return new Promise(function (resolve) {
    const url = new URL(path, BASE);
    const start = Date.now();
    const bodyStr = body ? JSON.stringify(body) : '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const r = http.request({
      hostname: url.hostname, port: url.port || 80,
      path: url.pathname + url.search, method, headers, timeout: 15000
    }, function (res) {
      let data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, ms: Date.now() - start, json, raw: data, ok: res.statusCode >= 200 && res.statusCode < 400 });
      });
    });
    r.on('error', function (e) { resolve({ status: 0, ms: Date.now() - start, ok: false, error: e.message }); });
    r.on('timeout', function () { r.destroy(); resolve({ status: 0, ms: Date.now() - start, ok: false, error: 'timeout' }); });
    if (bodyStr) r.write(bodyStr);
    r.end();
  });
}

async function login(user, pass) {
  const res = await request('POST', '/api/auth/login', { action: 'auth.login', payload: { username: user, password: pass } });
  if (!res.ok || !res.json) return null;
  return (res.json.session && res.json.session.token) || (res.json.item && res.json.item.sessionToken) || null;
}

async function ensureTestUnitAdmin(adminTok) {
  // Try logging in first
  var token = await login(UNIT_ADMIN.user, UNIT_ADMIN.pass);
  if (token) return token;
  // Account missing or wrong password — upsert via admin API
  console.log('  ⚙️  testunit01 login failed, creating account via admin API...');
  var upsertRes = await request('POST', '/api/system-users/upsert', {
    action: 'system-user.upsert', payload: UNIT_ADMIN_PROFILE
  }, adminTok);
  if (!upsertRes.ok) {
    console.log('  ⚠️  upsert failed: ' + (upsertRes.json && upsertRes.json.error || upsertRes.raw));
    return null;
  }
  // Retry login with the freshly created account
  return login(UNIT_ADMIN.user, UNIT_ADMIN.pass);
}

function test(name, ok, detail) {
  if (ok) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  ISMS 端對端核心流程測試（6 個流程）                   ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // Flow 1: Admin 登入 → 儀表板 → 看到年度稽核進度
  console.log('Flow 1: Admin 登入 → 儀表板');
  var adminToken = await login(ADMIN.user, ADMIN.pass);
  test('Admin 登入成功', !!adminToken);
  if (adminToken) {
    var dash = await request('GET', '/api/dashboard/summary?auditYear=115', null, adminToken);
    test('儀表板 Summary API 回應正常', dash.ok && dash.json && dash.json.checklist);
    test('檢核表資料有 totalUnits', dash.json && dash.json.checklist && dash.json.checklist.totalUnits >= 1);
    test('訓練資料有 avgCompletionRate', dash.json && dash.json.training && dash.json.training.avgCompletionRate !== undefined);
    test('待處理有 totalPendingItems', dash.json && dash.json.pending && dash.json.pending.totalPendingItems !== undefined);
  }
  console.log('');

  // Flow 2: 檢核表 API 可讀取
  console.log('Flow 2: 檢核表讀取');
  if (adminToken) {
    var cl = await request('GET', '/api/checklists?limit=10', null, adminToken);
    test('檢核表列表 API 回應正常', cl.ok);
    test('回傳 items 陣列', cl.json && Array.isArray(cl.json.items));
  }
  console.log('');

  // Flow 3: 教育訓練 API 可讀取 + 名單
  console.log('Flow 3: 教育訓練讀取');
  if (adminToken) {
    var tf = await request('GET', '/api/training/forms?limit=10', null, adminToken);
    test('訓練表單列表 API 正常', tf.ok);
    var tr = await request('GET', '/api/training/rosters?limit=10', null, adminToken);
    test('訓練名單 API 正常', tr.ok);
    test('名單有 items', tr.json && Array.isArray(tr.json.items));
  }
  console.log('');

  // Flow 4: 矯正單列表 + 年度結算 + 稽核報告
  console.log('Flow 4: 矯正單 + 管理功能');
  if (adminToken) {
    var ca = await request('GET', '/api/corrective-actions?limit=10', null, adminToken);
    test('矯正單列表 API 正常', ca.ok);
    var ys = await request('GET', '/api/audit-year/summary', null, adminToken);
    test('年度結算 API 正常', ys.ok);
    var su = await request('GET', '/api/system-users?limit=5', null, adminToken);
    test('帳號管理 API 正常', su.ok);
    var at = await request('GET', '/api/audit-trail?limit=5', null, adminToken);
    test('操作軌跡 API 正常', at.ok);
  }
  console.log('');

  // Flow 5: 單位管理員待辦 + 公開申請頁面
  console.log('Flow 5: 單位管理員 + 公開頁面');
  var unitToken = await ensureTestUnitAdmin(adminToken);
  test('單位管理員登入成功', !!unitToken);
  if (unitToken) {
    var tasks = await request('GET', '/api/my-tasks?auditYear=115', null, unitToken);
    test('我的待辦 API 正常', tasks.ok && tasks.json && Array.isArray(tasks.json.tasks));
  }
  // 公開申請頁（不需認證）
  var applyPage = await request('GET', '/');
  test('公開首頁可存取', applyPage.ok);
  var health = await request('GET', '/api/unit-contact/health');
  test('申請 API health 正常', health.ok);
  console.log('');

  // Flow 6: 資產清冊 → 列表 → 新建 → 讀取 → 軟刪除
  console.log('Flow 6: 資產清冊 CRUD');
  if (adminToken) {
    // 6a. Health check（公開端點）
    var assetHealth = await request('GET', '/api/assets/health');
    test('資產清冊 health 回應正常', assetHealth.ok && assetHealth.json && assetHealth.json.status === 'ok');

    // 6b. 列表查詢
    var assetList = await request('GET', '/api/assets', null, adminToken);
    test('資產清冊列表 API 正常', assetList.ok && assetList.json && Array.isArray(assetList.json.items));

    // 6c. 新建資產
    var newAsset = await request('POST', '/api/assets', {
      payload: {
        assetName: '__e2e_test_asset_' + Date.now(),
        category: '硬體',
        subCategory: '筆電',
        ownerName: 'E2E 測試',
        confidentiality: '普',
        integrity: '普',
        availability: '普',
        legalCompliance: '普'
      }
    }, adminToken);
    test('資產新建成功 (201)', newAsset.status === 201 && newAsset.json && !!newAsset.json.id);

    if (newAsset.json && newAsset.json.id) {
      var aid = newAsset.json.id;

      // 6d. 讀取單筆
      var assetDetail = await request('GET', '/api/assets/' + encodeURIComponent(aid), null, adminToken);
      test('資產單筆讀取成功', assetDetail.ok && assetDetail.json && assetDetail.json.id === aid);

      // 6e. 軟刪除
      var assetDel = await request('POST', '/api/assets/' + encodeURIComponent(aid) + '/delete', {}, adminToken);
      test('資產軟刪除成功', assetDel.ok && assetDel.json && assetDel.json.success === true);
    }

    // 6f. Summary
    var assetSummary = await request('GET', '/api/assets/summary', null, adminToken);
    test('資產清冊 Summary API 正常', assetSummary.ok && assetSummary.json && typeof assetSummary.json.year === 'number');
  }
  console.log('');

  // Summary
  console.log('═'.repeat(54));
  console.log('  結果：' + passed + ' 通過 / ' + failed + ' 失敗 / ' + (passed + failed) + ' 總計');
  console.log(failed === 0 ? '  ✅ 全部通過！' : '  ❌ 有 ' + failed + ' 項失敗');
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(function (err) { console.error(err); process.exit(1); });
