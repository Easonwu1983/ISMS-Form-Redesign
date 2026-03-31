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

## 目前固定優先順序

1. 先把正式鏈維持綠燈
2. 再壓 `latest-release-report.md` 裡最大的 latency hotspot
3. 最後才做結構性重構或視覺細修

目前優先修的點：

- `visual:desktop:dashboard`
- `visual:desktop:unit-review`
- `checklist:list-loaded`
- `visual:public-desktop:unit-contact-apply`
- `unit-admin:login`

## 固定避坑

- 不再把 guest `127.0.0.1:2222` 當正式部署入口
- 不再把本機 `8088` 混進正式版本治理
- 不要因為大量未追蹤暫存檔就中斷；只看 tracked 變更
- 如果本輪動到 build 產物相關檔案，先重建 core assets，再推版

## 例外層

- [fast-redeploy-runbook.md](/C:/Users/User/Playground/ISMS-Form-Redesign/docs/fast-redeploy-runbook.md)

## 細節層

- [data-layer-governance.md](/C:/Users/User/Playground/ISMS-Form-Redesign/docs/data-layer-governance.md)
- [module-architecture.md](/C:/Users/User/Playground/ISMS-Form-Redesign/docs/module-architecture.md)
