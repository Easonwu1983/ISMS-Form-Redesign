# 切帳號一分鐘接手版

先看這份，不要先翻長文件。

## 一分鐘流程

1. 看工作樹

```powershell
git status --short
```

2. 確認 runtime 設定

```powershell
Get-Content .\.runtime\runtime.local.host.json
```

重點只看這三個值：
- `tokenMode: "app-only"`
- `mailSenderUpn: "easonwu@m365.ntu.edu.tw"`
- 檔案必須是 UTF-8 無 BOM

3. 啟動本機後端

```powershell
node m365/campus-backend/service-host.cjs .\.runtime\runtime.local.host.json
```

4. 啟動 8088 gateway

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-host-campus-gateway.ps1
```

5. 看 health

```powershell
Invoke-WebRequest http://127.0.0.1:18080/api/auth/health
Invoke-WebRequest http://127.0.0.1:8088/api/auth/health
```

6. 跑最少 smoke

```powershell
npm run release:gate
node scripts/version-governance-smoke.cjs
node scripts/campus-live-regression-smoke.cjs
node scripts/live-security-smoke.cjs
node scripts/cloudflare-pages-regression-smoke.cjs
```

## 版本對照

- 正式站：`https://isms-campus-portal.pages.dev/`
- 校內站：`http://140.112.3.65:8088/`
- 本機後端：`http://127.0.0.1:18080`
- Pages 版本：`https://isms-campus-portal.pages.dev/deploy-manifest.json`

## 常見卡點

- `18080` 活著但 `8088` 掛了：重啟 `scripts/start-host-campus-gateway.ps1`
- 核准信失敗：先看 `tokenMode` 是否還是 `app-only`
- `pages.dev` 看起來舊：看 `deploy-manifest.json` 的 `versionKey`
- `m365-config.override.js` 不對：確認 gateway 仍正確回傳 `/m365-config.override.js`
- `gnutls_handshake() failed`：`git config --global http.version HTTP/1.1`
- smoke 偶發 `401`：單支重跑，不要直接當壞掉

