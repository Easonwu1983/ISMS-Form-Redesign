# 校內 VM 維運

## 目標主機

- IP：`140.112.97.150`
- SSH 帳號：`useradmin`
- repo：`/srv/isms-form-redesign`
- service user：`ismsbackend`

## 更新步驟

1. `ssh useradmin@140.112.97.150`
2. `echo 'P@ss_w0rD' | sudo -S -u ismsbackend git -C /srv/isms-form-redesign pull --ff-only origin main`
3. `echo 'P@ss_w0rD' | sudo -S -u ismsbackend sh -lc 'cd /srv/isms-form-redesign && node scripts/build-version-info.cjs campus-vm > deploy-manifest.json'`
4. `echo 'P@ss_w0rD' | sudo -S systemctl restart isms-unit-contact-backend.service caddy.service`
5. 檢查：
   - `curl http://140.112.97.150/api/unit-contact/health`
   - `curl http://140.112.97.150/deploy-manifest.json`
   - `curl http://140.112.97.150/unit-contact-authorization-template.pdf -I`
   - `node scripts/vm-entry-smoke.cjs`

## 完成條件

- `/api/unit-contact/health` 為 `ready:true`
- root `deploy-manifest.json` 的 `versionKey` 與 VM `git rev-parse --short=12 HEAD` 一致
- `vm-entry-smoke` 通過
