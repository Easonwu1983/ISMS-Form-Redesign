# 只留可執行步驟

這份只保留真的要做的動作，不講背景。

## 開工前

1. `git status --short`
2. 若本輪有動到 `shell / CSS / bundle / asset-loader`，先跑：`node scripts/build-app-core-assets.cjs`
3. 若準備發 Pages，先刷新本機 root manifest：`node scripts/build-version-info.cjs campus-host > deploy-manifest.json`
4. 先打開 `logs/formal-production/latest-release-report.md`，只看：
   - `Metrics`
   - `Coverage`
   - `Cache Signals`
   - `Cache Miss Reasons`
   - `Warm State`
   - `Latency Hotspots`
   - `Layers`
   - `Unstable Steps`

## 正式上版

1. `git push origin main`
2. `ssh useradmin@140.112.97.150`
3. `sudo -u ismsbackend git -C /srv/isms-form-redesign pull --ff-only origin main`
4. `sudo -u ismsbackend bash -lc 'cd /srv/isms-form-redesign && node scripts/build-version-info.cjs campus-vm | tee deploy-manifest.json >/dev/null'`
5. 若有 backend / runtime 變更，才重啟：
   - `sudo systemctl restart isms-unit-contact-backend.service caddy.service`
6. 跑 VM 驗證：
   - `node scripts/vm-entry-smoke.cjs`
   - `ISMS_LIVE_BASE=http://140.112.97.150 node scripts/campus-live-regression-smoke.cjs`
7. 發 Pages：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap-cloudflare-pages-live.ps1 -ProjectName isms-campus-portal -Branch main -Protocol http2`
8. 跑 Pages 驗證：
   - `node scripts/cloudflare-live-health-check.cjs`
   - `node scripts/cloudflare-pages-regression-smoke.cjs`
9. 跑正式總驗證：
   - `node scripts/formal-production-smoke.cjs`

## 本機開發驗證

1. `node m365/campus-backend/service-host.cjs .runtime/runtime.local.host.json`
2. `powershell -ExecutionPolicy Bypass -File scripts/start-host-campus-gateway.ps1`

## 只要記住的禁令

- 不要再走 guest `127.0.0.1:2222`
- 不要把 `cloudflare-pages-regression-smoke.cjs` 和 `formal-production-smoke.cjs` 平行跑
- 純前端變更不要重啟 backend / caddy
- `styles.min.css` 和 `styles.purged.min.css` 是正常 build 產物，不要誤判

