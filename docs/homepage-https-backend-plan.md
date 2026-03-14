# Homepage HTTPS Backend Plan

目前已經完成的部分：

- NTU Homepage 前端已上線：`https://homepage.ntu.edu.tw/~easonwu/isms/index.html`
- backend 已放行這些 CORS origin：
  - `http://homepage.ntu.edu.tw`
  - `https://homepage.ntu.edu.tw`
  - `http://140-112-3-65.sslip.io`
  - `https://140-112-3-65.sslip.io`
- Windows host 已驗證可啟動 Caddy 並監聽 `80/443`

## 預定 HTTPS backend 入口

- `https://140-112-3-65.sslip.io`

這個 hostname 已正確解析到：

- `140.112.3.65`

## 實際阻塞點

Caddy 在申請 Let's Encrypt 憑證時，ACME challenge 回：

- `Timeout during connect (likely firewall problem)`

代表外部無法打到這台主機的：

- TCP `80`
- TCP `443`

目前本機程序已經在 listen，但外部 challenge 仍 timeout，表示還缺至少一個條件：

1. Windows 防火牆開放 80/443
2. 或校內網路邊界未放行 80/443 對外

## 已準備好的檔案

- 啟動腳本：`scripts/start-https-campus-proxy.ps1`
- 停止腳本：`scripts/stop-https-campus-proxy.ps1`
- 目前測試配置：`.runtime/Caddyfile.sslip`
- Caddy log：`.runtime/https-proxy.err.log`

## 啟動方式

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-https-campus-proxy.ps1
```

## 成功條件

若 80/443 對外打通，Caddy 會自動為 `140-112-3-65.sslip.io` 取得正式憑證。

之後再做兩步：

1. 重新產生 Homepage 前端包：

```powershell
node scripts/build-homepage-ntu-package.cjs --backend-base=https://140-112-3-65.sslip.io
```

2. 重新發布到 Homepage：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\publish-homepage-ftp.ps1 -Username 'easonwu' -Password 'YOUR_PASSWORD'
```

## 目前結論

這條 HTTPS 路徑技術上是可行的，真正卡住的是：

- 管理員權限不足，無法從目前 session 幫 Windows 防火牆開 80/443
- 或校內網路層沒有開放 80/443 對外
