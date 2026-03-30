# 執行流程索引

## 接手層

- [production-topology.md](/C:/Users/User/Playground/ISMS-Form-Redesign/docs/production-topology.md)
- [handoff-index.md](/C:/Users/User/Playground/ISMS-Form-Redesign/docs/handoff-index.md)
- [boot-checklist.md](/C:/Users/User/Playground/ISMS-Form-Redesign/docs/boot-checklist.md)

## 校內 VM

- [vm-migration-checklist.md](/C:/Users/User/Playground/ISMS-Form-Redesign/docs/vm-migration-checklist.md)
- [release-and-rollback.md](/C:/Users/User/Playground/ISMS-Form-Redesign/docs/release-and-rollback.md)

## 固定順序

1. 確認 tracked 工作樹乾淨，只忽略既有未追蹤暫存檔
2. 若改到 shell / CSS / bundles，先 `node scripts/build-app-core-assets.cjs`
3. push `origin/main`
4. 刷新本機 root `deploy-manifest.json`
5. 同步 `useradmin@140.112.97.150`
6. 跑 VM smoke
7. 發 Pages
8. 跑 formal smoke

## 不再重建上下文的固定事實

- 正式主站：`http://140.112.97.150/`
- Pages：`https://isms-campus-portal.pages.dev/`
- 正式部署入口：`useradmin@140.112.97.150`
- VM repo：`/srv/isms-form-redesign`
- service user：`ismsbackend`
- 本機 `8088` 不是正式判準
- Pages smoke 不和 full smoke 平行執行

## 例外層

- [fast-redeploy-runbook.md](/C:/Users/User/Playground/ISMS-Form-Redesign/docs/fast-redeploy-runbook.md)

## 細節層

- [data-layer-governance.md](/C:/Users/User/Playground/ISMS-Form-Redesign/docs/data-layer-governance.md)
- [module-architecture.md](/C:/Users/User/Playground/ISMS-Form-Redesign/docs/module-architecture.md)
