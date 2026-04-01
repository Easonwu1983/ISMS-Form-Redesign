# 上版前必看

這份文件只保留正式上版前一定要知道的事。

## 固定順序

1. 若本輪改到 `shell / CSS / bundle / asset-loader`，先跑 `node scripts/build-app-core-assets.cjs`
2. `git push origin main`
3. 刷新本機 root manifest：`node scripts/build-version-info.cjs campus-host > deploy-manifest.json`
4. 先同步校內 VM
5. 先驗校內 VM：
   - `node scripts/vm-entry-smoke.cjs`
   - `ISMS_LIVE_BASE=http://140.112.97.150 node scripts/campus-live-regression-smoke.cjs`
6. VM 綠燈後再發 Pages
7. 最後跑：
   - `node scripts/cloudflare-live-health-check.cjs`
   - `node scripts/cloudflare-pages-regression-smoke.cjs`
   - `node scripts/formal-production-smoke.cjs`

## 上版後先看什麼

先看 `logs/formal-production/latest-release-report.md` 的：

- `Metrics`
- `Coverage`
- `Cache Signals`
- `Warm State`
- `Latency Hotspots`
- `Unstable Steps`

## 帳號與流程改動時，必跑的額外 smoke

- 公開申請流程：`node scripts/unit-contact-public-smoke.cjs`
- 最高管理者審核流程：`node scripts/unit-contact-admin-review-smoke.cjs`

## 目前最常撞牆

- 忘記刷新本機 root `deploy-manifest.json`
- 先發 Pages，卻沒先驗 VM
- 把 `cloudflare-pages-regression-smoke.cjs` 和 `formal-production-smoke.cjs` 平行跑
- 純前端改動還去重啟 backend / caddy
- 把 build 產物 `styles.min.css` / `styles.purged.min.css` 誤判成異常

## 目前最常出問題的帳號/權限點

- 登入頁第一次輸入不穩：已修，但若又回歸，先檢查 `shell-module.js` 的 local bootstrap timing
- `unit-admin` 進 `帳號管理` / `單位管理人申請` 顯示 `paged client unavailable`：若回歸，先檢查 paged client hydrate
- 公開申請授權附件上傳：若回歸，先檢查 public attachment upload route
- `通過並啟用` 後看不到新帳號：若回歸，先檢查 `system-users` cache invalidation

## 目前仍值得盯的熱點

- `visual:desktop:dashboard`
- `visual:public-desktop:unit-contact-apply`
- `unit-admin:login`
- `checklist:list-loaded`

