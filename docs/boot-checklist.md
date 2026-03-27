# 開機檢查

1. `git status --short`
2. 確認 `.runtime/runtime.local.host.json`：`tokenMode: "app-only"`、`mailSenderUpn: "easonwu@m365.ntu.edu.tw"`、UTF-8 無 BOM
3. 先確認正式鏈：
   - `curl http://140.112.97.150/api/unit-contact/health`
   - `curl http://140.112.97.150/deploy-manifest.json`
   - `curl https://isms-campus-portal.pages.dev/deploy-manifest.json`
4. 只有做本機開發驗證時，才啟動本機 stack：`node m365/campus-backend/service-host.cjs .runtime/runtime.local.host.json`
5. 只有做本機開發驗證時，才啟動 gateway：`powershell -ExecutionPolicy Bypass -File scripts/start-host-campus-gateway.ps1`

## 固定值

- 唯一最高管理者：`easonwu`
- 核准寄信模式：`app-only`
- 校內 VM：`140.112.97.150`
- 正式主站：校內 VM
- Pages：備援頁
- 本機 `8088`：僅開發驗證
