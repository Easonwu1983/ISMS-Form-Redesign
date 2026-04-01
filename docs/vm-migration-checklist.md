# 校內 VM 維運

## 正式角色

- 正式主站前端：校內 VM `http://140.112.97.150/`
- 正式後端：校內 VM `/api/*`
- Cloudflare Pages：備援頁，同版但不是第一判準
- 本機 `8088`：只在開發驗證時使用

## 目標主機

- IP：`140.112.97.150`
- SSH 帳號：`useradmin`
- repo：`/srv/isms-form-redesign`
- service user：`ismsbackend`

## 更新步驟

1. `ssh useradmin@140.112.97.150`
2. `echo 'P@ss_w0rD' | sudo -S -u ismsbackend git -C /srv/isms-form-redesign pull --ff-only origin main`
3. `echo 'P@ss_w0rD' | sudo -S -u ismsbackend bash -lc 'cd /srv/isms-form-redesign && node scripts/build-version-info.cjs campus-vm | tee deploy-manifest.json > /dev/null'`
4. 只有 backend / runtime 變更時才跑：`echo 'P@ss_w0rD' | sudo -S systemctl restart isms-unit-contact-backend.service caddy.service`
5. 檢查：
   - `curl http://140.112.97.150/api/unit-contact/health`
   - `curl http://140.112.97.150/deploy-manifest.json`
   - `curl http://140.112.97.150/unit-contact-authorization-template.pdf -I`
   - `node scripts/vm-entry-smoke.cjs`
   - `ISMS_LIVE_BASE=http://140.112.97.150 node scripts/campus-live-regression-smoke.cjs`
   - 若這輪動到帳號或申請流程，再跑：
     - `node scripts/unit-contact-public-smoke.cjs`
     - `node scripts/unit-contact-admin-review-smoke.cjs`
   - Pages 同步後再跑：`node scripts/formal-production-smoke.cjs`

## 完成條件

- `/api/unit-contact/health` 為 `ready:true`
- root `deploy-manifest.json` 的 `versionKey` 與 VM `git rev-parse --short=12 HEAD` 一致
- `vm-entry-smoke` 通過
- `campus-live-regression-smoke` 以校內 VM 為 base 通過

## 避免重工

- 正式部署只走 `useradmin@140.112.97.150`
- `deploy-manifest.json` 用 `tee` 生成，不用單純 `>`，避免 batch/remote redirect 落檔不穩
- 純前端靜態檔變更不要重啟 backend / caddy
- Pages 發佈前先在本機刷新 root `deploy-manifest.json`

## 補充

- `audit-trail` 會先讀取 `logs/campus-backend/audit-trail-cache.json`，再背景刷新 SharePoint 全量快取。
- `training-rosters` 會先讀取 `logs/campus-backend/training-rosters-cache.json`，再背景刷新 SharePoint 全量快取。
- `checklists` 會先讀取 `logs/campus-backend/checklists-cache.json`，再背景刷新 SharePoint 全量快取。
- `unit-governance` 會保存在 `logs/campus-backend/unit-governance-store.json`，校內 VM 上不同瀏覽器共用同一份治理設定。
- VM 主機已安裝 PostgreSQL `18.3`，cluster 為 `18/main`，監聽 `127.0.0.1:5432`。
- 若帳號流程回歸，先檢查：
  - `renderLogin()` 是否在輸入後又切 panel
  - `system-users` / `unit-contact-review` paged client 是否已 hydrate
  - public attachment upload route 是否可用
  - `system-users` cache invalidation 是否在 `通過並啟用` 後生效
