# 發佈與回滾

## 發佈

1. `git push origin main`
2. `node scripts/build-version-info.cjs cloudflare-pages > deploy-manifest.json`
3. `node scripts/version-governance-smoke.cjs`
4. `node scripts/campus-live-regression-smoke.cjs`
5. `node scripts/live-security-smoke.cjs`

## 校內 VM 同步

1. `echo 'P@ss_w0rD' | sudo -S -u ismsbackend git -C /srv/isms-form-redesign pull --ff-only origin main`
2. `echo 'P@ss_w0rD' | sudo -S -u ismsbackend sh -lc 'cd /srv/isms-form-redesign && node scripts/build-version-info.cjs campus-vm > deploy-manifest.json'`
3. `echo 'P@ss_w0rD' | sudo -S systemctl restart isms-unit-contact-backend.service caddy.service`
4. `node scripts/vm-entry-smoke.cjs`

## 回滾

1. `echo 'P@ss_w0rD' | sudo -S -u ismsbackend git -C /srv/isms-form-redesign checkout <stable-commit>`
2. `echo 'P@ss_w0rD' | sudo -S -u ismsbackend sh -lc 'cd /srv/isms-form-redesign && node scripts/build-version-info.cjs campus-vm > deploy-manifest.json'`
3. `echo 'P@ss_w0rD' | sudo -S systemctl restart isms-unit-contact-backend.service caddy.service`
4. `node scripts/version-governance-smoke.cjs`
5. `node scripts/vm-entry-smoke.cjs`
