# 接手入口

- 先認拓樸：[production-topology.md](/C:/Users/User/Playground/ISMS-Form-Redesign/docs/production-topology.md)
- 先看 [boot-checklist.md](/C:/Users/User/Playground/ISMS-Form-Redesign/docs/boot-checklist.md)
- 校內 VM 更新看 [vm-migration-checklist.md](/C:/Users/User/Playground/ISMS-Form-Redesign/docs/vm-migration-checklist.md)
- 只有異常時才看 [fast-redeploy-runbook.md](/C:/Users/User/Playground/ISMS-Form-Redesign/docs/fast-redeploy-runbook.md)
- 發佈或回滾看 [release-and-rollback.md](/C:/Users/User/Playground/ISMS-Form-Redesign/docs/release-and-rollback.md)

## 固定快路徑

1. `git status --short`
2. 若有動到 shell / CSS / bundle / asset loader，先跑：`node scripts/build-app-core-assets.cjs`
3. `git push origin main`
4. 刷新本機 root manifest：`node scripts/build-version-info.cjs campus-host > deploy-manifest.json`
5. 直接同步正式主站：`useradmin@140.112.97.150`
6. 先驗 VM：
   - `node scripts/vm-entry-smoke.cjs`
   - `ISMS_LIVE_BASE=http://140.112.97.150 node scripts/campus-live-regression-smoke.cjs`
7. 再發 Pages 備援頁
8. 最後跑：`node scripts/formal-production-smoke.cjs`

## 切帳號勾選表

- [account-handoff-checklist.md](/C:/Users/User/Playground/ISMS-Form-Redesign/docs/account-handoff-checklist.md)

## 避免重工

- 正式部署入口只看 `useradmin@140.112.97.150`，不要再走 guest `127.0.0.1:2222`
- Pages 發佈前一定先刷新本機 root `deploy-manifest.json`
- `cloudflare-pages-regression-smoke.cjs` 不要和 `formal-production-smoke.cjs` 平行跑
- 正式判準只看：
  - 校內 VM
  - Pages

## 目前正式鏈熱點

以 `logs/formal-production/latest-release-report.md` 為準，2026-03-31 這輪主要還剩：

- `visual:desktop:dashboard`
- `visual:desktop:unit-review`
- `landing:login-form`
- `checklist:list-loaded`
- `visual:public-desktop:unit-contact-apply`

次要熱點：

- `unit-admin:login`
- `unit-admin:api-scope`
- `audit-trail:loaded`

API warm-state 目前狀態：

- `audit-trail summary-only`：已改善
- `checklists summary-only`：已改善
- `training-forms summary-only`：已改善

## 常見撞牆點

- 本機 root `deploy-manifest.json` 如果沒刷新，Pages 很容易出現版本不一致或 SRI mismatch。
- 動到 `shell / CSS / bundles / asset-loader` 卻沒跑 `node scripts/build-app-core-assets.cjs`，正式站與 Pages 會出現舊資產。
- `cloudflare-pages-regression-smoke.cjs` 和 `formal-production-smoke.cjs` 平行跑，容易因共用 session 造成假紅燈。
- 純前端變更不需要重啟 `isms-unit-contact-backend.service` 或 `caddy.service`；多餘重啟只會增加噪音。
- repo 內長期存在很多未追蹤暫存檔，只要 `git status --short` 沒有 tracked 變更，就不要浪費時間處理它們。
- `styles.min.css`、`styles.purged.min.css` 是正常建置產物；如果它們是本輪 build 產生的，不要誤判成衝突。
