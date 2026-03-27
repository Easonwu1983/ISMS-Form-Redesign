# 正式拓樸

- 正式主站前端：校內主機 / 校內 VM `http://140.112.97.150/`
- 正式後端：校內 VM `/api/*`
- 正式資料來源：M365 / SharePoint
- Cloudflare Pages：備援頁與外部備援入口，不是主站
- 本機 `8088`：只用於開發驗證，不作為正式發佈判斷依據

## 維運原則

1. 先驗校內 VM，再處理 Pages 備援同步。
2. 正式功能、權限、資料正確性，以校內 VM 結果為準。
3. Pages 必須可用，但不再作為主站 parity 的第一判準。
4. 本機鏈只在開發或回歸定位時使用。
5. 正式 smoke 只跑：`node scripts/formal-production-smoke.cjs`
