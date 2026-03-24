# 開機照做版

1. `git status --short`
2. `Get-Content .\.runtime\runtime.local.host.json`（確認 `tokenMode: "app-only"`、`mailSenderUpn: "easonwu@m365.ntu.edu.tw"`、UTF-8 無 BOM）
3. `node m365/campus-backend/service-host.cjs .\.runtime\runtime.local.host.json` → `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-host-campus-gateway.ps1` → `npm run release:gate` + `node scripts/version-governance-smoke.cjs` + `node scripts/campus-live-regression-smoke.cjs` + `node scripts/live-security-smoke.cjs` + `node scripts/cloudflare-pages-regression-smoke.cjs`
