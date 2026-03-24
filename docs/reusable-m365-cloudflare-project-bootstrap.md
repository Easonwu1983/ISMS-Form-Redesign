# Reusable M365 + Cloudflare Project Bootstrap

只保留可直接照做的步驟。

## 1. 先定拓樸

- 前端：Cloudflare Pages
- 後端：on-prem / guest
- 資料層：M365 / SharePoint
- HTTPS 橋接：Cloudflare Tunnel

## 2. 先定模式

- `localDemo`
- `campus/live backend`
- `cloudflare pages + tunnel`

runtime 與 URL 一律集中管理，不要寫死在功能模組。

## 3. 先 backendize

優先順序：

1. auth
2. system users
3. role / review scopes
4. business forms
5. attachments
6. audit trail

live mode 只允許 strict remote。

## 4. SharePoint provisioning

先用 backend provision script；Graph 被擋就改 browser-session fallback。

原則：

- read 通過不代表 write 通過
- `403 accessDenied` 要有 fallback

## 5. Guest deployment

```bash
git config --global --add safe.directory /srv/<project>
sudo -u <service-user> git config --global http.version HTTP/1.1
sudo -u <service-user> git -C /srv/<project> pull --ff-only origin main
sudo systemctl restart <service-name>
```

## 6. Cloudflare strategy

1. 先用 Quick Tunnel
2. Pages full-proxy 穩住入口
3. 有正式 zone 再改 Named Tunnel

## 7. Health / smoke

最低要有：

- homepage health
- auth health
- core module health
- login success
- anonymous denied

必跑 smoke：

```powershell
node scripts/campus-live-regression-smoke.cjs
node scripts/live-security-smoke.cjs
node scripts/cloudflare-pages-regression-smoke.cjs
node scripts/version-governance-smoke.cjs
```

## 8. Audit trail

稽核軌跡一定要可查：

- keyword / event / actor / unit / record id
- diff
- snapshot
- payload
- export

## 9. 最後的 cutover 順序

1. runtime profiles
2. auth / authorization
3. business data
4. SharePoint provisioning
5. backend deploy
6. health checks
7. Pages full-proxy
8. live smoke
9. internal UAT
10. UI / export optimization

## 10. Ready 條件

至少要同時滿足：

- backend health 綠
- auth backend-enforced
- audit trail 可查
- attachments 可遠端運作
- Pages full-proxy 上線
- recovery 已腳本化
- live smoke 全綠

