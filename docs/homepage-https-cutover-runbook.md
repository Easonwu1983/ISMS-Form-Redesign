# Homepage HTTPS 切換 Runbook

此文件對應「NTU Homepage 前端 + 校內主機 HTTPS backend」正式切換。

## 前提

1. `140.112.3.65` 的外部 TCP `80/443` 已放行
2. Windows host 可用系統管理員身份執行 PowerShell
3. Caddy 代理腳本已存在：
   - `scripts/start-https-campus-proxy.ps1`
   - `scripts/retry-homepage-https.ps1`

## Step 1. 開 HTTPS 代理並取證

以系統管理員身份執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\retry-homepage-https.ps1
```

成功條件：

- `https://140-112-3-65.sslip.io/api/auth/health` 可回應

## Step 2. 切 Homepage 前端到 HTTPS backend

執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\cutover-homepage-to-https.ps1 -Username easonwu -Password '你的FTP密碼'
```

這支腳本會：

1. 驗證 `https://140-112-3-65.sslip.io/api/auth/health`
2. 重建 Homepage 前端包
3. 將 `m365-config.override.js` 指向 `https://140-112-3-65.sslip.io`
4. 發布到 `public_html/isms/`

## Step 3. 驗證

前端入口：

- `https://homepage.ntu.edu.tw/~easonwu/isms/index.html`

後端健康檢查：

- `https://140-112-3-65.sslip.io/api/auth/health`
- `https://140-112-3-65.sslip.io/api/training/health`
- `https://140-112-3-65.sslip.io/api/checklists/health`

## Step 4. 若失敗

1. 檢查 `.runtime\https-proxy.err.log`
2. 若仍看到 `Timeout during connect`，表示 `80/443` 仍未真正對外可達
3. 若 Homepage 正常開啟但 API 失敗，先檢查 CORS 與 `m365-config.override.js` 指向是否正確

