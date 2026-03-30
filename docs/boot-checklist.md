# 開機檢查

1. `git status --short`
2. 若本輪動到 shell / CSS / bundle / asset loader，先跑：`node scripts/build-app-core-assets.cjs`
3. 若準備發 Pages，先刷新本機 root manifest：`node scripts/build-version-info.cjs campus-host > deploy-manifest.json`
4. 確認 `.runtime/runtime.local.host.json`：`tokenMode: "app-only"`、`mailSenderUpn: "easonwu@m365.ntu.edu.tw"`、UTF-8 無 BOM
5. 先確認正式鏈：
   - `curl http://140.112.97.150/api/unit-contact/health`
   - `curl http://140.112.97.150/deploy-manifest.json`
   - `curl https://isms-campus-portal.pages.dev/deploy-manifest.json`
   - `node scripts/formal-production-smoke.cjs`
   - 先看單一報告：`logs/formal-production/latest-release-report.md`（先看 `Metrics / Coverage / Cache Signals / Cache Miss Reasons / Warm State / Latency Hotspots / Layers / Unstable Steps`；`Cache Signals` 裡重點看 `apiCacheHits / apiCacheMisses`）
   - 需要分層定位時再跑：
     - `node scripts/formal-production-health-smoke.cjs`
     - `logs/formal-production/latest-health.json`
     - `node scripts/formal-production-api-smoke.cjs`
     - `logs/formal-production/latest-api.json`
     - `node scripts/formal-production-browser-smoke.cjs`
     - `logs/formal-production/latest-browser.json`
     - `node scripts/formal-production-visual-smoke.cjs`
     - `logs/formal-production/latest-visual.json`
6. 只有做本機開發驗證時，才啟動本機 stack：`node m365/campus-backend/service-host.cjs .runtime/runtime.local.host.json`
7. 只有做本機開發驗證時，才啟動 gateway：`powershell -ExecutionPolicy Bypass -File scripts/start-host-campus-gateway.ps1`

## 這份清單的固定假設

- 正式部署入口：`useradmin@140.112.97.150`
- VM repo：`/srv/isms-form-redesign`
- Pages smoke 不和平行 full smoke 一起跑
- 本機 `8088` 不作為正式判準

## 固定值

- 唯一最高管理者：`easonwu`
- 核准寄信模式：`app-only`
- 校內 VM：`140.112.97.150`
- 正式主站：校內 VM
- Pages：備援頁
- 本機 `8088`：僅開發驗證
