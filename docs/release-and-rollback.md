# 發佈與回滾

## 正式發佈順序

1. 若有動到 shell / CSS / bundle / asset loader，先跑：`node scripts/build-app-core-assets.cjs`
2. `git push origin main`
3. 先刷新本機 root manifest：`node scripts/build-version-info.cjs campus-host > deploy-manifest.json`
4. 先同步校內 VM
5. 先驗校內 VM：
   - `node scripts/vm-entry-smoke.cjs`
   - `ISMS_LIVE_BASE=http://140.112.97.150 node scripts/campus-live-regression-smoke.cjs`
6. 校內 VM 綠燈後，再發布 Pages 備援頁
7. 最後跑：
   - `node scripts/formal-production-smoke.cjs`
   - 讀 `logs/formal-production/latest-release-report.md` 的 `Metrics / Coverage / Cache Signals / Cache Miss Reasons / Warm State / Latency Hotspots / Layers / Unstable Steps`，其中 `Cache Signals` 先看 `apiCacheHits / apiCacheMisses`
   - 若要分層定位：
     - `node scripts/formal-production-health-smoke.cjs`
     - `node scripts/formal-production-api-smoke.cjs`
     - `node scripts/formal-production-browser-smoke.cjs`
     - `node scripts/formal-production-visual-smoke.cjs`

## 正式發佈注意事項

- Pages 發佈前一定先刷新本機 root `deploy-manifest.json`
- `cloudflare-pages-regression-smoke.cjs` 不要和 `formal-production-smoke.cjs` 平行跑
- 純前端靜態檔變更不做多餘 service restart
- 正式部署只走 `useradmin@140.112.97.150`
- 若改到 `shell / CSS / bundles / asset-loader`，一定先跑 `node scripts/build-app-core-assets.cjs`
- `styles.min.css`、`styles.purged.min.css` 是正常 build 產物，不要因為它們改動就中止上版

## 目前上版後先驗什麼

先看 `logs/formal-production/latest-release-report.md` 的：

- `Metrics`
- `Coverage`
- `Cache Signals`
- `Warm State`
- `Latency Hotspots`
- `Unstable Steps`

目前最值得盯的熱點：

- `visual:desktop:dashboard`
- `visual:desktop:unit-review`
- `checklist:list-loaded`
- `visual:public-desktop:unit-contact-apply`
- `unit-admin:login`

## 目前最常撞牆的地方

- 忘記刷新本機 root `deploy-manifest.json`，導致 Pages manifest 與 VM 版本不一致
- 直接跑 Pages smoke，但前面沒有先驗校內 VM
- 把 Pages smoke 和 full smoke 一起跑，造成 session 互踩
- 純前端改動仍重啟 service，浪費時間又增加變數
- 修改 visual baseline capture 邏輯時沒有同步更新 baseline，會把 visual smoke 假紅燈帶進正式報告

## 校內 VM 同步

1. `echo 'P@ss_w0rD' | sudo -S -u ismsbackend git -C /srv/isms-form-redesign pull --ff-only origin main`
2. `echo 'P@ss_w0rD' | sudo -S -u ismsbackend bash -lc 'cd /srv/isms-form-redesign && node scripts/build-version-info.cjs campus-vm | tee deploy-manifest.json > /dev/null'`
3. 只有 backend / runtime 變更時才跑：`echo 'P@ss_w0rD' | sudo -S systemctl restart isms-unit-contact-backend.service caddy.service`
4. `node scripts/vm-entry-smoke.cjs`
5. `ISMS_LIVE_BASE=http://140.112.97.150 node scripts/campus-live-regression-smoke.cjs`

## Pages 備援同步

1. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap-cloudflare-pages-live.ps1 -ProjectName isms-campus-portal -Branch main -Protocol http2`
2. `node scripts/cloudflare-live-health-check.cjs`
3. `node scripts/cloudflare-pages-regression-smoke.cjs`

## 回滾

1. 先回校內 VM 到穩定 commit
2. 重生 VM `deploy-manifest.json`
3. 只有 backend / runtime 變更時才重啟 `isms-unit-contact-backend.service`、`caddy.service`
4. 驗校內 VM 綠燈
5. 必要時再重發 Pages 備援頁到同版
