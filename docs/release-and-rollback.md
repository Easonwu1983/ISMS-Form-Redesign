# 發佈與回滾

## 正式發佈順序

1. `git push origin main`
2. 先同步校內 VM
3. 先驗校內 VM：
   - `node scripts/vm-entry-smoke.cjs`
   - `ISMS_LIVE_BASE=http://140.112.97.150 node scripts/campus-live-regression-smoke.cjs`
4. 校內 VM 綠燈後，再發布 Pages 備援頁
5. 最後跑：
   - `ISMS_VERSION_BASES=http://140.112.97.150,https://isms-campus-portal.pages.dev node scripts/version-governance-smoke.cjs`
   - `node scripts/cloudflare-live-health-check.cjs`

## 校內 VM 同步

1. `echo 'P@ss_w0rD' | sudo -S -u ismsbackend git -C /srv/isms-form-redesign pull --ff-only origin main`
2. `echo 'P@ss_w0rD' | sudo -S -u ismsbackend sh -lc 'cd /srv/isms-form-redesign && node scripts/build-version-info.cjs campus-vm > deploy-manifest.json'`
3. `echo 'P@ss_w0rD' | sudo -S systemctl restart isms-unit-contact-backend.service caddy.service`
4. `node scripts/vm-entry-smoke.cjs`
5. `ISMS_LIVE_BASE=http://140.112.97.150 node scripts/campus-live-regression-smoke.cjs`

## Pages 備援同步

1. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap-cloudflare-pages-live.ps1 -ProjectName isms-campus-portal -Branch main -Protocol http2`
2. `node scripts/cloudflare-live-health-check.cjs`
3. `node scripts/cloudflare-pages-regression-smoke.cjs`

## 回滾

1. 先回校內 VM 到穩定 commit
2. 重生 VM `deploy-manifest.json`
3. 重啟 `isms-unit-contact-backend.service`、`caddy.service`
4. 驗校內 VM 綠燈
5. 必要時再重發 Pages 備援頁到同版
