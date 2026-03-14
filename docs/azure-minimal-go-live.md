# Azure 最小上線方案

## 建議架構

- 前端：Azure Static Web Apps
- 後端：Azure App Service (Linux, Node 22)
- 資料層：M365 / SharePoint

這個組合比直接改 Azure Functions 更實際，因為目前正式可用 backend 是：

- `m365/campus-backend/server.cjs`

它本身就是一個完整 Node 服務，搬到 App Service 的改動量最小。

## 目前已補好的條件

1. 前端已有 Azure HTTPS profile
   - `m365-config.js` 的 `azureFunctionCampus`
   - `scripts/build-azure-static-package.cjs`

2. backend 現在支援：
   - `delegated-cli`
   - `app-only`

只要設定：

- `M365_A3_TOKEN_MODE=app-only`
- `M365_A3_TENANT_ID`
- `M365_A3_CLIENT_ID`
- `M365_A3_CLIENT_SECRET`

Azure App Service 就不再依賴本機 Azure CLI / M365 CLI session。

## 前端部署

產包：

```powershell
node scripts/build-azure-static-package.cjs --backend-base=https://YOUR-BACKEND.azurewebsites.net
```

輸出：

- `dist/azure-staticwebapp`

這包可直接部署到 Azure Static Web Apps。

若使用 GitHub Actions 手動部署：

- workflow: `.github/workflows/azure-static-webapp-manual.yml`
- secret: `AZURE_STATIC_WEB_APPS_API_TOKEN`

## 後端部署

建議使用 Azure App Service Linux。

啟動命令：

```text
node m365/campus-backend/server.cjs
```

必要 app settings 參考：

- `infra/azure/app-service.appsettings.sample.json`

backend 專用部署包可先建好：

```powershell
node scripts/build-azure-webapp-package.cjs
```

輸出：

- `dist/azure-webapp-backend`

若使用 GitHub Actions 手動部署：

- workflow: `.github/workflows/azure-webapp-backend-manual.yml`
- secret: `AZURE_WEBAPP_PUBLISH_PROFILE`

## 最重要的 Azure 阻塞已修正

先前 backend 主要依賴：

- Azure CLI delegated token
- CLI for Microsoft 365 delegated token

這在 Azure App Service 不能成立。

現在 backend 已補成：

- 若 `M365_A3_TOKEN_MODE=app-only`，優先用 app registration 的 client credentials
- 若未設定，才 fallback 到既有 CLI 模式

## 正式 go-live 檢查

1. backend health

- `/api/auth/health`
- `/api/checklists/health`
- `/api/training/health`
- `/api/corrective-actions/health`
- `/api/system-users/health`
- `/api/review-scopes/health`
- `/api/attachments/health`

2. 前端登入與資料流

- 登入
- 矯正單
- 檢核表
- 教育訓練
- 附件

3. CORS

`UNIT_CONTACT_ALLOWED_ORIGINS` 必須包含：

- Azure Static Web Apps 網址
- 自訂網址（若有）

## 建議順序

1. 先把 backend 放 Azure App Service
2. 驗證 `https://YOUR-BACKEND.azurewebsites.net/api/auth/health`
3. 再把前端切到 Azure Static Web Apps
4. 最後再綁自訂網域
