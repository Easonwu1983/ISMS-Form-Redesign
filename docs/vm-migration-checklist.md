# 校內 VM 維運清單

## 固定入口

- 服務入口：`http://140.112.97.150/`
- 健康檢查：`http://140.112.97.150/api/unit-contact/health`
- 版本檔：`http://140.112.97.150/deploy-manifest.json`
- 授權同意書：`http://140.112.97.150/unit-contact-authorization-template.pdf`

## 更新流程

1. `git pull --ff-only origin main`
2. `node scripts/build-version-info.cjs > deploy-manifest.json`
3. `systemctl restart isms-unit-contact-backend.service caddy.service`
4. `curl http://140.112.97.150/api/unit-contact/health`
5. `node scripts/vm-entry-smoke.cjs`

## 判斷原則

- 健康檢查 `ready:true` 就代表 VM 可用
- 版本檔要和目前 `HEAD` 一致
- 平常不用重做 provisioning
- 只有健康檢查失敗、版本不一致或 smoke 失敗時，才進一步排查
