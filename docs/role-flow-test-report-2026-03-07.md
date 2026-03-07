# 第三輪可優化項完成報告

- 完成日期：2026-03-07
- 專案路徑：`C:/AI/ISMS-Form-Redesign`
- 驗證環境：`node .codex-local-server.cjs`
- 驗證方式：Playwright 三層測試（權限矩陣 / 流程探針 / 完整 smoke）

## 本輪完成項目

### P0

1. 補齊 `data-testid`
- 已為 `create / respond / tracking / checklist-fill / training-fill / training-roster` 的關鍵欄位、送出按鈕、草稿按鈕、單位級聯控制項補上 `data-testid`。
- 自訂 `radio / checkbox` 元件也已補上群組與選項層級的 `data-testid`。

2. 建立集中式路由權限白名單
- `app.js` 已新增 `ROUTE_WHITELIST`，統一管理路由標題、允許角色、fallback 與 render handler。
- `handleRoute()` 已改為先讀取 whitelist，再做權限判斷與 fallback。
- 另提供 `window._routeWhitelist()` 給 E2E 測試直接讀取權限設定。

### P1

3. 拆分 `handleRoute()`
- 原本大型 `switch` 已改成 route-map 風格。
- 路由新增或權限調整時，現在可直接在 whitelist 區塊處理，降低衝突與漏 guard 風險。

4. 拆分長字串模板
- `training-roster` 已拆為 `buildTrainingRosterRows()`、`buildTrainingRosterImportCard()`、`buildTrainingRosterPage()`。
- `checklist-fill` 已拆出 `buildChecklistItemBlock()`、`buildChecklistSectionsHtml()`，降低主 render 函式長度。

### P2

5. 建立分層測試
- 已新增：
  - `scripts/route-permission-matrix.cjs`
  - `scripts/role-flow-probe.cjs`
  - `scripts/_role-test-utils.cjs`
  - `scripts/_playwright.cjs`
- 已補 `package.json` 測試指令：
  - `npm run test:role:permission`
  - `npm run test:role:probe`
  - `npm run test:role:smoke`
  - `npm run test:role:all`

## 測試結果

### 1. 路由權限矩陣
- 結果檔：`test-artifacts/role-flow-round3-2026-03-07/permission-matrix.json`
- 結論：`admin / unit1 / user1` 三角色權限矩陣全部符合預期。
- 越權路由：0
- `consoleErrors`：0
- `pageErrors`：0

### 2. 流程探針
- 結果檔：`test-artifacts/role-flow-round3-2026-03-07/flow-probe.json`
- 結論：
  - 單位管理員可成功開單
  - 填報者可成功回填
  - 最高管理者可成功檢視管理頁與案件明細
- `consoleErrors`：0
- `pageErrors`：0

### 3. 完整 smoke flow
- 結果檔：`test-artifacts/role-flow-smoke-2026-03-07/results.json`
- 結論：12 個步驟全數通過。
- 覆蓋流程：
  - 最高管理者管理頁權限
  - 單位管理員開單
  - 填報者回填矯正單
  - 檢核表草稿與正式送出
  - 教育訓練草稿與正式送出
  - 追蹤提報與最高管理者結案
- `consoleErrors`：0
- `pageErrors`：0

## 這次順手補的收斂

1. 補上 `favicon.svg`
- 消除瀏覽器載入頁面時的靜態資源 `404`。

2. 測試工具共用化
- 把瀏覽器啟動、登入、hash 跳轉、結果寫檔等邏輯抽到共用 helper，後續新增測試時不必複製貼上。

## 主要修改檔案

- `C:/AI/ISMS-Form-Redesign/app.js`
- `C:/AI/ISMS-Form-Redesign/index.html`
- `C:/AI/ISMS-Form-Redesign/favicon.svg`
- `C:/AI/ISMS-Form-Redesign/package.json`
- `C:/AI/ISMS-Form-Redesign/scripts/_playwright.cjs`
- `C:/AI/ISMS-Form-Redesign/scripts/_role-test-utils.cjs`
- `C:/AI/ISMS-Form-Redesign/scripts/route-permission-matrix.cjs`
- `C:/AI/ISMS-Form-Redesign/scripts/role-flow-probe.cjs`
- `C:/AI/ISMS-Form-Redesign/scripts/role-flow-smoke.cjs`

## 後續建議

1. 把 `detail / respond / tracking` 也納入 route whitelist 的自動化矩陣，讓權限驗證更完整。
2. 持續把大型 render 函式拆小，優先處理 `renderCreate()`、`renderRespond()`、`renderTraining()`。
3. 若要正式上 CI，建議加入固定的測試資料 reset 與 artifact 保留策略。
