# 切帳號快速接手手冊

這份文件的目的很單純：讓你切帳號後不用重新學一次啟動、部署、驗證流程，直接照已驗證過的步驟做。

## 先看這個

- 正式站：`https://isms-campus-portal.pages.dev/`
- 校內站：`http://140.112.3.65:8088/`
- 本機後端：`http://127.0.0.1:18080`
- Pages 版本資訊：`https://isms-campus-portal.pages.dev/deploy-manifest.json`
- Quick Tunnel 位址檔：`./runtime/cloudflare-quick-tunnel.url`

## 開工前先檢查

1. 先看工作樹

```powershell
git status --short
```

2. 確認 runtime secret 存在

```powershell
$env:AUTH_SESSION_SECRET
```

3. 確認本機 runtime 設定檔是 UTF-8 無 BOM

- 檔案：`./runtime/runtime.local.host.json`
- 如果你重新寫入這個檔案，務必用 UTF-8 無 BOM。

4. 確認 Quick Tunnel URL 可讀

```powershell
Get-Content ./runtime/cloudflare-quick-tunnel.url
```

## 已驗證的啟動流程

### 1. 啟動本機後端

```powershell
node m365/campus-backend/service-host.cjs ./runtime/runtime.local.host.json
```

> ??????????????????????`./runtime/runtime.local.host.json` ??? `tokenMode: "app-only"`?  
> ???? `delegated-cli`?approval mail ???????

正常情況下會看到類似：
- `service-host starting ...`
- `unit-contact-campus-backend listening on http://127.0.0.1:18080`

### 2. 確認後端健康狀態

```powershell
Invoke-WebRequest http://127.0.0.1:18080/api/unit-contact/health
Invoke-WebRequest http://127.0.0.1:18080/api/auth/health
```

回傳應該要有 `ready: true`。

### 3. 啟動校內入口 gateway

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/start-host-campus-gateway.ps1
```

這會把 `8088` 轉到 `18080`。

### 4. 確認校內入口健康

```powershell
Invoke-WebRequest http://127.0.0.1:8088/api/unit-contact/health
```

### 5. 如果 Pages 顯示舊版，直接重發

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/deploy-cloudflare-pages.ps1 -BackendBase https://leather-index-monitored-assist.trycloudflare.com -ProjectName isms-campus-portal -Branch main -Mode full-proxy
```

如果你是要重新用本機 origin 發佈，先確認 `./runtime/cloudflare-quick-tunnel.url` 的值，再用它當 `-BackendBase`。

## 已驗證的部署流程

### Pages 重發的標準方式

1. 先建 Pages package：`./scripts/build-cloudflare-pages-package.cjs`
2. 再用 `wrangler pages deploy` 發佈 `dist/cloudflare-pages`
3. 完成後確認 `deploy-manifest.json`
4. 最後跑 Pages smoke

### 如果要快速恢復 Pages 到目前 backend

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/ensure-cloudflare-pages-live.ps1 -OriginUrl http://127.0.0.1:18080
```

### 如果要直接發佈固定 backend base

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/deploy-cloudflare-pages.ps1 -BackendBase <backend-url> -ProjectName isms-campus-portal -Branch main -Mode full-proxy
```

## 版本治理

現在版本治理的原則很簡單：以 `deploy-manifest.json` 為準。

### 你要看的欄位

- `versionKey`
- `commit`
- `shortCommit`
- `builtAt`
- `backendBase`
- `mode`

### 比對順序

1. `git rev-parse --short HEAD`
2. 本機 `dist/cloudflare-pages/deploy-manifest.json`
3. 正式站 `https://isms-campus-portal.pages.dev/deploy-manifest.json`
4. 再看畫面內容

### 版本治理的使用原則

- 任何 UI / smoke / Pages 改動，先確認版本資訊是否同步。
- 若正式站內容落後，但 manifest 是最新，優先判斷是否是瀏覽器快取或 Pages 部署尚未更新。
- 若 Pages manifest 落後，優先重新執行 Pages deploy。

## 已驗證的 smoke 順序

### 基本回歸

```powershell
node scripts/campus-live-regression-smoke.cjs
node scripts/live-security-smoke.cjs
node scripts/cloudflare-pages-regression-smoke.cjs
node scripts/version-governance-smoke.cjs
node scripts/campus-browser-regression-smoke.cjs
```

### 功能專項

```powershell
node scripts/unit-contact-admin-review-smoke.cjs
node scripts/unit-contact-account-to-fill-smoke.cjs
node scripts/unit-contact-public-visual-smoke.cjs
node scripts/campus-unit-contact-public-visual-smoke.cjs
node scripts/training-roster-focus-smoke.cjs
node scripts/audit-followup-smoke.cjs
node scripts/stress-regression.cjs
node scripts/role-flow-probe.cjs
node scripts/security-regression.cjs
```

## 最近已驗證的重要行為

### 資安窗口

- `#security-window` 現在是依一級單位分組的折疊卡片。
- 頁面上應該看到：
  - `一級單位`
  - `二級單位`
- Pages smoke 目前是用這個結構驗證，不是舊 table 文字。
- 如果你在頁面上看到舊版，先確認是否已出現：
  - `.security-window-group-stack .security-window-card`

如果這個頁面再改版，記得同步更新：
- `admin-module.js`
- `styles.css`
- `scripts/security-regression.cjs`
- `scripts/cloudflare-pages-regression-smoke.cjs`

### 教育訓練名單

- 名單渲染現在有分段輸出與快取。
- 大資料匯入後不要期待一次全 DOM 重算；這是故意拆成背景處理。

### 內稽檢核表

- 列表頁與搜尋有快取。
- 年份 / 狀態 / 關鍵字切換不再每次重掃整頁。

### 操作稽核軌跡

- 查詢有短期快取。
- 同條件重開頁面會先顯示舊資料，再背景更新。

## 常見阻塞與處理方式

### 1. `AUTH_SESSION_SECRET` 缺失

現象：
- backend 起不來
- auth API 直接失敗

處理：
- 先補 `AUTH_SESSION_SECRET`
- 再啟動 `service-host.cjs`

### 2. `./runtime/runtime.local.host.json` 編碼錯誤

現象：
- `service-host.cjs` JSON parse error

處理：
- 重新寫檔，明確指定 UTF-8 無 BOM

### 3. `8088` 不通

現象：
- 校內入口打不開
- smoke 只剩頁面能開，API 失敗

處理：
- 重啟 host gateway
- 確認 `18080` 有在跑

### 4. Pages 內容看起來過期

現象：
- `pages.dev` 內容沒跟著 commit 更新

處理：
- 先看 `deploy-manifest.json`
- 再檢查是否真的重發 Pages
- 最後用無痕或 `Ctrl + F5` 排除快取

### 5. `gnutls_handshake() failed`

現象：
- guest `git pull` 失敗

處理：

```bash
git config --global http.version HTTP/1.1
```

### 6. smoke 因為 session 競態失敗

現象：
- 401
- login 或 role flow 偶發失敗

處理：
- 單獨重跑那支 smoke
- 不要把一次平行競態當成產品壞掉

### 7. `security-window` 舊版畫面

現象：
- `security-window` 看起來還是 table 或舊單列版

處理：
1. 確認 `admin-module.js`、`styles.css` 已發佈
2. 確認 Pages manifest 已更新
3. 重新跑 `scripts/security-regression.cjs`

## 切帳號時的最短路徑

1. 先看這份文件。
2. 先看 `git status --short`。
3. 確認 `AUTH_SESSION_SECRET`。
4. 起 `service-host.cjs`。
5. 起 `8088` gateway。
6. 確認 `deploy-manifest.json`。
7. 跑基本 smoke。
8. 若有 UI 改動，再跑對應專項 smoke。

## 下一次最先要看的檔案

- `docs/fast-redeploy-runbook.md`
- `docs/project-execution-flow.md`

## ????????

???????????? [`docs/data-layer-governance.md`](data-layer-governance.md)?

- ????????
- ???????
- ????
- ??????
- ????? release gate

????????????????? deploy-manifest ????????????

## 啟動統一補充
- `node m365/campus-backend/service-host.cjs` 會自動依序尋找 runtime config：
  1. 命令列傳入的檔案
  2. `UNIT_CONTACT_BACKEND_RUNTIME_CONFIG`
  3. `.runtime/runtime.local.host.json`
  4. `m365/campus-backend/runtime.local.json`
- `service-host` 會自動移除 BOM，避免 runtime JSON 因編碼出錯。
- `scripts/start-unit-contact-backend-user-session.ps1` 會優先找 `.runtime/runtime.local.host.json`，再找 guest runtime config。
- `package.json` 的 `m365:a3:campus-backend:start` 已改成走 `service-host.cjs`，不再直接啟動 `server.cjs`。
