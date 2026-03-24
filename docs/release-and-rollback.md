# 發佈與回滾

## 發佈

1. `git push origin main`
2. 重生本機兩份 manifest：

```powershell
@'
const fs = require('fs');
const path = require('path');
const { getBuildInfo } = require('./scripts/build-version-info.cjs');
const root = process.cwd();
const buildInfo = getBuildInfo('cloudflare-pages', root);
const manifest = {
  builtAt: buildInfo.builtAt,
  versionKey: buildInfo.versionKey,
  buildInfo,
  mode: 'full-proxy',
  backendBase: 'http://140.112.97.150',
  redirectTarget: 'http://140.112.97.150/',
  platform: 'cloudflare-pages',
  assetIntegrity: {}
};
for (const target of [path.join(root, 'deploy-manifest.json'), path.join(root, 'dist', 'cloudflare-pages', 'deploy-manifest.json')]) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2), 'utf8');
}
'@ | node -
```

3. 跑：
   - `node scripts/version-governance-smoke.cjs`
   - `node scripts/campus-live-regression-smoke.cjs`
   - `node scripts/live-security-smoke.cjs`

## 校內 VM 同步

1. `sudo -u ismsbackend git -C /srv/isms-form-redesign pull --ff-only origin main`
2. 依 [vm-migration-checklist.md](/C:/Users/User/Playground/ISMS-Form-Redesign/docs/vm-migration-checklist.md) 重生 VM 兩份 manifest
3. `sudo systemctl restart isms-unit-contact-backend.service caddy.service`
4. `node scripts/vm-entry-smoke.cjs`

## 回滾

1. `sudo -u ismsbackend git -C /srv/isms-form-redesign checkout <stable-commit>`
2. 重新產生 VM 兩份 manifest
3. `sudo systemctl restart isms-unit-contact-backend.service caddy.service`
4. 重跑 `node scripts/version-governance-smoke.cjs` 和 `node scripts/vm-entry-smoke.cjs`
