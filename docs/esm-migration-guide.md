# ES Modules 遷移指南

## 遷移策略

**漸進式遷移**：不一次改完 53 個模組，而是：
1. 新模組直接用 ESM 寫
2. 既有模組逐步加 JSDoc 型別
3. 大模組拆分（admin-module 259KB → 多個小模組）

## 現有架構

```
index.html
  → asset-loader.js（載入 app-core.bundle.min.js 或 fallback 到個別模組）
  → app-core.bundle.min.js（esbuild IIFE bundle，包含 49 個模組）
  → feature-bundles/（esbuild ESM，懶載入：admin, case, checklist, training, unit-contact）
```

## 為什麼不直接全改 ESM？

1. `app-core.bundle.min.js` 用 IIFE format，改成 ESM 需要改 `<script type="module">`
2. 改了之後不支援 IE11（臺大可能有部分舊電腦）
3. 53 個模組一次改完風險太高

## 正確做法

### 新模組：直接用 ESM

```javascript
// ✅ 新模組範例：src/utils/date-format.js
/**
 * @param {string} iso
 * @returns {string}
 */
export function formatTaipeiDate(iso) {
  const d = new Date(iso);
  const y = d.getFullYear() - 1911;
  return `${y}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
```

esbuild 會自動把 ESM import 打包進 IIFE bundle，不需要改任何載入邏輯。

### 既有模組：加 JSDoc 型別

```javascript
// ✅ 在檔案最上方加 @ts-check 和型別引用
// @ts-check
/** @typedef {import('./types/contracts').SystemUser} SystemUser */

(function () {
  /**
   * @param {SystemUser} user
   * @returns {boolean}
   */
  function isAdmin(user) {
    return user.role === '最高管理員';
  }
  // ...
})();
```

### 大模組拆分

`admin-module.js`（259KB）應拆為：
- `admin-users.js` — 帳號管理
- `admin-review.js` — 申請審核
- `admin-security-window.js` — 資安窗口
- `admin-audit-trail.js` — 操作軌跡
- `admin-governance.js` — 單位治理

## TypeScript 型別定義

所有共用型別放在 `types/contracts.d.ts`，已定義：
- SystemUser, Checklist, CorrectiveAction, TrainingForm
- DashboardSummary, MyTasks, UnitStructure
- 所有 status enum types

## 建置指令

```bash
npm run build          # 重建 bundle + version key
npm run test:unit      # Jest 單元測試
npx tsc --noEmit       # TypeScript 型別檢查（不產出檔案）
```
