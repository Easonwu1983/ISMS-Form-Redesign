# 校內 VM 維運

## 正式入口

- [http://140.112.97.150/](http://140.112.97.150/)
- [http://140.112.97.150/api/unit-contact/health](http://140.112.97.150/api/unit-contact/health)
- [http://140.112.97.150/deploy-manifest.json](http://140.112.97.150/deploy-manifest.json)
- [http://140.112.97.150/unit-contact-authorization-template.pdf](http://140.112.97.150/unit-contact-authorization-template.pdf)

## 更新流程

1. 以 `ismsbackend` 身分進 repo：`cd /srv/isms-form-redesign`
2. 同步主線：`git pull --ff-only origin main`
3. 重新寫入版本檔：`node -e "const fs=require('fs'); const { getBuildInfo } = require('./scripts/build-version-info.cjs'); const buildInfo = getBuildInfo('campus-gateway', process.cwd()); const manifest = { builtAt: buildInfo.builtAt, versionKey: buildInfo.versionKey, buildInfo, platform: 'campus-gateway', backendBase: 'http://127.0.0.1:18080', assetIntegrity: {} }; fs.writeFileSync('deploy-manifest.json', JSON.stringify(manifest, null, 2) + '\n');"`
4. 重啟服務：`systemctl restart isms-unit-contact-backend.service caddy.service`
5. 驗證健康：`curl http://127.0.0.1:8787/api/unit-contact/health`
6. 跑 VM 檢查：`node scripts/vm-entry-smoke.cjs`

## 驗收重點

- 版本檔要和 repo `HEAD` 一致
- health 要是 `ready:true`
- PDF 下載要回 `application/pdf`
- 服務要維持 `active`
