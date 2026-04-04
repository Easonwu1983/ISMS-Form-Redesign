# 執行流程索引

## 接手層

- [production-topology.md](./production-topology.md)
- [handoff-index.md](./handoff-index.md)
- [boot-checklist.md](./boot-checklist.md)

## 校內 VM

- [vm-migration-checklist.md](./vm-migration-checklist.md)
- [release-and-rollback.md](./release-and-rollback.md)

## 固定部署順序

1. 確認 git 工作樹乾淨
2. 若改到 shell / CSS / bundles，先 `npm run build`
3. `git push origin main`
4. SSH 進 VM：`sudo -u ismsbackend bash -c 'cd /srv/isms-form-redesign && git pull origin main'`
5. `sudo systemctl restart isms-unit-contact-backend.service`
6. 驗證：`curl http://127.0.0.1:8787/api/auth/health`

## 固定事實

- 正式主站：`http://140.112.97.150/`
- Cloudflare Pages 入口：`https://isms-campus-portal.pages.dev/`
- VM SSH：`useradmin@140.112.97.150`
- VM 專案路徑：`/srv/isms-form-redesign`
- 服務帳號：`ismsbackend`
- systemd 服務：`isms-unit-contact-backend.service`

## 優先順序原則

1. 先確保正式環境穩定（health check 全綠）
2. 再處理使用者回報的功能問題
3. 最後做結構性重構或視覺細修
