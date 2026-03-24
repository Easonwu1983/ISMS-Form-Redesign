# 切帳號快速接手手冊

這份只看例外，不看正常流程。正常流程直接看：

- [`docs/boot-checklist.md`](./boot-checklist.md)
- [`docs/one-minute-handoff.md`](./one-minute-handoff.md)

## 只要有異常時才看

- `8088` 不通，但 `18080` 正常：重啟 `scripts/start-host-campus-gateway.ps1`
- 核准信失敗：先看 `tokenMode` 是否還是 `app-only`
- 頁面版本不對：先看 `deploy-manifest.json`
- `m365-config.override.js` 不對：先看 gateway 是否還在回傳 `/m365-config.override.js`
- `gnutls_handshake() failed`：`git config --global http.version HTTP/1.1`
- smoke 偶發 `401`：單支重跑，不要直接當整體壞掉

## 版本對照只看這個

- 正式站：`https://isms-campus-portal.pages.dev/`
- 校內站：`http://140.112.3.65:8088/`
- 本機後端：`http://127.0.0.1:18080`
- Pages 版本：`https://isms-campus-portal.pages.dev/deploy-manifest.json`

## release gate

版本不一致就先不要發佈，直接跑：

```powershell
npm run release:gate
npm run release:verify
```

## 必跑 smoke

```powershell
node scripts/campus-live-regression-smoke.cjs
node scripts/live-security-smoke.cjs
node scripts/cloudflare-pages-regression-smoke.cjs
node scripts/version-governance-smoke.cjs
```

## 這次最容易忘的事

- `service-host.cjs` 會自動找 runtime config：
  1. 命令列傳入
  2. `UNIT_CONTACT_BACKEND_RUNTIME_CONFIG`
  3. `.runtime/runtime.local.host.json`
  4. `m365/campus-backend/runtime.local.json`
- `service-host` 會自動去掉 BOM
- `release:gate` 會先擋 tracked dirty tree，再做版本檢查
- 要回滾時，看 [`docs/release-and-rollback.md`](./release-and-rollback.md)
