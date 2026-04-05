# Start Here

這份文件是唯一入口。切帳號、接手、上版、查帳號問題，都先從這裡開始。

## 先看這三份

1. [只留可執行步驟](./operational-steps-only.md)
2. [切帳號交接版](./account-handoff-checklist.md)
3. [上版前必看版](./pre-release-must-read.md)

## 固定事實

- 正式主站：`http://140.112.97.150/`
- 正式後端：`http://140.112.97.150/api/*`
- Pages：`https://isms-campus-portal.pages.dev/`，是備援頁，不是第一判準
- 正式部署入口：`useradmin@140.112.97.150`
- VM repo：`/srv/isms-form-redesign`
- service user：`ismsbackend`
- 本機 `8088`：只做開發驗證，不當正式判準

## 什麼情況看哪份

- 只想照命令做：看 `operational-steps-only.md`
- 切帳號 / 交接 AI：看 `account-handoff-checklist.md`
- 要正式上版：看 `pre-release-must-read.md`
- 要查完整背景：看 `boot-checklist.md`、`release-and-rollback.md`、`vm-migration-checklist.md`
- **數字在各頁顯示不一致**：看 `cross-module-consistency-guide.md`（SSOT 架構、偵錯流程、工具箱）

## 最近已經寫死的坑

- Pages 發佈前一定先刷新本機 root `deploy-manifest.json`
- `cloudflare-pages-regression-smoke.cjs` 不要和 `formal-production-smoke.cjs` 平行跑
- 純前端靜態檔不要重啟 backend / caddy
- 帳號與申請流程改動後，一定跑：
  - `node scripts/unit-contact-public-smoke.cjs`
  - `node scripts/unit-contact-admin-review-smoke.cjs`

