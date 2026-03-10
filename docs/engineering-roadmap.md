# Engineering Roadmap

- Updated: 2026-03-10
- Perspective: maintainability, testability, release safety

## Current Snapshot

這個專案目前已經能穩定支撐三條主要業務流程，也有成形的自動化回歸；但從工程維護角度看，還有幾個明顯瓶頸：

1. `app.js` 是大型單檔，混合了：
   - 路由
   - 權限
   - 畫面 render
   - 事件綁定
   - localStorage schema
   - 匯入匯出

2. 畫面仍高度依賴 `innerHTML` 與 inline `onclick`
   - 改版快，但維護成本高
   - selector 與互動容易分散
   - 某些功能較難局部重構

3. 資料層目前以 `localStorage` 為主，缺少明確 schema version
   - 新欄位與舊資料相容要靠個別函式補救
   - 長期容易出現 hidden migration bug

4. 自動化測試已經進步很多，但仍存在 helper 重複與 domain 分散
   - role flow 與 training flow 部分工具可再共用
   - 測試結果目前以 JSON 為主，缺少整合摘要

## 已完成的近期改善

這一輪已先補上幾個回報很高的項目：

- `.gitignore` 已忽略 `test-artifacts/`、`server.log`、`server.pid`
- 新增 `scripts/run-with-local-server.cjs`
- `package.json` 已補齊 training regression 與完整 `test:all`
- GitHub Actions 已改跑完整回歸
- README 與 QA 文件已整理成可直接使用的版本

## Priority 1: 拆出領域模組

### 建議做法

把 `app.js` 依領域拆成：

- `auth`
- `units`
- `correction`
- `checklist`
- `training`
- `ui/shared`
- `storage`

### 預期收益

- 降低單次改動的理解成本
- 讓 NotebookLM 與人工 review 都更容易精準定位
- 後續加測試時不必一直從單一大檔追邏輯

## Priority 2: 移除高風險 inline onclick

### 先從這些區塊開始

- 矯正單 detail action buttons
- 帳號管理 modal actions
- 檢核表管理題目操作
- 教育訓練 dashboard actions

### 建議做法

- 將 action 透過 `data-action` + event delegation 集中處理
- 保留 `data-testid`，不要讓測試跟著事件實作方式綁死

## Priority 3: 建立 storage schema version

### 建議做法

- 每個 localStorage store 增加 `version`
- 啟動時跑一次 migration dispatcher
- 把像教育訓練的 `無須 -> 不適用` 這類修補，移到 migration 層而不是 scattered normalize

### 預期收益

- 新需求不會一直把 normalize 函式越堆越厚
- 舊資料修復有單一入口

## Priority 4: 建立回歸摘要器

### 建議做法

- 新增一支 script，自動彙整最新一次 `test-artifacts/` 的 summary
- 輸出單一 markdown 或 JSON summary
- 讓 CI 與 NotebookLM 都能更容易讀取

## Priority 5: 文件與編碼治理

### 目前觀察

- 專案過去有部分文件出現亂碼或過期路徑
- 不同文件對 server、測試指令、工作路徑的描述不一致

### 建議做法

- 所有文件統一 UTF-8
- 所有路徑以目前 workspace 為準
- README、QA guide、pre-launch checklist 作為主入口

## 推薦下一步

如果要我從工程報酬比最高的地方繼續做，我建議順序是：

1. 先把 `app.js` 中的 `training` 模組切出第一個獨立檔案
2. 再把矯正單 detail 的 inline action 改成 event delegation
3. 然後補 `storage version + migration bootstrap`

這三步做完，這個專案的可維護性會明顯上一個層級。
