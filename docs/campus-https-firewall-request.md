# 校內 HTTPS 放行需求

目標：讓 NTU Homepage 前端可安全呼叫本系統 backend，並由 Windows host 上的 Caddy 自動簽發 HTTPS 憑證。

## 需求

請協助確認並放行以下對外入站連線：

- 主機 IP：`140.112.3.65`
- TCP `80`
- TCP `443`

## 原因

目前系統前端已可透過 NTU Homepage 提供入口，但 backend 仍是校內 `http://140.112.3.65:8088`。

要升級成正式 HTTPS 架構，需由 Caddy 對外完成 ACME 驗證並簽發憑證：

- 測試主機名：`140-112-3-65.sslip.io`

目前 Caddy 申請憑證時回應：

- `Timeout during connect (likely firewall problem)`

這代表外部無法連到本機的 `80/443`。

## 放行後驗證方式

1. 在主機以系統管理員身份執行：

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\User\Playground\ISMS-Form-Redesign\scripts\retry-homepage-https.ps1
```

2. 若成功，以下端點應可回應：

- `https://140-112-3-65.sslip.io/api/auth/health`

3. 之後即可將 Homepage 前端切到 HTTPS backend。

