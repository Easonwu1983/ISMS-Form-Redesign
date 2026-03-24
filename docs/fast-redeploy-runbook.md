# 例外處理

## `8088` 不通但 `18080` 正常

- 重啟 gateway：`powershell -ExecutionPolicy Bypass -File scripts/start-host-campus-gateway.ps1`

## 核准信寄送失敗

- 檢查 `tokenMode` 是否為 `app-only`
- 檢查 `mailSenderUpn` 是否為 `easonwu@m365.ntu.edu.tw`

## 版本不一致

- 看 root `deploy-manifest.json`
- 看 `dist/cloudflare-pages/deploy-manifest.json`
- 看 VM root `deploy-manifest.json`
