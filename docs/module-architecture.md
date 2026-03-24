# 模組架構

只保留模組分工。

## 核心模組

- [`app.js`](../app.js)：啟動、路由、模組掛載
- [`shell-module.js`](../shell-module.js)：登入殼層、導覽、版型
- [`auth-module.js`](../auth-module.js)：登入、登出、密碼、當前使用者
- [`data-module.js`](../data-module.js)：本地資料、快取、遷移
- [`unit-module.js`](../unit-module.js)：單位樹、分類、搜尋
- [`policy-module.js`](../policy-module.js)：角色、權限、可見性
- [`ui-module.js`](../ui-module.js)：共用 UI helper
- [`attachment-module.js`](../attachment-module.js)：附件儲存與預覽
- [`workflow-support-module.js`](../workflow-support-module.js)：共用流程工具

## 業務模組

- [`unit-contact-application-module.js`](../unit-contact-application-module.js)：單位資安窗口申請
- [`case-module.js`](../case-module.js)：矯正單
- [`checklist-module.js`](../checklist-module.js)：內稽檢核表
- [`training-module.js`](../training-module.js)：教育訓練
- [`admin-module.js`](../admin-module.js)：帳號管理、資安窗口、稽核軌跡、單位治理

## 介面契約

- `app.js` 負責載入與路由
- 功能模組只處理自己的畫面與事件
- 共用 helper 不要再散落到各模組
- 新功能先想清楚要放哪個模組，不要直接塞進 `app.js`

