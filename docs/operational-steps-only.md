# 只留可執行步驟

這份文件只留命令與順序。

## 開始前

1. `git status --short`
2. 若有改到 `shell / CSS / bundle / asset-loader`：`node scripts/build-app-core-assets.cjs`
3. 刷新本機 root manifest：`node scripts/build-version-info.cjs campus-host > deploy-manifest.json`

## 推送與 VM 同步

1. `git push origin main`
2. `ssh useradmin@140.112.97.150`
3. `echo 'P@ss_w0rD' | sudo -S -u ismsbackend git -C /srv/isms-form-redesign pull --ff-only origin main`
4. `echo 'P@ss_w0rD' | sudo -S -u ismsbackend bash -lc 'cd /srv/isms-form-redesign && node scripts/build-version-info.cjs campus-vm | tee deploy-manifest.json > /dev/null'`
5. 只有 backend / runtime 變更時才跑：`echo 'P@ss_w0rD' | sudo -S systemctl restart isms-unit-contact-backend.service caddy.service`

## VM 驗證

1. `node scripts/vm-entry-smoke.cjs`
2. `ISMS_LIVE_BASE=http://140.112.97.150 node scripts/campus-live-regression-smoke.cjs`
3. 若本輪有動到帳號或申請流程：
   - `node scripts/unit-contact-public-smoke.cjs`
   - `node scripts/unit-contact-admin-review-smoke.cjs`

## Pages 備援同步

1. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap-cloudflare-pages-live.ps1 -ProjectName isms-campus-portal -Branch main -Protocol http2`
2. `node scripts/cloudflare-live-health-check.cjs`
3. `node scripts/cloudflare-pages-regression-smoke.cjs`

## 最後整輪

1. `node scripts/version-governance-smoke.cjs`
2. `node scripts/formal-production-smoke.cjs`
3. 看 `logs/formal-production/latest-release-report.md`

## 不要做

- 不要走 guest `127.0.0.1:2222`
- 不要把 Pages smoke 和 full smoke 平行跑
- 不要在純前端改動時重啟 backend / caddy
- 不要把 `styles.min.css` / `styles.purged.min.css` 當成異常

