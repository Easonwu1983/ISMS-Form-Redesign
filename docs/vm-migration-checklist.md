# 校內 VM 維運清單

## 固定資訊

- host：`140.112.97.150`
- SSH 使用者：`useradmin`
- repo：`/srv/isms-form-redesign`
- service user：`ismsbackend`
- 入口：[http://140.112.97.150/](http://140.112.97.150/)
- health：[http://140.112.97.150/api/unit-contact/health](http://140.112.97.150/api/unit-contact/health)

## 同步

1. `sudo -u ismsbackend git -C /srv/isms-form-redesign pull --ff-only origin main`
2. 如果 `git pull` 被未追蹤檔擋住，先刪掉手動複製進 repo 根目的檔案，例如 `favicon.ico`
3. 重生 VM 的兩份 manifest：

```bash
cd /srv/isms-form-redesign
node - <<'NODE'
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
NODE
```

4. `sudo systemctl restart isms-unit-contact-backend.service caddy.service`
5. 驗證：
   - `curl http://140.112.97.150/api/unit-contact/health`
   - `curl http://140.112.97.150/deploy-manifest.json`
   - `curl http://140.112.97.150/favicon.ico`
   - `node scripts/vm-entry-smoke.cjs`
   - 必要時再跑 `node scripts/campus-live-regression-smoke.cjs`

## 現況

- 唯一最高管理者是 `easonwu`
- smoke 腳本已改成 `easonwu` 路徑
- `/favicon.ico` 已納入 repo 和打包流程
- `unit-contact-authorization-template.pdf` 必須回 `200` 且 `Content-Type` 是 `application/pdf`
