# 切帳號開機清單

切帳號後先看這份，不用重學流程。

1. 先看工作樹
   - `git status --short`
   - 只處理這次要上的變更，其他暫存檔先不要碰
2. 確認 runtime
   - `Get-Content .\.runtime\runtime.local.host.json`
   - 確認：
     - `tokenMode: "app-only"`
     - `mailSenderUpn: "easonwu@m365.ntu.edu.tw"`
     - 檔案是 `UTF-8` 無 BOM
3. 啟動本機服務
   - `node m365/campus-backend/service-host.cjs .\.runtime\runtime.local.host.json`
   - `powershell -File .\scripts\start-host-campus-gateway.ps1`
4. 先驗版本
   - `node scripts/release-gate.cjs`
   - `node scripts/version-governance-smoke.cjs`
5. 再跑主要 smoke
   - `node scripts/campus-live-regression-smoke.cjs`
   - `node scripts/live-security-smoke.cjs`
   - `node scripts/cloudflare-pages-regression-smoke.cjs`

常見判斷：

- `http://140.112.97.150/api/unit-contact/health` 回 `ready:true`，代表校內 VM 正常
- 如果只是接手，不需要重做 provisioning
- 只有出現版本不一致、health failed、或 smoke 失敗時，才去看 `fast-redeploy-runbook.md`
