# 切帳號交接版

這份是給下一個 AI 接手用的，重點是「哪些已完成、哪些還沒完成、先看什麼」。

## 先看這三份

1. [operational-steps-only.md](./operational-steps-only.md)
2. [pre-release-must-read.md](./pre-release-must-read.md)
3. [handoff-index.md](./handoff-index.md)

## 已完成

| 項目 | 狀態 | 備註 |
|---|---|---|
| XLSX 懶載入 | done | 已移出首屏同步載入 |
| Lucide 懶載入 | done | 已移出首屏同步載入 |
| Core bundle | done | `app-core.bundle.min.js` |
| Feature bundles | done | `admin / case / checklist / training / unit-contact` |
| CSS minify | done | `styles.min.css` |
| CSS purge | done | `styles.purged.min.css` |
| API request dedup | done | GET 去重 |
| API backoff / TTL | done | 已有 retry 與 bounded cache |
| API error taxonomy | done | 已分型 |
| Apps Script request cache | done | config / user / session / rows |
| Silent failure logging | done | 失敗會記內部日誌 |
| Skip link / modal / axe | done | a11y 基線已補 |
| Page teardown | partial | 主要路由已補，仍可再收尾 |
| Virtual scrolling | partial | 已擴到部分大表 |
| Summary-only fast path | partial | `audit-trail / checklists / training-forms` 已改善 |

## 仍在優化

| 項目 | 狀態 | 備註 |
|---|---|---|
| `visual:desktop:dashboard` | open | 目前仍是熱點 |
| `visual:desktop:unit-review` | open | 仍值得再壓 |
| `checklist:list-loaded` | open | 已改善，但還可再壓 |
| `visual:public-desktop:unit-contact-apply` | open | 對外入口 |
| `unit-admin:login` | open | 管理者登入初始化 |
| `unit-admin:api-scope` | open | 管理面 API scope 驗證 |
| `audit-trail:loaded` | open | 大表載入仍可再收斂 |
| `training-forms summary-only` | partial | warm 還要更穩 |
| `checklists summary-only` | partial | warm 已改善，還能再壓 |
| `route destroy lifecycle` | open | 末端 cleanup 還可補齊 |
| `Inline style` 抽離 | open | 仍有模板內 `style="..."` |
| `Authenticated a11y` | open | 管理頁可再補 |
| `Apps Script durable fallback` | open | rate limit 仍可補持久化 |
| `Backend cache telemetry` | open | 仍可加更完整的 module-level 指標 |

## 目前正式鏈熱點

以 `logs/formal-production/latest-release-report.md` 為準，先盯這些：

- `visual:desktop:dashboard`
- `visual:desktop:unit-review`
- `checklist:list-loaded`
- `visual:public-desktop:unit-contact-apply`
- `unit-admin:login`

## 切帳號前必做

1. `git status --short`
2. 看 `logs/formal-production/latest-release-report.md`
3. 確認沒有新 tracked 變更卡住
4. 如果本輪動到 shell / CSS / bundle / asset loader，先跑 `node scripts/build-app-core-assets.cjs`
5. 如果要發 Pages，先刷新 root `deploy-manifest.json`

## 切帳號後先做

1. 先看 `docs/handoff-index.md`
2. 再看 `docs/boot-checklist.md`
3. 接著看 `logs/formal-production/latest-release-report.md`
4. 只在 report 之外的地方找問題，不要先盯未追蹤暫存檔

## 不要重工

- 正式部署只走 `useradmin@140.112.97.150`
- 不要再走 guest `127.0.0.1:2222`
- `cloudflare-pages-regression-smoke.cjs` 不和平行 `formal-production-smoke.cjs`
- `styles.min.css` / `styles.purged.min.css` 是正常 build 產物

