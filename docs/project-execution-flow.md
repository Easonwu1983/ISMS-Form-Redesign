# 專案執行流程

這份文件只保留三層導引：先接手、再部署、最後才看細節。

## 1. 接手層

切帳號後，先看這三份：

- [`docs/boot-checklist.md`](./boot-checklist.md)
- [`docs/one-minute-handoff.md`](./one-minute-handoff.md)
- [`docs/fast-redeploy-runbook.md`](./fast-redeploy-runbook.md)

最短路徑：

1. `git status --short`
2. `Get-Content .\.runtime\runtime.local.host.json`
3. `node m365/campus-backend/service-host.cjs .\.runtime\runtime.local.host.json`
4. `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-host-campus-gateway.ps1`
5. `npm run release:gate`
6. 跑三支必跑 smoke

## 2. 部署層

### 現在的實際入口

- 正式前端：`https://isms-campus-portal.pages.dev/`
- 校內入口：`http://140.112.3.65:8088/`
- 本機後端：`http://127.0.0.1:18080`
- Pages 版本：`https://isms-campus-portal.pages.dev/deploy-manifest.json`

### 固定順序

1. 先起本機後端
2. 再起 `8088` gateway
3. 再看 health
4. 再跑 release gate
5. 最後跑 smoke

### 必看檢查

- `tokenMode` 必須是 `app-only`
- `mailSenderUpn` 必須正確
- `runtime.local.host.json` 必須是 UTF-8 無 BOM
- `m365-config.override.js` 要能正常回傳

## 3. 細節層

如果要理解系統怎麼跑，再看這些：

- [`docs/release-and-rollback.md`](./release-and-rollback.md)
- [`docs/data-layer-governance.md`](./data-layer-governance.md)
- [`docs/module-architecture.md`](./module-architecture.md)
- [`docs/reusable-m365-cloudflare-project-bootstrap.md`](./reusable-m365-cloudflare-project-bootstrap.md)

### 主要 smoke

```powershell
node scripts/campus-live-regression-smoke.cjs
node scripts/live-security-smoke.cjs
node scripts/cloudflare-pages-regression-smoke.cjs
node scripts/version-governance-smoke.cjs
```

### 全站回歸

```powershell
node scripts/live-regression-suite.cjs
```

如果 `8088` 不穩：

```powershell
node scripts/run-with-campus-stack.cjs "node scripts/live-regression-suite.cjs"
```

## 常見卡點

- `18080` 有起但 `8088` 沒反應：先重啟 gateway
- 核准信失敗：先看 `tokenMode`
- 頁面看起來舊：先看 `deploy-manifest.json`
- `m365-config.override.js` 不對：先看 gateway 回應
- `gnutls_handshake() failed`：改成 HTTP/1.1
- smoke 偶發 `401`：只重跑單支，不要直接當整體壞掉
