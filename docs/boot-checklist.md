# 開機檢查
1. 先看目前狀態：`git status --short`
2. 若在校內 VM，先同步到最新主線：`git pull --ff-only origin main`
3. 確認 runtime 設定正確：
   - `tokenMode: "app-only"`
   - `mailSenderUpn: "easonwu@m365.ntu.edu.tw"`
   - `runtime.local.json` 必須是 UTF-8 無 BOM
4. 重新啟動服務：
   - 校內 VM：`isms-unit-contact-backend.service`、`caddy.service`
   - 本機：`service-host.cjs`、`host-campus-gateway.ps1`
5. 最後驗證：
   - `curl http://140.112.97.150/api/unit-contact/health`
   - `node scripts/vm-entry-smoke.cjs`

> 校內 VM `http://140.112.97.150/` 是正式入口，平常先以它為準。
