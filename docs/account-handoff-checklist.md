# 切帳號接手檢查表

更新日期：2026-03-31

用途：
- 切換帳號或交接時，先看這份表就能知道哪些已完成、哪些仍待處理、哪些是目前正式鏈熱點。
- 狀態定義：
  - `done`：已完成且已驗證
  - `partial`：有改善，但仍有缺口
  - `open`：尚未完成或仍是主要待辦

## A. 已完成

| 狀態 | 項目 | 說明 |
|---|---|---|
| [x] | XLSX 懶載入 | 已從首屏同步載入移除，改為按需載入 |
| [x] | Lucide 懶載入 | 已從首屏同步載入移除，改為按需載入 |
| [x] | Core bundle | 49 個核心模組已可由 `app-core.bundle.min.js` 承接 |
| [x] | Feature bundles | `admin / case / checklist / training / unit-contact` 已有 feature bundle |
| [x] | API request dedup | GET request 去重已完成 |
| [x] | API backoff / TTL cache | exponential backoff、TTL cache、bounded eviction 已完成 |
| [x] | API 錯誤分類 | timeout / auth / validation / rate-limit / server / network 已完成 |
| [x] | Apps Script request-scoped cache | config / user / session / sheet rows 已做 request cache |
| [x] | Silent failure logging | 主要 catch 區塊已補 internal error log |
| [x] | Accessibility 基礎 | skip link、focus trap、aria-describedby、axe smoke 已完成 |
| [x] | Production logging hygiene | production console output 已大幅收斂 |
| [x] | Public apply 文案與狀態 | 亂碼與送出狀態已修正 |
| [x] | Checklist 年份異常資料 | 異常年份資料已清理並補驗證 |

## B. 仍在優化

| 狀態 | 項目 | 目前狀態 | 下一步 |
|---|---|---|---|
| [ ] | `visual:desktop:dashboard` | 仍是正式鏈前幾名熱點 | 再縮首屏 DOM 與同步渲染 |
| [ ] | `unit-admin:login` | 登入初始化仍偏重 | 延後非必要權限 / 資料檢查 |
| [ ] | `checklist:list-loaded` | 已改善，但仍偏重 | 繼續減少 remote merge 與等待 |
| [ ] | `unit-contact-public:apply-loaded` | 對外入口仍有優化空間 | 首屏只保留必要表單 |
| [ ] | `audit-trail summary-only` | warm 已改善但未穩定領先 cold | 讓 summary-only 更純 |
| [ ] | `training-forms summary-only` | warm 已改善但仍可再壓 | 讓 summary route 更快更純 |
| [ ] | `checklists summary-only` | 已改善，但還有空間 | 減少 response 重組與 merge |
| [ ] | Route destroy lifecycle | 並非全站完整覆蓋 | 補剩餘 route cleanup |
| [ ] | Virtual scrolling | 已做部分頁面 | 擴大到更多重表 |
| [ ] | Inline style 抽離 | 仍有殘留 inline style | 逐步抽 class |
| [ ] | Authenticated a11y | 已有基礎，但未全站覆蓋 | 擴充到管理頁與大表 |
| [ ] | Apps Script durable fallback | rate limit 仍偏快取導向 | 補持久化 fallback |
| [ ] | Backend cache telemetry | formal report 仍偏 summary | 補 module-level hit/miss |

## C. 目前正式鏈熱點

這些是目前最常被正式報告提到的優先項目：

- `visual:desktop:dashboard`
- `visual:desktop:unit-review`
- `checklist:list-loaded`
- `visual:public-desktop:unit-contact-apply`
- `unit-admin:login`

次要熱點：

- `unit-admin:api-scope`
- `audit-trail:loaded`

## D. 切帳號前必查

| 狀態 | 檢查項目 | 說明 |
|---|---|---|
| [ ] | `git status --short` | 先確認 tracked 工作樹是否乾淨 |
| [ ] | `deploy-manifest.json` | 本機 root manifest 是否刷新 |
| [ ] | `build-app-core-assets` | shell / CSS / bundles 有變更時必跑 |
| [ ] | VM smoke | 先驗 VM 再發 Pages |
| [ ] | Pages smoke | 不要和 full smoke 平行跑 |
| [ ] | `latest-release-report.md` | 切帳號先看正式報告熱點 |

## E. 目前已知容易撞牆的地方

- Pages 發佈前若沒刷新本機 root `deploy-manifest.json`，容易出現版本或 SRI 不一致。
- 動到 shell / CSS / bundle / asset loader 卻沒重建 core assets，正式站與 Pages 會出現舊資產。
- `cloudflare-pages-regression-smoke.cjs` 和 `formal-production-smoke.cjs` 不要平行跑，容易出現假紅燈。
- 純前端變更不需要重啟 `isms-unit-contact-backend.service` 或 `caddy.service`。
- 不要把大量未追蹤暫存檔誤判成正式衝突，先看 tracked 變更。

## F. 交接建議順序

1. 先修正式鏈熱點
2. 再收 summary-only 與 route cleanup
3. 然後處理 virtualization / inline style
4. 最後補後端 telemetry 與文件治理

