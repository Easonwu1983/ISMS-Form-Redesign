# 資料層與版本治理

## 目標
把這個專案的資料來源、角色權限、快取、發佈版本與 smoke 驗證收斂成單一規則，避免切帳號後需要重新摸索流程。

## 單一真實來源
以下資料只允許由後端或既定同步流程產生，不讓前端自行猜測：

- 單位樹與單位分類
- 角色與單位授權關係
- 填報模式設定
- 資安窗口盤點結果
- 訓練名單與統計結果
- 內稽檢核表清單與進度
- 操作稽核軌跡
- 附件上傳與預覽資訊

## 資料層規則

1. 前端只負責顯示與互動，不負責推斷最終權限。
2. 相同查詢條件要共用快取，不重打相同 API。
3. 清單頁先畫殼層，再背景同步。
4. 大表格採分頁或分批渲染，不一次塞入整份 DOM。
5. 更新後必須立即失效對應快取，避免換帳號後看到舊資料。

## 權限層規則

- 最高管理者：可看全域資料、設定治理模式、檢視稽核與版本資訊。
- 單位管理者：只看自己授權範圍內的資料。
- 舊角色名稱不得再出現在正式流程或文案中。
- 跨單位授權必須由後端決定，不讓前端自行放行。

## 版本治理規則

每次 build 必須產生並同步以下資訊：

- commit
- shortCommit
- builtAt
- branch
- versionKey
- deploy-manifest.json

版本一致性檢查的對象：

- 本機 build 產物
- Windows host 8088
- Cloudflare Pages
- live smoke 結果

任何一個點版本不一致，release gate 直接阻擋。

## Release Gate

發佈前必跑：

1. `version-governance-smoke`
2. `campus-live-regression-smoke`
3. `live-security-smoke`
4. `cloudflare-pages-regression-smoke`
5. `stress-regression`（如這次有大資料變更）

只要其中一項失敗，不得進下一步部署。

## 切帳號手冊連結

- [快速接手手冊](fast-redeploy-runbook.md)
- [專案執行流程](project-execution-flow.md)

## 維護原則

- 新增功能前，先確認資料來源是否已有既定單一真實來源。
- 若需要新增快取，必須明確定義失效條件。
- 若版本資訊有變動，先更新 `deploy-manifest.json` 與 smoke，再做部署。