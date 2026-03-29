# 優化缺口清單

以 2026-03-29 專案現況對照五項優化報告。

## 1. 載入效能：模組拆分與資源懶載入

狀態：部分完成

已完成：
- `app.js` 已持續拆成多個 runtime/access/orchestration 模組。
- 正式鏈最慢視覺步驟已壓掉數個大熱點。
- `vendor/xlsx.full.min.js` 已改成按需載入，不再阻塞首屏。

未完成：
- [C:\Users\User\Playground\ISMS-Form-Redesign\asset-loader.js](C:\Users\User\Playground\ISMS-Form-Redesign\asset-loader.js) 仍同步順序載入約 60 個 JS 檔。
- `vendor/lucide.min.js` 仍在首屏全量載入。
- [C:\Users\User\Playground\ISMS-Form-Redesign\admin-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\admin-module.js)、[C:\Users\User\Playground\ISMS-Form-Redesign\training-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\training-module.js)、[C:\Users\User\Playground\ISMS-Form-Redesign\checklist-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\checklist-module.js) 仍未按路由懶載入。
- 專案仍未引入 bundler、minification、tree shaking。

下一步：
- 先把 `lucide` 改成延後或按需載入。
- 再做 route-level lazy load。
- 最後再切 bundler。

## 2. CSS 瘦身與結構化

狀態：大多未完成

已完成：
- 部分高頻頁視覺 baseline 已改成 focused shell，減少視覺測試成本。

未完成：
- [C:\Users\User\Playground\ISMS-Form-Redesign\styles.css](C:\Users\User\Playground\ISMS-Form-Redesign\styles.css) 仍約 `8805` 行 / `173KB`。
- 尚未做 CSS minification。
- 尚未建立 PurgeCSS safelist，也未跑 purge。
- [C:\Users\User\Playground\ISMS-Form-Redesign\admin-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\admin-module.js)、[C:\Users\User\Playground\ISMS-Form-Redesign\training-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\training-module.js)、[C:\Users\User\Playground\ISMS-Form-Redesign\checklist-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\checklist-module.js)、[C:\Users\User\Playground\ISMS-Form-Redesign\case-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\case-module.js) 仍有大量 inline style。

下一步：
- 先抽離高頻模板的 inline style。
- 再做 minify。
- 最後建立 safelist 後再做 purge。

## 3. API 層強化：去重、快取與重試

狀態：部分完成

已完成：
- [C:\Users\User\Playground\ISMS-Form-Redesign\m365-api-client.js](C:\Users\User\Playground\ISMS-Form-Redesign\m365-api-client.js) 已有 GET request dedup。
- 已有 TTL response cache。
- 已有 retry 與 error taxonomy。
- [C:\Users\User\Playground\ISMS-Form-Redesign\collection-cache-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\collection-cache-module.js) 已有 bounded cache store。

未完成：
- TTL 策略仍偏短且不一致。
- 模組級 cache hit/miss 仍不夠完整。
- `training-forms` / `checklists` / `audit-trail` 的 warm path 還沒有穩定明顯快於 cold。

下一步：
- 把 summary-only 路徑再純化。
- 把 module-level cache telemetry 補齊到 release report。

## 4. 無障礙性（Accessibility）

狀態：部分完成

已完成：
- [C:\Users\User\Playground\ISMS-Form-Redesign\shell-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\shell-module.js) 已補 `skip link`、`role="main"`、`aria-live`、部分 `aria-label`。
- [C:\Users\User\Playground\ISMS-Form-Redesign\ui-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\ui-module.js) 的 modal 已有 `focus trap` 與 `focus return`。

未完成：
- [C:\Users\User\Playground\ISMS-Form-Redesign\admin-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\admin-module.js)、[C:\Users\User\Playground\ISMS-Form-Redesign\training-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\training-module.js)、[C:\Users\User\Playground\ISMS-Form-Redesign\checklist-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\checklist-module.js)、[C:\Users\User\Playground\ISMS-Form-Redesign\case-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\case-module.js) 仍有大量 `innerHTML` 模板缺少 ARIA。
- 多數表格仍缺 `scope` / `caption`。
- 鍵盤導航與高頻頁 a11y smoke 尚未制度化。

下一步：
- 先補高頻頁：
  - `dashboard`
  - `users`
  - `unit-contact-review`
  - `training`
  - `checklists`
- 再把 axe/Playwright 接進正式 smoke。

## 5. 記憶體管理：Listener 與 Cache 清理

狀態：部分完成

已完成：
- pager 已改成 root-level event delegation。
- [C:\Users\User\Playground\ISMS-Form-Redesign\collection-cache-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\collection-cache-module.js) 已有 TTL + bounded eviction。

未完成：
- [C:\Users\User\Playground\ISMS-Form-Redesign\admin-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\admin-module.js)、[C:\Users\User\Playground\ISMS-Form-Redesign\training-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\training-module.js)、[C:\Users\User\Playground\ISMS-Form-Redesign\checklist-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\checklist-module.js)、[C:\Users\User\Playground\ISMS-Form-Redesign\case-module.js](C:\Users\User\Playground\ISMS-Form-Redesign\case-module.js) 仍有大量局部 `addEventListener`。
- 尚未建立全站級 `destroyPage()` / page teardown hook。
- 大列表尚未做 virtual scrolling。

下一步：
- 先收 `admin` / `training` 的 page-level teardown。
- 再評估 `audit-trail` / `training roster` virtual scrolling。
