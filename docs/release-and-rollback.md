# 發佈與回滾

## 正式發佈順序

1. 若改到 `shell / CSS / bundle / asset-loader`，先跑 `node scripts/build-app-core-assets.cjs`
2. `git push origin main`
3. 刷新本機 root manifest：`node scripts/build-version-info.cjs campus-host > deploy-manifest.json`
4. 同步校內 VM
5. 驗校內 VM：
   - `node scripts/vm-entry-smoke.cjs`
   - `ISMS_LIVE_BASE=http://140.112.97.150 node scripts/campus-live-regression-smoke.cjs`
6. 若這輪有動到帳號、登入、公開申請、審核流程，再跑：
   - `node scripts/unit-contact-public-smoke.cjs`
   - `node scripts/unit-contact-admin-review-smoke.cjs`
7. VM 綠燈後，再發 Pages 備援頁
8. 最後跑：
   - `node scripts/cloudflare-live-health-check.cjs`
   - `node scripts/cloudflare-pages-regression-smoke.cjs`
   - `node scripts/version-governance-smoke.cjs`
   - `node scripts/formal-production-smoke.cjs`

## 上版後先看什麼

先看 `logs/formal-production/latest-release-report.md`：

- `Metrics`
- `Coverage`
- `Cache Signals`
- `Warm State`
- `Latency Hotspots`
- `Unstable Steps`

## 目前最常撞牆

- 忘記刷新本機 root `deploy-manifest.json`
- 沒先驗 VM 就先發 Pages
- 把 Pages smoke 和 full smoke 平行跑
- 純前端變更仍重啟 backend / caddy
- 視覺 baseline 或 smoke tooling 改了，卻沒有同步驗 baseline

## 目前最常出問題的帳號流程

- 首次登入畫面跳動：檢查 `renderLogin()` 是否在使用者輸入後還切 panel
- `system users paged client unavailable`
- `unit contact applications paged client unavailable`
- 公開申請附件上傳 `Authentication required`
- `通過並啟用` 後新使用者沒有即時出現在 `system-users`

## 校內 VM 同步

### 方法 A：自動化腳本（推薦）

從本機執行，一鍵完成 git pull + manifest + restart + health check：

```
powershell -ExecutionPolicy Bypass -File .runtime/tools/vm-deploy.ps1
```

### 方法 B：手動 SSH

1. `echo 'P@ss_w0rD' | sudo -S -u ismsbackend git -C /srv/isms-form-redesign pull --ff-only origin main`
2. `echo 'P@ss_w0rD' | sudo -S -u ismsbackend bash -lc 'cd /srv/isms-form-redesign && node scripts/build-version-info.cjs campus-vm | tee deploy-manifest.json > /dev/null'`
3. 只有 backend / runtime 變更時才跑：`echo 'P@ss_w0rD' | sudo -S systemctl restart isms-unit-contact-backend.service caddy.service`

## Pages 備援同步

1. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap-cloudflare-pages-live.ps1 -ProjectName isms-campus-portal -Branch main -Protocol http2`
2. `node scripts/cloudflare-live-health-check.cjs`
3. `node scripts/cloudflare-pages-regression-smoke.cjs`

## 回滾

1. 先回校內 VM 到穩定 commit
2. 重生 VM `deploy-manifest.json`
3. 只有 backend / runtime 變更時才重啟 `isms-unit-contact-backend.service` / `caddy.service`
4. 驗 VM 綠燈
5. 必要時再重發 Pages 到同版

