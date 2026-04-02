# 只留可執行步驟

這份文件只留命令與順序。

## 開始前

1. `git status --short`
2. 若有改到 `shell / CSS / bundle / asset-loader`：`node scripts/build-app-core-assets.cjs`
3. 刷新本機 root manifest：`node scripts/build-version-info.cjs campus-host > deploy-manifest.json`

## 推送與 VM 同步

### 方法 A：自動化腳本（推薦）

1. `git push origin main`
2. `powershell -ExecutionPolicy Bypass -File .runtime/tools/vm-deploy.ps1`
   - 腳本會自動：git pull → 產生 deploy-manifest.json → 重啟 services → health check
   - 使用 Renci.SshNet DLL（位於 `.runtime/tools/sshnet/runtime/`）
   - 憑證檔：`.runtime/tools/.vm-credential`

### 方法 B：手動 SSH

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

## 本地預覽測試

1. 啟動本地靜態伺服器：`node .codex-local-server.cjs`（預設 port 8080）
   - 可用環境變數覆蓋 port：`PORT=8090 node .codex-local-server.cjs`
2. Claude Code Preview 設定在 `.claude/launch.json`（port 8090）
3. 後端本地測試：`node m365/campus-backend/server.cjs`（port 8787）

## 資料庫連線（PostgreSQL）

- 主機：VM `127.0.0.1:5432`（僅本機存取）
- 資料庫：`isms_db`
- 使用者：`isms_user`
- Schema migration：`m365/campus-backend/migrations/001-initial-schema.sql`
- 連線模組：`m365/campus-backend/db.cjs`（pg.Pool）
- 設定來源：`service-host.cjs` 讀取 `runtime.local.json` 的 `postgres` 區塊

## 不要做

- 不要走 guest `127.0.0.1:2222`
- 不要把 Pages smoke 和 full smoke 平行跑
- 不要在純前端改動時重啟 backend / caddy
- 不要把 `styles.min.css` / `styles.purged.min.css` 當成異常
- 不要把 `.runtime/tools/.vm-credential` 加入 git

