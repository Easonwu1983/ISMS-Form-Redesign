# 跨模組資料一致性排查指南

> **對象**：接手 ISMS 專案的工程師
> **目的**：當發現「同一個數字在不同頁面顯示不同」時，知道怎麼系統化追蹤與修復
> **來源**：2026-04-05 實際從「中心/研究 120 → 131 → 116 → 105 → 106」連續修 4 個根源的偵錯紀錄

---

## 一、先理解：ISMS 的 SSOT（單一真實來源）架構

### 1. 單位分類的 SSOT

**唯一正確來源**：`shared/unit-categories.js`

```javascript
// 15 個行政單位（嚴格白名單，代碼 0.01-0.27 + 0.80）
ADMIN_UNITS = ['秘書室', '教務處', '總務處', ...];

// 17 個學術單位（嚴格白名單，依 NTU 官網）
ACADEMIC_UNITS = ['文學院', '理學院', ..., '管理學院', ...];

// 15 個隱藏單位（醫院/分院/副校長室/紀念品等，不參與稽核）
HIDDEN_UNITS = ['國立臺灣大學系統', '臺大醫院', ..., '校長室', ...];

// 分類邏輯：在 ADMIN 白名單 → 行政；在 ACADEMIC → 學術；其他全部 → 中心
function categorizeUnit(name) { ... }
```

**重點**：
- **前端**和**後端**都必須 import 這個檔案
- 後端：`const { HIDDEN_UNITS } = require('../../shared/unit-categories.js')`
- 前端：自動透過 `window.__UNIT_CATEGORIES__` 提供

**額外的過濾正則**：SSOT 白名單之外，還要套用 `/醫院|分院|副校長|紀念品/` regex 抓動態名稱的隱藏單位。

### 2. 單位結構資料的 SSOT

**檔案**：`units-data.json`（855KB，全校單位組織結構）

**內部有 4 份資料**，必須知道哪份才是真理：

| key | 筆數 | 內容 | **何時用** |
|-----|-----|------|----------|
| `unitStructure` | **152 keys** | `{parent: [children]}` 的 level-1 字典 | **✅ SSOT——計算可見單位總數的唯一來源** |
| `unitCatalog` | 831 筆 | 扁平的所有單位（含 level-1 + level-2） | 單位下拉選單、搜尋建議 |
| `unitGroups` | 120 筆 | 過時的分組清單（**缺 32 個單位**） | ⚠️ **已棄用，不要用** |
| `unitMetaByValue` | 1360 筆 | 單位 meta（code、fullName 等） | 查單位代碼、名稱對照 |

**138 是怎麼算出來的**：
```
unitStructure 152 keys
  ── 過濾 HIDDEN_UNITS (14 個)
  = 138 可見 level-1 單位
    ├─ 15 行政
    ├─ 17 學術
    └─ 106 中心/研究
```

### 3. 每個模組應該用哪份資料？

| 模組 | 用途 | 正確來源 |
|------|------|---------|
| 儀表板 `#dashboard` | 顯示 `X/138` 總進度 | `/api/dashboard/summary` → 後端從 `unitStructure` + `HIDDEN_UNITS` 算 |
| 資產盤點總覽 `#asset-dashboard` | 分 3 類顯示 15/17/106 | 前端 `window.__OFFICIAL_UNIT_DATA__.unitStructure` |
| 單位治理 `#unit-review` | 138 分類清單 | `/api/unit-governance` → 後端 `loadOfficialUnits()` 從 `unitStructure` |
| 資安窗口 `#security-window` | 138 盤點清單 | 後端同上 |
| 資安教育訓練統計 `#training` | 分類顯示待補單位 | 前端 `getOfficialUnits()` → `unitStructure` keys |
| 單位下拉選單（all forms） | 可選單位列表 | `unitCatalog`（含二級）OK |

---

## 二、常見「同一個數字不同顯示」的根源清單

這次實際遇到的 7 個不同根源，按出現頻率排序：

### 陷阱 1：硬編碼 fallback magic number
```javascript
// ❌ 錯誤
const totalU = Number(cl.totalUnits) || 163;  // 歷史遺留
```
- **症狀**：API 回傳為空時顯示 163，但實際應該是 138
- **出現位置**：`case-module.js`、`dashboard-backend.cjs`、`ops-backend.cjs`（x2）
- **正確做法**：fallback 用動態計算，不要 magic number
```javascript
// ✅ 正確
const totalU = Number(cl.totalUnits) || computeTotalUnitsFallback() || 138;
```

### 陷阱 2：前後端資料源不對稱
```javascript
// 前端 asset-dashboard 用:
const allUnitGroups = window.__OFFICIAL_UNIT_DATA__.unitGroups || [];  // 120
// 後端 unit-governance 用:
const catalog = unitData.unitCatalog;  // 831
// 兩邊都不對！應該用 unitStructure (152)
```
- **症狀**：前端顯示 X，後端 API 回傳 Y，數字永遠對不齊
- **抓法**：見後面「工具箱」的 API vs UI 對照方法

### 陷阱 3：`unitCatalog` 有不在 `unitStructure` 的單位
- `unitCatalog` 裡有 11 個「學分學程」「性別平等教育委員會」等單位，但 `unitStructure` 沒有
- 如果用 `unitCatalog` 的 distinct parent 計算，會得到 149；用 `unitStructure` 會得到 152
- **教訓**：永遠用 `unitStructure` 作 level-1 totality 的唯一來源

### 陷阱 4：後端自己複製了一份 HIDDEN_UNITS
```javascript
// ❌ 後端 unit-governance-backend.cjs 原本寫死
const HIDDEN_OFFICIAL_UNIT_VALUES = new Set(['國立臺灣大學系統']);  // 只有 1 個！
```
- **症狀**：後端只過濾 1 個隱藏單位，前端過濾 15 個，差 14 個
- **正確做法**：後端 `require` SSOT
```javascript
const { HIDDEN_UNITS } = require('../../shared/unit-categories.js');
const HIDDEN_OFFICIAL_UNIT_VALUES = new Set(HIDDEN_UNITS || []);
```

### 陷阱 5：模組自己又加了一層額外過濾
```javascript
// ❌ training-module.js 原本
const TRAINING_DASHBOARD_EXCLUDED_UNITS = new Set([
  '學校分部總辦事處',
  '國立臺灣大學系統'
]);
```
- **症狀**：SSOT 顯示 106，但這個模組少 1 個（`學校分部總辦事處` 是中心類，被額外排除）
- **教訓**：模組不應有「私人黑名單」，所有隱藏邏輯走 SSOT `HIDDEN_UNITS`

### 陷阱 6：SQL COUNT 沒過濾隱藏/二級
```sql
-- ❌ dashboard-backend.cjs 原本
SELECT COUNT(*) FILTER (WHERE status = '草稿')::int AS draft_count FROM checklists
```
- **症狀**：dashboard 顯示 `已送出 0 + 草稿中 3 + 未填報 138 = 141 ≠ 138`
- **原因**：`draft_count=3` 包含了「臺大金山分院」（隱藏）和「計算機中心／資訊網路組」（二級）
- **修復**：在 JS 層面用 `byUnit` 陣列過濾後重算 distinct level-1

### 陷阱 7：算術不一致
```javascript
// ❌ notFiled 只扣 submitted
notFiledUnits: totalUnits - submittedUnits
```
- **症狀**：`submitted + draft + notFiled != total`
- **修復**：`notFiledUnits = total - submitted - draft`

---

## 三、系統化排查流程（5 步驟）

### Step 1：確認問題範圍
**問自己**：這個數字會在哪幾個頁面顯示？

用這個 JS snippet 對所有路由掃描：

```javascript
// 貼到 Chrome DevTools console（已登入 admin）
(async function() {
  var routes = ['#dashboard', '#list', '#create', '#checklist', '#training',
                '#assets', '#users', '#login-log', '#audit-trail',
                '#security-window', '#checklist-manage', '#checklist-compare',
                '#training-roster', '#unit-review', '#asset-dashboard',
                '#data-import', '#asset-compare'];
  var findings = {};
  for (var i = 0; i < routes.length; i++) {
    window.location.hash = routes[i];
    await new Promise(function(r) { setTimeout(r, 1500); });
    var text = document.getElementById('app').textContent;
    // 找關鍵字附近的數字（本例查「中心/研究」）
    var m = text.match(/中心\s*\/\s*研究[^。]{0,50}?(\d+)/);
    if (m) findings[routes[i]] = parseInt(m[1]);
  }
  window.location.hash = '#dashboard';
  return JSON.stringify(findings, null, 1);
})();
```

產出：`{ #asset-dashboard: 106, #unit-review: 131, #training: 116, ... }`

**立刻看出**：有 3 個不同數字 → 3 個不同根源

### Step 2：對照後端 API 直接回傳值
**問自己**：是後端算錯還是前端渲染錯？

```javascript
// 直接打 API，繞過前端渲染
(async function() {
  var session = null;
  for (var i = 0; i < sessionStorage.length; i++) {
    try { var v = JSON.parse(sessionStorage.getItem(sessionStorage.key(i)));
          if (v && v.sessionToken) { session = v; break; } } catch(e){}
  }
  var token = session.sessionToken;
  var r = await fetch('/api/unit-governance', { headers: {'Authorization': 'Bearer ' + token} });
  return JSON.stringify(await r.json(), null, 1);
})();
```

**判斷**：
- 如果 API 回傳 `summary.total = 163` → **後端有問題**
- 如果 API 回傳 `summary.total = 138` 但 UI 顯示 163 → **前端渲染有問題**

### Step 3：找到 render 函式與資料流
**路由 → 函式對照**：都在 `app-page-orchestration-module.js`

```javascript
// 例如
'asset-dashboard': {
  render: () => m.renderAssetDashboard()  // 在 asset-inventory-module.js
},
'unit-review': {
  render: () => m.renderUnitReview()  // 在 admin-module.js
}
```

用 grep 反向追：
```bash
# 從顯示的文字追 render 函式
grep -n "中心 / 研究" asset-inventory-module.js

# 從 render 函式追資料源
grep -n "unitGroups\|unitStructure\|unitCatalog" asset-inventory-module.js

# 從後端 API 追 backend 檔案
grep -rn "api/unit-governance" m365/campus-backend/
```

### Step 4：對照 SSOT 與實際來源
做一個小表：

| 模組 | 它現在用什麼 | 該用什麼（SSOT）| 差異 |
|------|------------|---------------|------|
| asset-dashboard | `unitGroups` (120) | `unitStructure` (152) | 缺 32，含管理學院！|
| unit-review backend | `unitCatalog` + 只 filter 1 hidden | `unitStructure` + SSOT HIDDEN | 多 25 |
| training | `unitCatalog` 展開 distinct parent (149) | `unitStructure` keys (152) | 多 11 非結構單位 |

**核心原則**：**所有衍生數字都必須可以從同一個 SSOT 追到**。

### Step 5：修復 → Build → Deploy → Verify（4 段式）

```bash
# 1. 改 code
vim unit-module.js

# 2. Build (前端)
node scripts/build-app-core-assets.cjs

# 3. Bump versionKey（**最容易漏掉的步驟**）
node -e "const{getBuildInfo}=require('./scripts/build-version-info.cjs');
const fs=require('fs');const i=getBuildInfo('campus-host');
fs.writeFileSync('deploy-manifest.json',JSON.stringify({builtAt:i.builtAt,versionKey:i.versionKey,buildInfo:i},null,2));
console.log('versionKey:',i.versionKey);"

# 4. 再 build 一次讓新的 versionKey 寫入 bundle
node scripts/build-app-core-assets.cjs

# 5. Git commit + push
git add -A && git commit -m "fix: ..." && git push origin main

# 6. Deploy 到 VM
powershell -ExecutionPolicy Bypass -File .tmp_deploy.ps1

# 7. 瀏覽器驗證（**必做**）
# - DevTools console 清 SW + cache
# - Ctrl+Shift+R 硬重載
# - 對每個模組重新跑 Step 1 的 JS 掃描
```

**瀏覽器快取清除 JS**：
```javascript
(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const r of regs) await r.unregister();
  const names = await caches.keys();
  for (const n of names) await caches.delete(n);
  console.log('cleared');
})();
```

---

## 四、工具箱

### A. JS 查詢片段（Chrome DevTools）

**1. 查「單位分類」SSOT 狀態**
```javascript
(() => {
  var c = window.__UNIT_CATEGORIES__;
  return { admin: c.ADMIN_UNITS.length, academic: c.ACADEMIC_UNITS.length, hidden: c.HIDDEN_UNITS.length };
})();
// 預期：{ admin: 15, academic: 17, hidden: 15 }
```

**2. 查 `unitStructure` 實際可見數**
```javascript
(() => {
  var s = window.__OFFICIAL_UNIT_DATA__.unitStructure;
  var hidden = new Set(window.__UNIT_CATEGORIES__.HIDDEN_UNITS);
  var re = /醫院|分院|副校長|紀念品/;
  var visible = Object.keys(s).filter(n => !hidden.has(n) && !re.test(n));
  var cats = { admin: 0, academic: 0, center: 0 };
  visible.forEach(n => {
    var c = window.__UNIT_CATEGORIES__.categorizeUnit(n);
    if (c === '行政單位') cats.admin++;
    else if (c === '學術單位') cats.academic++;
    else cats.center++;
  });
  return { total: visible.length, ...cats };
})();
// 預期：{ total: 138, admin: 15, academic: 17, center: 106 }
```

**3. 抓當前頁面任何「單位」旁邊的數字**
```javascript
(() => {
  var text = document.getElementById('app').textContent;
  var matches = [];
  var re = /(\d+)\s*個?\s*(?:一級|二級)?\s*單位/g;
  var m;
  while ((m = re.exec(text))) matches.push({ n: m[1], ctx: text.substring(Math.max(0, m.index-15), m.index+20) });
  return matches;
})();
```

**4. 直接打後端 API（需登入）**
```javascript
(async () => {
  var s;
  for (var i = 0; i < sessionStorage.length; i++) {
    try { var v = JSON.parse(sessionStorage.getItem(sessionStorage.key(i)));
          if (v && v.sessionToken) { s = v; break; } } catch(e){}
  }
  var r = await fetch('/api/dashboard/summary', { headers: {'Authorization': 'Bearer ' + s.sessionToken} });
  return await r.json();
})();
```

### B. Grep 技巧

```bash
# 追「數字 163」的所有出現位置（可能是硬編碼）
grep -rn "\b163\b" --include="*.js" --include="*.cjs" \
  --exclude-dir=node_modules --exclude-dir=dist

# 追「hidden filter」相關程式碼
grep -rn "HIDDEN_UNITS\|HIDDEN_OFFICIAL\|醫院|分院|副校長" \
  --include="*.js" --include="*.cjs" .

# 追 magic number fallback
grep -rn "|| 138\||| 163\|Math.max.*138\|Math.max.*163" \
  --include="*.cjs" m365/

# 追某個單位的所有分類邏輯
grep -rn "categorizeUnit\|categorizeTopLevelUnit\|classifyUnit" \
  --include="*.js" .
```

### C. 後端 API 快速查詢

| API | 提供什麼 |
|-----|---------|
| `GET /api/dashboard/summary` | 儀表板統計（totalUnits/submittedUnits/draftCount/notFiledUnits）|
| `GET /api/unit-governance` | 單位治理（138 分類清單 + 子單位）|
| `GET /api/system-users` | 帳號列表（含 role/unit）|
| `GET /api/assets/summary` | 資產統計（byUnit）|
| `GET /api/checklists?summaryOnly=1&auditYear=115` | 檢核表年度統計 |

---

## 五、本次實戰案例（完整修復鏈路）

### 用戶主訴
> 「各模組中心/研究數量還是沒統一」

### 偵錯過程時間軸

| 輪次 | 發現 | 根源 | 修復位置 |
|------|------|------|---------|
| 1 | asset-dashboard 120 ≠ dashboard 163 | `unitGroups` (120) 缺 32 單位 + hardcoded 163 fallback | `asset-inventory-module.js` 改用 `unitStructure`；`case-module.js` 動態 fallback；後端 3 處 `163` → `138` |
| 2 | unit-review 131 ≠ 106 | frontend 已修但 backend API 回 131 | `admin-module.js` `buildGovernanceTopLevelUnitIndex` 加 HIDDEN filter |
| 3 | unit-review API 還是 163 | backend `HIDDEN_OFFICIAL_UNIT_VALUES` 只有 1 個；用了 `unitCatalog` | `unit-governance-backend.cjs` import SSOT + 改用 `unitStructure` |
| 4 | dashboard 0+3+138=141 ≠ 138 | `draftCount` SQL 沒過濾 hidden 和 level-2 | `dashboard-backend.cjs` 用 `byUnit` 陣列 JS 層過濾 |
| 5 | training 116 ≠ 106 | `unit-module.js` `getOfficialUnits()` 用 `unitCatalog` 展開；差 11 非結構單位 | 改用 `unitStructure` keys |
| 6 | training 105 ≠ 106 | `TRAINING_DASHBOARD_EXCLUDED_UNITS` 額外排除 `學校分部總辦事處` | 清空這個 Set |

### 經驗教訓（最重要）

1. **「修完了」不等於「全修完了」** — 要跨模組完整掃描才算通過
2. **前後端要對照** — 前端改了不等於後端也改了
3. **每個模組可能有私人黑名單** — 要清查所有 `EXCLUDED` / `HIDDEN` 常數
4. **Magic number 是毒藥** — `|| 163` 這種 fallback 會跨越部署存活好幾年
5. **SSOT 的力量** — 後端 `require('../../shared/unit-categories.js')` 比複製一份安全 100 倍

---

## 六、預防性檢查清單（新功能開發時）

在 PR 合併前，問自己：

- [ ] 我顯示的「N 個單位」數字，用的是 `unitStructure` 還是其他資料源？
- [ ] 我的分類邏輯有沒有 import `shared/unit-categories.js` 的 `categorizeUnit`？
- [ ] 我的隱藏名單有沒有 import SSOT 的 `HIDDEN_UNITS`？有沒有額外「私人黑名單」？
- [ ] 如果前端和後端都要算這個數字，兩邊的過濾邏輯有沒有對齊？
- [ ] 我的 `|| fallback` 是 magic number 還是動態計算？
- [ ] 我的 SQL `COUNT(*)` 有沒有過濾 level-2 單位（`unit LIKE '%／%'`）和 HIDDEN？
- [ ] 我的算術關係（`total = a + b + c`）是不是一定成立？
- [ ] 我有沒有對所有相關路由跑一次「數字掃描 JS」？

---

## 七、相關文件

- `shared/unit-categories.js` — 分類 SSOT（本指南核心）
- `units-data.json` — 單位結構原始資料
- `docs/release-and-rollback.md` — 部署流程
- `CHANGELOG.md` — 修復歷史（搜尋 "138" 可看到本次修復鏈路）
- `memory/project_isms_overview.md` — 專案全貌（22 路由、測試帳號）

---

*撰寫日期：2026-04-05*
*依據：本次從「中心/研究 116 → 106」連續 4 輪修復的實戰經驗整理*
