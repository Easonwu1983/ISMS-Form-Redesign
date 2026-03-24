# 切帳號最短接手清單

這份清單只保留每次切帳號後一定要看的步驟。先照這份跑；如果要更短，直接看：

- [`docs/one-minute-handoff.md`](./one-minute-handoff.md)

## 先確認 4 件事

1. `git status --short`
2. `Get-Content .\.runtime\runtime.local.host.json`
3. `Invoke-WebRequest http://127.0.0.1:18080/api/auth/health`
4. `Invoke-WebRequest http://127.0.0.1:8088/api/auth/health`

固定值要維持：

- `tokenMode: "app-only"`
- `mailSenderUpn: "easonwu@m365.ntu.edu.tw"`
- `deploy-manifest.json` 的 `versionKey` 要跟目前 commit 對上

## 啟動順序

1. 啟動後端

```powershell
node m365/campus-backend/service-host.cjs .\.runtime\runtime.local.host.json
```

2. 啟動 8088 gateway

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-host-campus-gateway.ps1
```

3. 驗 health

```powershell
Invoke-WebRequest http://127.0.0.1:18080/api/auth/health
Invoke-WebRequest http://127.0.0.1:8088/api/auth/health
```

## 必跑 smoke

1. 版本治理

```powershell
node scripts/version-governance-smoke.cjs
```

2. 校內回歸

```powershell
node scripts/campus-live-regression-smoke.cjs
```

3. 安全檢查

```powershell
node scripts/live-security-smoke.cjs
node scripts/security-regression.cjs
```

4. Pages 回歸

```powershell
node scripts/cloudflare-pages-regression-smoke.cjs
```

5. 全站完整回歸

```powershell
node scripts/live-regression-suite.cjs
```

如果 `8088` 不穩，改用：

```powershell
node scripts/run-with-campus-stack.cjs "node scripts/live-regression-suite.cjs"
```

## 目前最重要的固定點

- `security-window` 和 `單位治理` 都已改成三分類：
  - `行政單位`
  - `學術單位`
  - `中心 / 研究單位`
- `showAuditEntryModal` 必須存在，不然操作稽核軌跡的「檢視差異」會報錯
- `approval mail` 必須走 `tokenMode: app-only`
- `m365-config.override.js` 要維持 `a3CampusBackend`

## 常見卡點

- `18080` 活著但 `8088` 掛了：先重啟 `scripts/start-host-campus-gateway.ps1`
- 核准信失敗：先看 `runtime.local.host.json` 的 `tokenMode`
- `m365-config.override.js` 不一致：先確認 gateway 有把 `/m365-config.override.js` 正常回傳

## 發佈門檻

- `npm run release:gate`
- `npm run release:verify`
- 版本不一致就不要發佈

## 最近已驗證的結果

- `campus-live-regression-smoke`：通過
- `live-security-smoke`：通過
- `cloudflare-pages-regression-smoke`：通過
- `version-governance-smoke`：通過
