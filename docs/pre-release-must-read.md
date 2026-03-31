# 上版前必看版

這份只放正式上版前要先核對的內容。

## 上版順序

1. 若有動到 `shell / CSS / bundle / asset-loader`，先跑：`node scripts/build-app-core-assets.cjs`
2. `git push origin main`
3. 刷新本機 root manifest：`node scripts/build-version-info.cjs campus-host > deploy-manifest.json`
4. 先同步校內 VM
5. 先驗 VM：
   - `node scripts/vm-entry-smoke.cjs`
   - `ISMS_LIVE_BASE=http://140.112.97.150 node scripts/campus-live-regression-smoke.cjs`
6. VM 綠燈後，再發 Pages
7. 最後跑：
   - `node scripts/cloudflare-live-health-check.cjs`
   - `node scripts/cloudflare-pages-regression-smoke.cjs`
   - `node scripts/formal-production-smoke.cjs`

## 先看哪幾個 report 區塊

先看 `logs/formal-production/latest-release-report.md` 的：

- `Metrics`
- `Coverage`
- `Cache Signals`
- `Cache Miss Reasons`
- `Warm State`
- `Latency Hotspots`
- `Layers`
- `Unstable Steps`

## 目前最該盯的熱點

- `visual:desktop:dashboard`
- `visual:desktop:unit-review`
- `checklist:list-loaded`
- `visual:public-desktop:unit-contact-apply`
- `unit-admin:login`

次要熱點：

- `unit-admin:api-scope`
- `audit-trail:loaded`

## 常見撞牆點

- 忘記刷新本機 root `deploy-manifest.json`
- 動到 `shell / CSS / bundles / asset-loader` 卻沒跑 `build-app-core-assets`
- `cloudflare-pages-regression-smoke.cjs` 和 `formal-production-smoke.cjs` 平行跑
- 純前端變更卻重啟 backend / caddy
- 把 `styles.min.css`、`styles.purged.min.css` 當成衝突

