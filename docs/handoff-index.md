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

## 避免重工

- 正式部署入口只看 `useradmin@140.112.97.150`，不要再走 guest `127.0.0.1:2222`
- Pages 發佈前一定先刷新本機 root `deploy-manifest.json`
- `cloudflare-pages-regression-smoke.cjs` 不要和 `formal-production-smoke.cjs` 平行跑
- 正式判準只看：
  - 校內 VM
  - Pages
