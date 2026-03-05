# 附表十（普級）對照與本專案落地清單

## 目的

本文件對照「資通安全責任等級分級辦法附表十（普級）」在系統面可落地項目，標示本專案已完成與待補強事項。

## 對照結果

1. 帳號與存取管理
- 條文重點：帳號應可識別個人、最小權限、逾期或閒置帳號管理。
- 本次落地：
  - `USERS.role` + server-side RBAC（最高管理員/單位管理員/填報人）。
  - 登入後 API 全部由後端驗證權限，不信任前端。
  - 新增 `is_active`、`locked_until`、`failed_count`。
- 待補流程：
  - 閒置帳號定期停用（需管理流程與排程）
  - 定期帳號盤點與主管覆核（行政流程）

2. 身分驗證與密碼機制
- 條文重點：強健密碼、預設密碼變更、重設機制、避免暴力破解。
- 本次落地：
  - 密碼複雜度政策（`password_*` 設定）。
  - 近 N 次密碼不可重複（`PASSWORD_HISTORY`）。
  - 首次登入/密碼過期強制改密碼（`must_change_password` gate）。
  - 登入失敗鎖定（`login_max_failures`、`login_lock_minutes`）。
  - API 登入速率限制（`login_rate_limit_*`）。
  - 一次性重設 token + 時效（`PASSWORD_RESETS`）。

3. 日誌與稽核
- 條文重點：記錄事件類型、時間、使用者、結果；保存至少 6 個月；防止竄改。
- 本次落地：
  - `LOGIN_LOGS` + `API_AUDIT` 紀錄。
  - 每筆日誌加 `integrity_hash`。
  - 日誌保留維護（`log_retention_days`，預設 180 天）。
  - 每日自動執行清理（在 API 請求時觸發 once-per-day）。

4. 傳輸與通訊保護
- 條文重點：遠端連線需安全通道與驗證。
- 本次落地：
  - Apps Script Web App 走 HTTPS。
  - 非公開 action 需 `sessionToken`。
- 待補流程：
  - 網段限制、WAF、反向代理等需由校方網路架構支援。

5. 弱點修補與變更管理
- 條文重點：弱點掃描、修補、變更留痕。
- 本次落地：
  - 重要操作落在 API 稽核紀錄。
- 待補流程：
  - 週期弱掃與修補 SLA（作業流程）
  - 程式碼審查與正式變更單（開發治理流程）

6. 備援與復原
- 條文重點：資料備份與復原測試。
- 本次落地：
  - Sheet 作為主資料，保留歷程可匯出。
- 待補流程：
  - 定期備份到獨立儲存位置
  - 復原演練與演練紀錄

## 這次實作影響的程式檔

- `apps-script/src/SheetSchema.gs`
- `apps-script/src/Config.gs`
- `apps-script/src/Security.gs`
- `apps-script/src/Auth.gs`
- `apps-script/src/Main.gs`
- `apps-script/src/Setup.gs`
- `apps-script/src/SheetRepo.gs`

## 建議下一步（可直接排進下一版）

1. 新增「帳號盤點報表」與閒置帳號自動停用排程。  
2. 新增管理端 UI：強制改密碼頁、密碼重設 token 驗證頁。  
3. 補 `Checklist/Training/CAR` 模組的完整 server-side CRUD 與版本衝突保護。  
4. 建立弱點掃描與備份復原 SOP（文件 + 週期任務）。
