# 校內 VM 移轉清單

## 正式入口

- 服務入口: `http://140.112.97.150/`
- 健康檢查: `http://140.112.97.150/api/unit-contact/health`
- 其他 API 一律走 `/api/*`

## 1. VM 基礎環境

1. 安裝必要套件:
   - `git`
   - `node`
   - `systemd`
   - `caddy`
   - `curl`
   - `jq`
2. 建立固定服務帳號:
   - `ismsbackend`
3. 建立專案目錄:
   - `/srv/isms-form-redesign`

## 2. 專案部署

1. `git clone` 專案到 `/srv/isms-form-redesign`
2. `git checkout main`
3. `git pull --ff-only origin main`
4. 若 `git pull` 遇到 `gnutls_handshake() failed`:
   - `git config --global http.version HTTP/1.1`
   - 再重拉一次

## 3. 必要設定檔

1. `runtime.local.json`
   - 位置: `/srv/isms-form-redesign/m365/campus-backend/runtime.local.json`
   - 必要值:
     - `port: 8787`
     - `tokenMode: app-only`
     - `authSessionSecret`
     - `mailSenderUpn`
     - `sharePointSiteId`
     - `sharePointSiteUrl`
     - `lists`
     - `attachmentsLibrary`
   - 編碼: `UTF-8` 無 BOM
2. `m365-config.override.js`
   - 位置: `/srv/isms-form-redesign/m365-config.override.js`
   - 前端端點維持相對路徑 `/api/...`
3. `m365-a3-backend.json`
   - 位置: `/srv/isms-form-redesign/.local-secrets/m365-a3-backend.json`
   - 用來讓 backend 取得 M365 A3 token / site config

## 4. 啟動順序

1. 啟動 `isms-unit-contact-backend.service`
2. 啟動 `caddy`
3. 確認 `8787` 與 `80` 都正常

## 5. 驗證順序

1. `curl http://140.112.97.150/api/unit-contact/health`
2. 逐項確認核心 health:
   - `unit-contact`
   - `corrective-actions`
   - `checklists`
   - `training`
   - `system-users`
   - `auth`
   - `audit-trail`
   - `review-scopes`
3. 跑 smoke:
   - `node scripts/campus-live-regression-smoke.cjs`
   - `node scripts/live-security-smoke.cjs`
4. 若有版本治理需求，再跑:
   - `node scripts/version-governance-smoke.cjs`

## 6. 常見卡點

1. `health:ready=false`
   - 先看 `/srv/isms-form-redesign/.runtime/host-local-logs/unit-contact-campus-backend.log`
   - 再看 `m365-a3-backend.json` 是否存在
2. `/api` 404
   - 先檢查 `caddy` 是否用正確的 `reverse_proxy /api/* 127.0.0.1:8787`
3. `git pull` 失敗
   - 先切 HTTP/1.1
   - 再重拉

## 7. 完成標準

- `http://140.112.97.150/` 可開
- `http://140.112.97.150/api/unit-contact/health` 回 `ready:true`
- `caddy` 與 `isms-unit-contact-backend.service` 都是 `active`
- smoke 通過
## 8. ??????

1. `deploy-manifest.json`
   - ??: `/srv/isms-form-redesign/deploy-manifest.json`
   - ??? VM ?? `git HEAD` ??
2. `unit-contact-authorization-template.pdf`
   - ??: `/srv/isms-form-redesign/unit-contact-authorization-template.pdf`
   - ????????????

