# 切帳號交接版

這份文件給下一個 AI 或下一個帳號。先看這份，再動程式或上版。

## 先讀

1. [Start Here](./start-here.md)
2. [只留可執行步驟](./operational-steps-only.md)
3. [上版前必看版](./pre-release-must-read.md)

## 正式鏈固定事實

- 正式主站：`http://140.112.97.150/`
- 正式後端：`http://140.112.97.150/api/*`
- Pages：`https://isms-campus-portal.pages.dev/`
- 正式部署入口：`useradmin@140.112.97.150`
- VM repo：`/srv/isms-form-redesign`
- service user：`ismsbackend`
- sudo 密碼：見 `docs/vm-migration-checklist.md`
- 本機 `8088` 不作為正式判準

## 帳號與登入流程已知狀態

- 登入頁第一次輸入會跳動：已修，`renderLogin()` 先畫面，再延後 local bootstrap 判斷
- `unit-admin` 進 `帳號管理` / `單位管理人申請` 會噴 `paged client unavailable`：已修，先等 paged client hydrate
- 公開申請上傳授權文件會回 `Authentication required`：已修，公開流程改走 public attachment upload
- `通過並啟用` 後看不到新帳號：已修，`system-users` cache invalidation 已補
- 通過並啟用後寄信：已驗證，會送給申請人，內容含 `loginUsername / initialPassword`

## 上版時最常撞牆

- 忘記刷新本機 root `deploy-manifest.json`
- 動到 `shell / CSS / bundles / asset-loader` 卻沒先跑 `node scripts/build-app-core-assets.cjs`
- 把 `cloudflare-pages-regression-smoke.cjs` 和 `formal-production-smoke.cjs` 平行跑
- 純前端改動還去重啟 `isms-unit-contact-backend.service` / `caddy.service`
- 把 `styles.min.css` / `styles.purged.min.css` 當成異常改動

## 這些流程有專用 smoke

- 正式主站入口：`node scripts/vm-entry-smoke.cjs`
- 校內 VM 回歸：`ISMS_LIVE_BASE=http://140.112.97.150 node scripts/campus-live-regression-smoke.cjs`
- 公開申請：`node scripts/unit-contact-public-smoke.cjs`
- 最高管理者審核：`node scripts/unit-contact-admin-review-smoke.cjs`
- Pages 備援：`node scripts/cloudflare-pages-regression-smoke.cjs`
- 正式整輪：`node scripts/formal-production-smoke.cjs`

## 目前已完成

- Core bundle / feature bundles / CSS minify / CSS purge
- request dedup / TTL cache / backoff / error taxonomy
- Apps Script request-scoped cache
- silent failure logging fallback
- public apply 上傳與送出流程
- admin review 通過並啟用、附件可見、寄信流程
- 基礎 a11y：skip link / modal focus trap / axe smoke

## 目前仍值得優先優化

- `visual:desktop:dashboard`
- `visual:public-desktop:unit-contact-apply`
- `unit-admin:login`
- `checklist:list-loaded`
- 剩餘 route 的 cleanup 與 listener page-scoping

## VM 額外狀態

- PostgreSQL 已裝到 VM 主機
- 版本：`18.3`
- cluster：`18/main`
- 監聽：`127.0.0.1:5432`
- 這是主機層服務，不屬於目前正式 smoke 驗證鏈

## 切帳號後第一件事

1. `git status --short`
2. 看 `logs/formal-production/latest-release-report.md`
3. 看這份文件與 `pre-release-must-read.md`
4. 只處理 tracked 變更，不理會根目錄 `tmp_*` 與各種未追蹤暫存檔

