# Cloudflare 最小上線方案

## 建議架構

- 前端：Cloudflare Pages
- 後端：Cloudflare Tunnel -> 目前 Windows/Ubuntu backend
- 資料層：M365 / SharePoint

這條路的優勢：

1. 前端直接 HTTPS
2. backend 透過 Tunnel 拿 HTTPS
3. 不需要打通校內主機 `80/443`

官方依據：

- Cloudflare Tunnel 不需要開 inbound ports  
  來源：[Cloudflare Tunnel Docs](https://developers.cloudflare.com/tunnel/)
- Cloudflare Pages 可直接部署靜態 HTML  
  來源：[Cloudflare Pages Static HTML](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)

## 重要判斷

### 適合大規模校內內測的做法

- 不要用 `Quick Tunnel`
- 要用 `Named Tunnel`

原因：

- Quick Tunnel 適合短期測試，不適合正式或大規模 UAT
- Named Tunnel 才能綁固定 hostname

## Repo 已補好的東西

### 前端包

- `scripts/build-cloudflare-pages-package.cjs`
- 產出：`dist/cloudflare-pages`

### Tunnel 設定樣板

- `infra/cloudflare/cloudflared-config.sample.yml`

### Profile

- `m365-config.js` 已新增 `cloudflarePagesTunnel`

## 前端部署

```powershell
node scripts/build-cloudflare-pages-package.cjs --backend-base=https://api-isms.YOURDOMAIN
```

輸出：

- `dist/cloudflare-pages`

將這個資料夾部署到 Cloudflare Pages。

## Tunnel 設定

將 `infra/cloudflare/cloudflared-config.sample.yml` 改成實際值：

- `tunnel`
- `credentials-file`
- `hostname`

後端服務指向：

- `http://127.0.0.1:8787`

## 校內限制的現實

如果你走 Cloudflare Tunnel，原本 `8088` host gateway 的校內 IP 白名單不再是外層入口。

因此要在這條路上維持「僅限內部測試」有兩種方式：

1. 依賴系統本身登入帳號控管
2. 進一步加 Cloudflare Access

注意：

- Cloudflare Access free plan 官方定位是小團隊（約 50 人以下）  
  來源：[Cloudflare Access Pricing](https://www.cloudflare.com/zero-trust/products/access/)

所以如果你預期是大規模校內內測，不要把 Access free 當長期穩定方案。

## 建議順序

1. 先起 Named Tunnel，拿固定 HTTPS backend hostname
2. 驗證 `https://YOUR-TUNNEL-HOSTNAME/api/auth/health`
3. 再把前端切到 Cloudflare Pages
4. 若之後要更正式，再決定是否加 Access 或改校內正式主機

