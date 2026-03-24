# 開機檢查

1. `git status --short`
2. 確認 `.runtime/runtime.local.host.json`：`tokenMode: "app-only"`、`mailSenderUpn: "easonwu@m365.ntu.edu.tw"`、UTF-8 無 BOM
3. 啟動本機 stack：`node m365/campus-backend/service-host.cjs .runtime/runtime.local.host.json`
4. 啟動 gateway：`powershell -ExecutionPolicy Bypass -File scripts/start-host-campus-gateway.ps1`
5. 跑：`node scripts/version-governance-smoke.cjs`、`node scripts/campus-live-regression-smoke.cjs`、`node scripts/live-security-smoke.cjs`

## 固定值

- 唯一最高管理者：`easonwu`
- 核准寄信模式：`app-only`
- 校內 VM：`140.112.97.150`
