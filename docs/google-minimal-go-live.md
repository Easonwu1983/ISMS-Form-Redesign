# Google 最小上線方案

## 建議架構

- 前端：Firebase Hosting
- 後端：Google Cloud Run
- 資料層：M365 / SharePoint

這是目前最實際的 Google 路線，因為：

1. Firebase Hosting 直接提供 HTTPS
2. Cloud Run 直接提供 HTTPS
3. 不需要你自己打通校內主機 `80/443`

## Repo 已補好的東西

### 前端

- `scripts/build-google-firebase-package.cjs`
- 產出：`dist/google-firebase-hosting`

內容包含：

- 靜態前端檔案
- `m365-config.override.js`
- `firebase.json`
- `.firebaserc.sample.json`

### 後端

- `scripts/build-google-cloudrun-package.cjs`
- 產出：`dist/google-cloudrun-backend`

內容包含：

- `m365/campus-backend`
- `m365/azure-function` shared contracts
- `scripts/_m365-a3-backend-utils.cjs`
- `Dockerfile`

### 環境變數樣板

- `infra/google/cloudrun.env.sample.yaml`

## 重要限制

backend 雖然搬到 Google，但資料層仍是 M365。

所以 Cloud Run 必須設定：

- `M365_A3_TOKEN_MODE=app-only`
- `M365_A3_TENANT_ID`
- `M365_A3_CLIENT_ID`
- `M365_A3_CLIENT_SECRET`

如果沒有這組 app registration，Cloud Run 不能像現在 Ubuntu 一樣靠 CLI delegated token 活著。

## 前端部署

```powershell
node scripts/build-google-firebase-package.cjs --backend-base=https://YOUR-CLOUD-RUN-SERVICE.run.app
```

然後進到：

- `dist/google-firebase-hosting`

執行 Firebase Hosting deploy。

## 後端部署

```powershell
node scripts/build-google-cloudrun-package.cjs
```

然後將：

- `dist/google-cloudrun-backend`

部署到 Cloud Run。

## 建議順序

1. 先建 app registration，確認 app-only 可讀寫 SharePoint
2. 先上 Cloud Run backend
3. 驗證 `https://YOUR-CLOUD-RUN-SERVICE.run.app/api/auth/health`
4. 再切 Firebase Hosting 前端

