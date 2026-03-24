# 開機照做版

只看這 5 行。

1. `git status --short`
2. `Get-Content .\.runtime\runtime.local.host.json`
3. `node m365/campus-backend/service-host.cjs .\.runtime\runtime.local.host.json`
4. `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-host-campus-gateway.ps1`
5. `npm run release:gate`，再跑 `node scripts/version-governance-smoke.cjs`、`node scripts/campus-live-regression-smoke.cjs`、`node scripts/live-security-smoke.cjs`、`node scripts/cloudflare-pages-regression-smoke.cjs`

固定值：
- `tokenMode: "app-only"`
- `mailSenderUpn: "easonwu@m365.ntu.edu.tw"`
- `runtime.local.host.json` 要是 UTF-8 無 BOM

