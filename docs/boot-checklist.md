# 開機檢查

## 每次接手先做

1. `git status --short`
2. 看 `logs/formal-production/latest-release-report.md`
3. 看 [Start Here](./start-here.md)
4. 若本輪會動到 `shell / CSS / bundle / asset-loader`，先記住要跑 `node scripts/build-app-core-assets.cjs`

## 固定事實

- 正式主站：`http://140.112.97.150/`
- Pages：`https://isms-campus-portal.pages.dev/`
- 正式部署入口：`useradmin@140.112.97.150`
- VM repo：`/srv/isms-form-redesign`
- service user：`ismsbackend`
- 本機 `8088`：只做開發驗證

## 先確認正式鏈

- `curl http://140.112.97.150/api/unit-contact/health`
- `curl http://140.112.97.150/deploy-manifest.json`
- `curl https://isms-campus-portal.pages.dev/deploy-manifest.json`
- `node scripts/formal-production-smoke.cjs`

## 帳號與申請流程如果有動到，先記住要驗

- `node scripts/unit-contact-public-smoke.cjs`
- `node scripts/unit-contact-admin-review-smoke.cjs`

## 已知帳號流程坑

- 登入頁第一次輸入不穩：原因通常是 local bootstrap 太早切 panel
- `帳號管理` / `單位管理人申請` 噴 `paged client unavailable`：原因通常是 paged client 還沒 hydrate
- 公開申請授權附件上傳失敗：要檢查 public upload route
- `通過並啟用` 後看不到新帳號：要檢查 `system-users` cache invalidation

## VM 額外狀態

- PostgreSQL 已安裝到主機層
- 版本：`18.3`
- cluster：`18/main`
- 監聽：`127.0.0.1:5432`

## 開機時最容易漏掉的事

- Pages 發佈前一定先刷新本機 root `deploy-manifest.json`
- `cloudflare-pages-regression-smoke.cjs` 不要和平行 full smoke 一起跑
- 大量 `tmp_*`、extract、報表檔通常都是 untracked 暫存，先忽略

