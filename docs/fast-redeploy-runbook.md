# 切帳號快速接手手冊

先看一頁版：
- [`docs/boot-checklist.md`](./boot-checklist.md)
- [`docs/one-minute-handoff.md`](./one-minute-handoff.md)

這份文件只保留切帳號時一定會用到的步驟。更完整的背景與架構，請看：

- [`docs/project-execution-flow.md`](./project-execution-flow.md)
- [`docs/release-and-rollback.md`](./release-and-rollback.md)

## 先看這四個

- 正式站：`https://isms-campus-portal.pages.dev/`
- 校內站：`http://140.112.3.65:8088/`
- 本機後端：`http://127.0.0.1:18080`
- Pages 版本：`https://isms-campus-portal.pages.dev/deploy-manifest.json`

## 開工前

1. 看工作樹

```powershell
git status --short
```

2. 確認秘密值與 runtime config

```powershell
$env:AUTH_SESSION_SECRET
Get-Content .\.runtime\runtime.local.host.json
```

3. 確認 `service-host.cjs` 會讀到正確設定

```powershell
node m365/campus-backend/service-host.cjs .\.runtime\runtime.local.host.json
```

重點：
- `tokenMode` 要是 `app-only`
- `mailSenderUpn` 要正確
- JSON 要是 UTF-8 無 BOM

## 最短啟動順序

1. 啟動本機後端

```powershell
node m365/campus-backend/service-host.cjs .\.runtime\runtime.local.host.json
```

2. 確認 health

```powershell
Invoke-WebRequest http://127.0.0.1:18080/api/unit-contact/health
Invoke-WebRequest http://127.0.0.1:18080/api/auth/health
```

3. 啟動 8088 gateway

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-host-campus-gateway.ps1
```

4. 再確認 gateway

```powershell
Invoke-WebRequest http://127.0.0.1:8088/api/unit-contact/health
```

## 版本與發佈

先跑 release gate：

```powershell
npm run release:gate
```

再跑正式驗證：

```powershell
npm run release:verify
```

版本不一致時先不要發佈，直接看：

- `deploy-manifest.json`
- `git rev-parse --short HEAD`

## 必跑 smoke

最少跑這三支：

```powershell
node scripts/campus-live-regression-smoke.cjs
node scripts/live-security-smoke.cjs
node scripts/cloudflare-pages-regression-smoke.cjs
```

如果有版本改動，再加：

```powershell
node scripts/version-governance-smoke.cjs
```

## 常見卡點

- `AUTH_SESSION_SECRET` 沒設：backend 起不來
- `runtime.local.host.json` 編碼錯：改 UTF-8 無 BOM
- `8088` 不通：先看 `18080`，再重啟 gateway
- `pages.dev` 看起來舊：先看 `deploy-manifest.json`
- `gnutls_handshake() failed`：`git config --global http.version HTTP/1.1`
- smoke 偶發 `401`：單支重跑，不要當成整體壞掉

## 版本治理原則

- 以 `deploy-manifest.json` 為準
- 正式站、校內站、本機 manifest 要對得上
- smoke 報告要和版本一起看

## 這次最容易忘的事

- `service-host.cjs` 會自動找 runtime config：
  1. 命令列傳入
  2. `UNIT_CONTACT_BACKEND_RUNTIME_CONFIG`
  3. `.runtime/runtime.local.host.json`
  4. `m365/campus-backend/runtime.local.json`
- `service-host` 會自動去掉 BOM
- `release:gate` 會先擋 tracked dirty tree，再做版本檢查
- 要回滾時，看 [`docs/release-and-rollback.md`](./release-and-rollback.md)
