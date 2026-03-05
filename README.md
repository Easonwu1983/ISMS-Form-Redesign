# 內部稽核管考追蹤系統 (ISMS Form Redesign)

本專案目前以前端單檔應用 (`index.html` + `app.js` + `styles.css`) 為主，支援以下功能：
- 矯正單開立、回填、追蹤、審核
- 內稽檢核表填報與管理
- 教育訓練時數統計（含暫存、正式送出、退回更正、CSV 匯出）

## 本機測試啟動

1. 進入專案目錄
```powershell
cd C:\Users\User\Playground\ISMS-Form-Redesign
```

2. 啟動本機靜態伺服器（使用專案內腳本）
```powershell
node .codex-local-server.cjs
```

3. 用瀏覽器開啟
- `http://localhost:8080`

## 測試模式說明

- 目前資料儲存在瀏覽器 `localStorage` / `sessionStorage`。
- 帳號密碼維持測試模式（方便同仁共同驗證流程）。
- 清除瀏覽器網站資料會一併清除本機測試資料。

## 專案結構

- `index.html`：入口頁
- `units.js`：正式單位階層資料（院/系所與行政單位）
- `app.js`：主要商業邏輯與畫面渲染
- `styles.css`：樣式
- `apps-script/`：Google Apps Script 後端草案
- `docs/`：操作手冊與規格文件

## 近期調整重點

- 改善日期欄位使用本地時區格式，避免跨日偏差。
- CAR 權限判斷新增 `username` 優先比對（名稱為相容 fallback）。
- 教育訓練附件新增總量保護與儲存失敗提示，降低本機暫存爆量風險。
- 前端圖示套件版本固定（避免 `latest` 造成不預期變更）。
