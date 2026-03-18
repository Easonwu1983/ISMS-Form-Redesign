# ISMS Audit Report 2026-03-18 Remediation Matrix

本表依據 [C:\Users\User\Desktop\ISMS-Audit-Report-2026-03-18.pdf](C:\Users\User\Desktop\ISMS-Audit-Report-2026-03-18.pdf) 與 [scripts/generate-audit-report.py](C:\Users\User\Playground\ISMS-Form-Redesign\scripts\generate-audit-report.py) 的 issue 清單整理。

狀態定義：
- `已驗證`：已修正，且已在 live smoke / browser smoke / security smoke 或既有流程中驗證。
- `本輪新修`：本輪已修到 repo，已完成 `node --check`，但尚未重新做 live 部署驗證。
- `部分修正`：已有明顯改善，但原始風險尚未完全消除。
- `未修`：仍待處理。

## Summary

| 狀態 | 數量 |
| --- | ---: |
| 已驗證 | 36 |
| 本輪新修 | 7 |
| 部分修正 | 1 |
| 未修 | 0 |

## Detail

| ID | 嚴重度 | 狀態 | 說明 | 主要位置 |
| --- | --- | --- | --- | --- |
| C1 | Critical | 已驗證 | 前端已移除硬編碼測試帳密；本機模式改成首次建立管理員帳號。 | [app.js](C:\Users\User\Playground\ISMS-Form-Redesign\app.js), [shell-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\shell-module.js) |
| C2 | Critical | 已驗證 | local mode 改為 hash 驗證，不再做明文比對。 | [auth-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\auth-module.js) |
| C3 | Critical | 已驗證 | `AUTH_SESSION_SECRET` 改為必填，未設定直接拒絕啟動。 | [request-authz.cjs](C:\Users\User\Playground\ISMS-Form-Redesign\m365\campus-backend\request-authz.cjs) |
| C4 | Critical | 已驗證 | login / reset / public application 都已有限流與 lockout。 | [system-user-backend.cjs](C:\Users\User\Playground\ISMS-Form-Redesign\m365\campus-backend\system-user-backend.cjs), [server.cjs](C:\Users\User\Playground\ISMS-Form-Redesign\m365\campus-backend\server.cjs) |
| C5 | Critical | 已驗證 | localStorage 寫入加 quota rollback 與警示。 | [data-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\data-module.js) |
| C6 | Critical | 部分修正 | 已補 rollback、cache invalidation、corruption warning，但資料層仍未做真正 lock / transaction。 | [data-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\data-module.js) |
| C7 | Critical | 已驗證 | `parseJsonBody()` 已有限制 body size。 | [server.cjs](C:\Users\User\Playground\ISMS-Form-Redesign\m365\campus-backend\server.cjs) |
| H1 | High | 已驗證 | 空白 unit 不再對所有人放行。 | [policy-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\policy-module.js), [request-authz.cjs](C:\Users\User\Playground\ISMS-Form-Redesign\m365\campus-backend\request-authz.cjs) |
| H2 | High | 已驗證 | viewer 沒有 active unit 時不再變成全域可讀。 | [policy-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\policy-module.js), [request-authz.cjs](C:\Users\User\Playground\ISMS-Form-Redesign\m365\campus-backend\request-authz.cjs) |
| H3 | High | 已驗證 | case handler / owner 改成 strict username match。 | [policy-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\policy-module.js), [request-authz.cjs](C:\Users\User\Playground\ISMS-Form-Redesign\m365\campus-backend\request-authz.cjs) |
| H4 | High | 已驗證 | training 編修權限已收斂成 admin 或 filler 本人。 | [policy-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\policy-module.js), [request-authz.cjs](C:\Users\User\Playground\ISMS-Form-Redesign\m365\campus-backend\request-authz.cjs) |
| H5 | High | 已驗證 | GET API 已加入 retry / backoff。 | [m365-api-client.js](C:\Users\User\Playground\ISMS-Form-Redesign\m365-api-client.js) |
| H6 | High | 已驗證 | 401 會統一轉成「登入狀態已失效，請重新登入」。 | [m365-api-client.js](C:\Users\User\Playground\ISMS-Form-Redesign\m365-api-client.js), [app.js](C:\Users\User\Playground\ISMS-Form-Redesign\app.js) |
| H7 | High | 已驗證 | remote success / normalize fail 已改成回傳暫時結果與 warning，不再直接報錯誘發重送。 | [m365-api-client.js](C:\Users\User\Playground\ISMS-Form-Redesign\m365-api-client.js) |
| H8 | High | 已驗證 | 密碼與 request seed 已改用 crypto-based random。 | [auth-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\auth-module.js), [m365-api-client.js](C:\Users\User\Playground\ISMS-Form-Redesign\m365-api-client.js) |
| M1 | Medium | 已驗證 | training 原生 `confirm/prompt` 已改成共用 modal。 | [training-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\training-module.js), [ui-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\ui-module.js) |
| M2 | Medium | 已驗證 | 登入後 300ms 人工 delay 已移除。 | [shell-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\shell-module.js) |
| M3 | Medium | 已驗證 | 矯正單狀態切換已加確認對話框。 | [case-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\case-module.js) |
| M4 | Medium | 已驗證 | 開單時不再自動選第一位處理人。 | [case-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\case-module.js) |
| M5 | Medium | 已驗證 | public 申請 submit 期間會 disable 按鈕。 | [unit-contact-application-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\unit-contact-application-module.js) |
| M6 | Medium | 本輪新修 | 共用 busy overlay 已補進 UI，`checklist` 與 `training` 核心儲存/匯入流程接上。 | [ui-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\ui-module.js), [styles.css](C:\Users\User\Playground\ISMS-Form-Redesign\styles.css), [app.js](C:\Users\User\Playground\ISMS-Form-Redesign\app.js), [training-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\training-module.js), [checklist-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\checklist-module.js) |
| M7 | Medium | 本輪新修 | `training` 與 `checklist` 草稿儲存後改成 in-place route replace，不再 full navigate。 | [training-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\training-module.js), [checklist-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\checklist-module.js) |
| M8 | Medium | 已驗證 | `training` 名單表仍是整個 tbody 重繪，但鍵盤焦點已可在刪除後正確回復到有效 roster button；已補專屬 smoke 驗證。 | [training-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\training-module.js), [training-roster-focus-smoke.cjs](C:\Users\User\Playground\ISMS-Form-Redesign\scripts\training-roster-focus-smoke.cjs) |
| M9 | Medium | 已驗證 | unit search dropdown 已改用 `mousedown`，且 blur race 已放寬。 | [unit-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\unit-module.js) |
| M10 | Medium | 已驗證 | unit search 已補 ARIA combobox pattern。 | [unit-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\unit-module.js) |
| M11 | Medium | 已驗證 | public / login / app shell 都已加入 skip link。 | [shell-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\shell-module.js) |
| M12 | Medium | 已驗證 | route change 後會 focus 到主內容 / heading。 | [shell-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\shell-module.js) |
| M13 | Medium | 已驗證 | 真正的安全標頭已由 gateway / backend response 設定。 | [host-campus-gateway.cjs](C:\Users\User\Playground\ISMS-Form-Redesign\host-campus-gateway.cjs), [server.cjs](C:\Users\User\Playground\ISMS-Form-Redesign\m365\campus-backend\server.cjs) |
| M14 | Medium | 已驗證 | `toDateInputValue` regex 已修正。 | [checklist-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\checklist-module.js) |
| M15 | Medium | 本輪新修 | checklist JS submit validation 已補 unit non-empty 檢查。 | [checklist-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\checklist-module.js) |
| M16 | Medium | 本輪新修 | checklist duplicate check 已擴到 admin / multi-unit，不再只限 single-unit。 | [checklist-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\checklist-module.js), [app.js](C:\Users\User\Playground\ISMS-Form-Redesign\app.js) |
| L1 | Low | 已驗證 | `mkChk` value 已做 attribute escape。 | [ui-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\ui-module.js) |
| L2 | Low | 已驗證 | `ic()` icon name 已 sanitize / escape。 | [ui-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\ui-module.js) |
| L3 | Low | 已驗證 | 已加 `storage` event listener。 | [data-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\data-module.js) |
| L4 | Low | 已驗證 | JSON parse fail 會清壞資料並發 warning。 | [data-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\data-module.js) |
| L5 | Low | 已驗證 | attachment IndexedDB 不可用時已有 fallback / user warning 路徑。 | [attachment-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\attachment-module.js) |
| L6 | Low | 已驗證 | `isOfficialUnit('')` 已改成 false。 | [unit-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\unit-module.js) |
| L7 | Low | 已驗證 | API timeout 已拆成 read / write / training batch。 | [m365-api-client.js](C:\Users\User\Playground\ISMS-Form-Redesign\m365-api-client.js) |
| L8 | Low | 已驗證 | print popup blocker 已有 iframe fallback。 | [workflow-support-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\workflow-support-module.js) |
| L9 | Low | 本輪新修 | tracking UI 已加入 `Round N/3`。 | [case-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\case-module.js) |
| L10 | Low | 本輪新修 | Graph upstream error 已改為 server-side log + generic client message。 | [server.cjs](C:\Users\User\Playground\ISMS-Form-Redesign\m365\campus-backend\server.cjs) |
| L11 | Low | 本輪新修 | audit row failure 不再 silent ignore，改成 console error。 | [server.cjs](C:\Users\User\Playground\ISMS-Form-Redesign\m365\campus-backend\server.cjs) |
| L12 | Low | 已驗證 | 已加入 session heartbeat / expiry warning。 | [app.js](C:\Users\User\Playground\ISMS-Form-Redesign\app.js) |
| L13 | Low | 已驗證 | training sync error 已記 `console.warn`，不再完全吞掉。 | [training-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\training-module.js) |

## Follow-up

目前真正未完全關閉的只剩 1 項：
1. `C6`：local data store 仍缺真正 transaction / lock。
