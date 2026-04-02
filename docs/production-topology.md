# 正式拓樸

## 服務端點

- 正式主站前端：校內主機 / 校內 VM `http://140.112.97.150/`
- 正式後端：校內 VM `/api/*`（raw `http.createServer()`，非 Express）
- Cloudflare Pages：備援頁與外部備援入口，不是主站
- 本機 `8088`：只用於開發驗證，不作為正式發佈判斷依據

## 資料層

- **主要資料來源**：PostgreSQL 17（VM 本機 `127.0.0.1:5432`，資料庫 `isms_db`，使用者 `isms_user`）
- **歷史資料來源**：M365 / SharePoint Lists（遷移中，部分模組仍使用 Graph API）
- **附件儲存**：SharePoint Drive（規劃遷移至 VM 本地 `/var/lib/isms/attachments/`）
- **前端資料快取**：localStorage（跨裝置不同步）
- **後端快取**：`logs/campus-backend/*.json`（audit-trail, training-rosters, checklists, unit-governance）

## 連線與憑證

| 項目 | 位置 |
|------|------|
| VM SSH | `useradmin@140.112.97.150` |
| VM 憑證 | `.runtime/tools/.vm-credential` |
| SSH 自動化 DLL | `.runtime/tools/sshnet/runtime/` (Renci.SshNet) |
| 自動部署腳本 | `.runtime/tools/vm-deploy.ps1` |
| DB 連線模組 | `m365/campus-backend/db.cjs` (pg.Pool) |
| DB 設定來源 | `runtime.local.json` → `postgres` 區塊 |
| M365 Graph API | `runtime.local.json` → `m365` 區塊 |
| VM repo 路徑 | `/srv/isms-form-redesign` |
| VM service user | `ismsbackend` |
| systemd service | `isms-unit-contact-backend.service` |
| reverse proxy | Caddy (`caddy.service`) |

## 本地開發環境

- 靜態伺服器：`.codex-local-server.cjs`（port 8080，可用 `PORT` 環境變數覆蓋）
- 後端伺服器：`m365/campus-backend/server.cjs`（port 8787）
- Claude Preview 設定：`.claude/launch.json`（local-server port 8090, campus-backend port 8787）
- 前端 build：`node scripts/build-app-core-assets.cjs`（esbuild，產出 `app-core.bundle.min.js`）

## 維運原則

1. 先驗校內 VM，再處理 Pages 備援同步。
2. 正式功能、權限、資料正確性，以校內 VM 結果為準。
3. Pages 必須可用，但不再作為主站 parity 的第一判準。
4. 本機鏈只在開發或回歸定位時使用。
5. 正式 smoke 只跑：`node scripts/formal-production-smoke.cjs`

## 正式 smoke 分層

- `health`：`node scripts/formal-production-health-smoke.cjs`
- `api`：`node scripts/formal-production-api-smoke.cjs`
- `browser`：`node scripts/formal-production-browser-smoke.cjs`
- `visual`：`node scripts/formal-production-visual-smoke.cjs`
- 完整整輪：`node scripts/formal-production-smoke.cjs`
- 報告輸出：`logs/formal-production/latest-*.json`
