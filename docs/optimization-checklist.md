# ISMS 系統優化清單

> 最後更新：2026-04-02
> 依實際投報比排序，已完成項目打勾

---

## 短期（1-2 週，效益最高）

- [x] **儀表板實質化** — 年度稽核進度總覽
  - [x] 後端 `/api/dashboard/summary` 端點（檢核表 + 訓練 + 待處理）
  - [x] 3 張統計卡片（年度填報 0/163、訓練達成率 0%、待處理 1 項）
  - [x] 年度填報進度面板（進度條 + 已送出/草稿/未填報/年度）
  - [x] 教育訓練概覽面板（完成率進度條 + 各狀態明細）
  - [x] 僅管理者可見，單位管理員看原有畫面

- [ ] **前端打包現代化**
  - [ ] 評估 Vite / esbuild 取代手動 bundle 串接
  - [ ] 自動 tree-shaking + code splitting + hash 快取
  - [ ] 自動 sourcemap 方便 debug
  - [ ] 預估效果：首屏載入快 40-50%

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
  - [ ] 年度稽核報告 PDF — 需 PDF 庫（pdfmake），後續版本
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
  - [ ] 年度結算：一鍵封存（需另外開發）
  - [ ] 歷史資料比較報表（需另外開發）

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

- [ ] **測試覆蓋** — 需安裝 Jest（`npm i -D jest`）
  - [ ] 核心函式加 Jest 單元測試（contract.js 的 validate 函式）
  - [ ] API 端點加整合測試（supertest + test DB）
  - [ ] 權限矩陣加端對端測試（playwright）
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
