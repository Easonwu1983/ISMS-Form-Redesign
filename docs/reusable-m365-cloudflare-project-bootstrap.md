# Reusable M365 + Cloudflare Project Bootstrap

## 只留命令

### 1. 拓樸

```text
Cloudflare Pages -> Cloudflare Tunnel -> on-prem backend -> M365 / SharePoint
```

### 2. backendize

1. auth
2. system users
3. role / review scopes
4. business forms
5. attachments
6. audit trail

### 3. guest

```bash
git config --global --add safe.directory /srv/<project>
sudo -u <service-user> git config --global http.version HTTP/1.1
sudo -u <service-user> git -C /srv/<project> pull --ff-only origin main
sudo systemctl restart <service-name>
```

### 4. Cloudflare

1. Quick Tunnel
2. Pages full-proxy
3. Named Tunnel after real zone exists

### 5. smoke

```powershell
node scripts/campus-live-regression-smoke.cjs
node scripts/live-security-smoke.cjs
node scripts/cloudflare-pages-regression-smoke.cjs
node scripts/version-governance-smoke.cjs
```

### 6. ready

- backend health green
- auth backend-enforced
- audit trail queryable
- attachments remote
- Pages full-proxy live
- recovery scripted
- live smoke green

