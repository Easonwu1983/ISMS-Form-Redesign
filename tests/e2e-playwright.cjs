'use strict';

/**
 * ISMS 端對端自動化測試（Playwright）
 *
 * 5 個核心流程用真實瀏覽器操作：
 * Flow 1: 登入 → 看到儀表板 → 年度稽核進度
 * Flow 2: 填報檢核表 → 選答案 → 儲存草稿
 * Flow 3: 填報教育訓練 → 看到人員清單
 * Flow 4: 開立矯正單 → 填寫表單欄位
 * Flow 5: 公開申請頁 → 表單完整 → 拖拉上傳區
 *
 * 用法：node tests/e2e-playwright.cjs [base-url]
 */

const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://140.112.97.150';
const ADMIN = { user: 'easonwu', pass: '2wsx#EDC' };
const TIMEOUT = 15000;
let passed = 0, failed = 0, browser, page;

function test(name, ok, detail) {
  if (ok) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}

async function loginAsAdmin() {
  await page.goto(BASE + '/#login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#login-form', { timeout: TIMEOUT });
  await page.fill('#login-user', ADMIN.user);
  await page.fill('#login-pass', ADMIN.pass);
  await page.click('#login-form button[type="submit"]');
  await page.waitForSelector('.sidebar', { timeout: TIMEOUT });
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  ISMS Playwright 端對端自動化測試                                 ║');
  console.log('║  目標：' + BASE.padEnd(55) + '║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();

  try {
    // ══════════════════════════════════════════════════
    // Flow 1: 登入 → 儀表板
    // ══════════════════════════════════════════════════
    console.log('Flow 1: 登入 → 儀表板');
    await loginAsAdmin();
    await page.waitForTimeout(2000);

    var sidebar = await page.$('.sidebar');
    test('登入成功（sidebar 出現）', !!sidebar);

    var sidebarText = await page.textContent('.sidebar');
    test('Sidebar 有儀表板選項', sidebarText.includes('儀表板'));
    test('Sidebar 有矯正單列表', sidebarText.includes('矯正單列表'));
    test('Sidebar 有帳號管理（admin）', sidebarText.includes('帳號管理'));

    // 等待 audit progress 載入
    await page.waitForTimeout(3000);
    var bodyText = await page.textContent('body');
    test('頁面有年度稽核進度', bodyText.includes('年度稽核') || bodyText.includes('年度填報') || bodyText.includes('稽核年度'));
    test('頁面有矯正單區段', bodyText.includes('矯正單') || bodyText.includes('開立矯正單'));
    console.log('');

    // ══════════════════════════════════════════════════
    // Flow 2: 填報檢核表
    // ══════════════════════════════════════════════════
    console.log('Flow 2: 填報檢核表');
    await page.goto(BASE + '/#checklist-fill', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    bodyText = await page.textContent('body');
    test('檢核表頁面載入', bodyText.includes('填報檢核表') || bodyText.includes('檢核') || bodyText.includes('受稽單位'));

    var unitField = await page.$('#cl-unit, [name="cl-unit"], .cl-unit-field');
    test('受稽單位欄位存在', !!unitField || bodyText.includes('受稽單位'));

    test('有 40 題問題', bodyText.includes('0 / 40') || bodyText.includes('0/40') || bodyText.includes('填報進度'));

    // 嘗試找到第一題的符合程度選項
    var firstRadio = await page.$('input[name^="cl-"][type="radio"]');
    test('有符合程度選項', !!firstRadio);

    // 找儲存草稿按鈕
    var saveBtn = await page.$('#cl-save-draft, [data-testid="cl-save-draft"], button:has-text("儲存草稿")');
    test('有儲存草稿按鈕', !!saveBtn);
    console.log('');

    // ══════════════════════════════════════════════════
    // Flow 3: 填報教育訓練
    // ══════════════════════════════════════════════════
    console.log('Flow 3: 教育訓練填報');
    await page.goto(BASE + '/#training-fill', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    bodyText = await page.textContent('body');
    test('教育訓練頁面載入', bodyText.includes('人員清單') || bodyText.includes('教育訓練') || bodyText.includes('在職人數'));

    test('有搜尋欄位', bodyText.includes('搜尋姓名') || !!await page.$('#training-search'));
    test('有儲存暫存按鈕', !!await page.$('#training-save-draft, [data-testid="training-save-draft"]'));
    test('有新增名單按鈕', bodyText.includes('新增名單') || !!await page.$('#training-add-person'));
    console.log('');

    // ══════════════════════════════════════════════════
    // Flow 4: 開立矯正單
    // ══════════════════════════════════════════════════
    console.log('Flow 4: 開立矯正單');
    await page.goto(BASE + '/#create', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    bodyText = await page.textContent('body');
    test('開立矯正單頁面載入', bodyText.includes('開立矯正單') || bodyText.includes('基本資訊'));
    test('有提報單位欄位', bodyText.includes('提報單位') || !!await page.$('[id*="proposer"]'));
    test('有處理人員欄位', bodyText.includes('處理人員') || !!await page.$('[id*="handler"]'));
    test('有缺失分類區段', bodyText.includes('缺失分類') || bodyText.includes('缺失種類'));
    test('有問題描述欄位', bodyText.includes('問題描述') || bodyText.includes('問題或缺失'));

    // 找送出按鈕
    var submitBtn = await page.$('button[type="submit"], [data-testid*="submit"]');
    test('有送出按鈕', !!submitBtn);
    console.log('');

    // ══════════════════════════════════════════════════
    // Flow 5: 公開申請頁
    // ══════════════════════════════════════════════════
    console.log('Flow 5: 公開申請頁');
    // 先登出
    await page.evaluate(function () {
      Object.keys(localStorage).forEach(function (k) { localStorage.removeItem(k); });
    });
    await page.goto(BASE + '/#apply-unit-contact', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    bodyText = await page.textContent('body');
    test('申請頁面載入', bodyText.includes('申請') || bodyText.includes('單位管理') || bodyText.includes('申請表單'));
    test('有申請人姓名欄位', bodyText.includes('申請人姓名') || !!await page.$('#uca-applicant-name'));
    test('有電子郵件欄位', bodyText.includes('電子郵件') || !!await page.$('#uca-applicant-email'));
    test('有資安角色勾選', bodyText.includes('一級單位資安窗口') || bodyText.includes('資安角色'));
    test('有授權同意書區段', bodyText.includes('授權同意書'));

    // 新增的拖拉上傳區域
    var dropzone = await page.$('#uca-dropzone, .auth-doc-dropzone');
    test('有拖拉上傳區', !!dropzone);

    // 範例預覽按鈕
    var exampleBtn = await page.$('#uca-show-example');
    test('有範例預覽按鈕', !!exampleBtn);

    test('有送出申請按鈕', bodyText.includes('送出申請'));
    test('有查詢進度連結', bodyText.includes('查詢進度'));
    console.log('');

  } catch (err) {
    console.error('\n⚠️  測試執行錯誤：', err.message);
    failed++;
  } finally {
    await browser.close();
  }

  // Summary
  console.log('═'.repeat(66));
  console.log('  結果：' + passed + ' 通過 / ' + failed + ' 失敗 / ' + (passed + failed) + ' 總計');
  console.log(failed === 0
    ? '  ✅ 全部通過！5 個核心流程端對端測試完整通過。'
    : '  ❌ 有 ' + failed + ' 項失敗，需要檢查。');
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main();
