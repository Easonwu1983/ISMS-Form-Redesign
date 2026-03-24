# ??皜

1. `git status --short`
   - `app.js` ?舀??瑼???閬?閬１??2. 蝣箄??祆? runtime嚗?   - `.runtime/runtime.local.host.json`
   - `tokenMode: "app-only"`
   - `mailSenderUpn: "easonwu@m365.ntu.edu.tw"`
   - 瑼?蝺函Ⅳ??UTF-8 ??BOM
3. ?璈?stack嚗?   - `node m365/campus-backend/service-host.cjs .runtime/runtime.local.host.json`
   - `powershell -ExecutionPolicy Bypass -File scripts/start-host-campus-gateway.ps1`
4. 撽璈?health嚗?   - `curl http://127.0.0.1:18080/api/unit-contact/health`
   - `curl http://127.0.0.1:8088/api/unit-contact/health`
5. 頝?撠?smoke嚗?   - `node scripts/version-governance-smoke.cjs`
   - `node scripts/campus-live-regression-smoke.cjs`
   - `node scripts/live-security-smoke.cjs`

?暹?嚗?- ?臭??擃恣? `easonwu`
- 銝??? `admin` ?嗆?擃恣?蝙??
