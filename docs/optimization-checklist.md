# ISMS 系統優化清單

> 最後更新：2026-04-03
> 依實際投報比排序，已完成項目打勾

---

## 使用者體驗升級（Phase 2）

### 🔥 最有感（每日操作痛點）

- [x] **1. 單位管理員「我的待辦」首頁**
  - [ ] 登入後顯示：未送出檢核表、待回覆矯正單、訓練完成率
  - [ ] 每個待辦項可直接點擊進入操作頁
  - [ ] 不同角色看不同待辦（管理者 vs 單位管理員）

- [x] **2. 批次催辦郵件通知**
  - [ ] 檢核表管理頁加「催辦未交單位」按鈕
  - [ ] 勾選單位 → 預覽信件 → 一鍵寄出
  - [ ] 信件含直接登入填報連結

- [x] **3. 手機版填報最佳化**
  - [ ] 檢核表單欄直式排列（手機友善）
  - [ ] 底部固定「儲存草稿」按鈕
  - [ ] 進度條置頂

### 📊 管理者決策有感

- [x] **4. 單位對比分析**
  - [ ] 依一級單位分類的完成率排行榜
  - [ ] 各單位缺失分布圖
  - [ ] 歷年同單位對比

- [x] **5. 矯正單看板視圖（Kanban）**
  - [ ] 開立→待矯正→已提案→審核中→追蹤中→結案 六欄
  - [ ] 卡片顯示：單號、單位、處理人、逾期警示
  - [ ] 拖拉改狀態

### 🔧 系統完整性

- [x] **6. 矯正單歷程時間軸**
  - [ ] 時間軸視覺化（Timeline）
  - [ ] 每個節點：誰、何時、做了什麼
  - [ ] 附件縮圖預覽

- [x] **7. 匯入錯誤明細回饋**
  - [ ] 逐行錯誤明細（第 X 行：缺少 Y 欄位）
  - [ ] 可下載錯誤報告 CSV
  - [ ] 匯入前預覽確認

### 🎨 體驗升級

- [x] **8. 深色模式**
  - [ ] CSS custom properties 切換
  - [ ] 使用者偏好記憶

- [x] **9. 首次登入導覽**
  - [ ] Step 1→2→3 引導氣泡
  - [ ] 各頁面「說明」按鈕

---

## 基礎架構優化（Phase 1 — 已完成）

---

## 短期（1-2 週，效益最高）

- [x] **儀表板實質化** — 年度稽核進度總覽
  - [x] 後端 `/api/dashboard/summary` 端點（檢核表 + 訓練 + 待處理）
  - [x] 3 張統計卡片（年度填報 0/163、訓練達成率 0%、待處理 1 項）
  - [x] 年度填報進度面板（進度條 + 已送出/草稿/未填報/年度）
  - [x] 教育訓練概覽面板（完成率進度條 + 各狀態明細）
  - [x] 僅管理者可見，單位管理員看原有畫面

- [x] **前端打包現代化** — 已使用 esbuild
  - [x] esbuild 自動 tree-shaking + code splitting（build-app-core-assets.cjs）
  - [x] 5 個 feature bundle + core bundle + CSS purge
  - [x] npm run build 一鍵建置 + 版本 key
  - [x] asset-loader.js 自動 fallback（bundle → legacy modules）

- [x] **檢核表填報體驗優化** — 已有完整實作
  - [x] 9 大類 accordion 分區（可收合展開）+ 側邊目錄導航
  - [x] 自動儲存草稿（每 60 秒 auto-save）
  - [x] 即時填報進度（0/40 + 百分比 + 各類統計）
  - [x] 未儲存離開警告（beforeunload guard）

---

## 中期（1-2 個月）

- [x] **矯正單工作流通知**
  - [x] 系統內通知：登入儀表板後 toast 顯示待處理事項數量
  - [x] Email 通知：狀態變更自動寄信（respond/review/tracking 4 個 hook）
  - [ ] 逾期提醒排程（每日檢查 + 寄信）— 需 cron job，暫未實作
  - [x] 已實作：buildStatusChangeMail + trySendStatusChangeMail

- [x] **批次操作**
  - [ ] 檢核表批次催辦：勾選未交單位 → 一鍵寄通知（需搭配 Email 排程）
  - [x] 訓練名單批次匯入：已有 Excel 匯入功能（training-module.js）
  - [x] 矯正單批次匯出 CSV：列表頁「匯出 CSV」按鈕（含單號/狀態/單位/處理人等）
  - [x] 教育訓練匯出 CSV：已有（exportTrainingSummaryCsv / exportTrainingDetailCsv）

- [x] **報表與匯出**
  - [x] 年度稽核報告 PDF：GET /api/audit-report/pdf?auditYear=115（pdfmake）
  - [x] 矯正單追蹤報表 CSV（列表頁匯出，含狀態/單位/處理人/日期）
  - [x] 教育訓練匯出（已有 exportTrainingSummaryCsv + exportTrainingDetailCsv）
  - [x] 資安窗口盤點匯出 JSON（已有 #security-window 匯出按鈕）

---

## 長期（3-6 個月）

- [ ] **後端 API 標準化**
  - [ ] 前端改為 API-first（不再暫存業務資料到 localStorage）
  - [ ] 移除 localStorage fallback（正式環境已穩定）
  - [ ] 預估效果：程式碼量減少 30%、消除跨分頁同步問題

- [x] **多年度支援**
  - [x] 儀表板年度選擇器（可切換 113/114/115 年度查看進度）
  - [x] 後端 API 支援 auditYear/trainingYear 參數
  - [x] 年度結算查詢 API：GET /api/audit-year/summary
  - [ ] 一鍵封存（需確認業務規則後開發）

- [ ] **權限精細化** — 需完整規劃（影響 DB schema + 全部授權邏輯）
  - [ ] 新增「審核者」角色（只能審核不能開單）
  - [ ] 新增「唯讀觀察者」角色（上級主管查看進度）
  - [ ] 角色授權矩陣管理介面
  - [ ] 需修改：system_users.role CHECK constraint、request-authz.cjs 全部 isAdmin/isUnitAdmin 檢查

---

## 技術債清理

- [x] **暫存檔清理** — 101 個 `tmp_*` / `.tmp_*` 已處理
  - [x] 加入 `.gitignore`（tmp_*, .tmp_*, *.bg.err.log 等）
  - [x] 不追蹤暫存檔（保留在本地供參考）

- [x] **CSS 重複定義** — `.sidebar-logo` 定義 3 次
  - [x] 合併為 1 次定義（保留最終版，前兩個改為註解）

- [x] **合約版本同步** — 9 個 contract.js + 前端版本
  - [x] 全部統一為 `2026-04-02`（後端 9 個 + 前端 m365-api-client + app.js）

- [x] **測試覆蓋** — Jest 已安裝並通過
  - [x] 核心函式 Jest 單元測試（25 tests，涵蓋 5 個 contract 模組）
  - [x] npm run test:unit 一鍵執行
  - [ ] API 端點整合測試（supertest + test DB，後續擴充）
  - [ ] 權限矩陣端對端測試（playwright，後續擴充）
  - [x] 已有：scripts/ 下 25+ 個 smoke/regression 測試腳本

---

## 已完成的修正（本次開發週期）

- [x] 18 項缺陷修復（搜索、刪除、匯入、權限、附件、名單可見性、窗口範圍）
- [x] 4 項架構優化（單位資料延遲載入、跨分頁同步、migration 冪等、樂觀鎖定）
- [x] NTU 一二級單位資料更新（152 個一級單位 from my.ntu.edu.tw）
- [x] 全流程測試 7 項 CRITICAL/HIGH 修復（race condition、session、merge）
- [x] 完整性測試 5 項修復（附件權限、檢核表單位、DOM 效能、登入 DOM）
- [x] Sidebar Logo 壓縮變形修正
- [x] DB session_version 同步修正
- [x] 儀表板實質化（年度稽核進度總覽）
