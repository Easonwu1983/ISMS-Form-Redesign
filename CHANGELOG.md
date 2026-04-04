# Changelog

## 2026-04-04

### Features
- 全模組 UI 統一化 — Design System + 6 批次視覺統一 (`47d59c0`)
- 全模組 UI 精修 — icon + 統計摘要 + 狀態 badge + 表格美化 (`064cd7b`)

### Refactoring
- server.cjs 拆出 dashboard + ops 路由模組 (1903→1638 行) (`dc4dd13`)
- asset-inventory-module 474 個 var→const/let 全部清零 (`e88c5ba`)
- 全專案 var 清零 + JSDoc + CI gate 強化 (`f5cc95a`)
- styles.css 模組化拆分 + asset-inventory inline style 重構 (`668bf72`)
- admin-module 第三個子模組 login-log + 主模組瘦身 -401 行 (`f13dd60`)
- admin-module 拆分子模組 + 測試補齊 + 區塊標記 (`333fb22`)
- 完成全部低優先技術債清理 (`18d8590`)
- 技術債清理 — var→const/let、錯誤處理、記憶體安全 (`599cbeb`)

### Fixes
- 擴充 VARCHAR 欄位長度避免 INSERT 溢出 (`57abe18`)
- 補回根目錄缺失的 unit-contact-authorization-template.pdf (`83ada9f`)

### Docs
- 修正最後 2 個文件的 SharePoint 過時引用 (`3bb0513`)
- 第二輪清理 — 刪除 6 個過時文件 + 更新 3 個文件內容 (`ff50daf`)
- 全面文件清理 — 刪除 57 個過期文件 + 更新 README/CONTRIBUTING (`61d742a`)

## 2026-04-03

### Features
- 4 頁面 UI 全面對齊資安窗口模組設計語言 (`bab2597`)
- 風險評鑑 UI 美化 — 卡片式情境選擇 + 漸層風險值 + 分類即時切換 (`af4344b`)
- 風險評鑑改為情境式選擇 + RTO/RPO/MTPD (`2a017d0`)
- 最高管理者列表依單位分組呈現 (`4f75417`)
- 儀表板美化 — 漸層進度卡 + 行政/學術/中心分組展開 (`35b5cb3`)
- 儀表板重寫 — 全校 120 單位完成狀態總覽 (`b958205`)
- 額外授權/審核資源範圍新增分類快速選取按鈕 (`212ca07`)
- 「全部送簽核」改為「年度已盤點完成」 (`583d2c2`)

### Fixes
- 修復 skeleton 覆蓋已渲染內容的 race condition (`5160309`)
- 全部符合按鈕文字置中 — span wrapper + vertical-align:middle (`671633a`)
- 附表十「全部符合」按鈕文字置中 + 評估下拉選單置中 (`da7dfdd`)
- deleteAsset 改用 window.confirm + fetch 直接呼叫 (`4a9f4ae`)

### Performance
- 載入速度與 UX 體感優化 (`f54b309`)

### Refactoring
- 移除英文名稱 + 擁有者/保管人合併 + 保管單位自動帶入 (`1c74e1b`)
- 系統名稱「內部稽核管考追蹤系統」改為「資訊安全管理系統」 (`ff4244b`)
