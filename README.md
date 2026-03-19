# ISMS Form Redesign

ISMS 管考與追蹤平台前後端專案。

## 簡介

這個專案提供以下主要模組：

- 矯正單
- 內稽檢核表
- 資安教育訓練統計
- 單位管理人申請
- 帳號管理
- 稽核追蹤
- 附件預覽與下載

目前 live 入口：

- [正式入口](https://isms-campus-portal.pages.dev/)
- [校內入口](http://140.112.3.65:8088/)

## 開發環境

安裝依賴：

```bash
npm ci
```

本機預覽：

```bash
npm run preview:start
```

## 測試

常用測試命令：

- `npm run test:all`
- `npm run test:live:all`
- `npm run test:security`
- `npm run test:upload:security`
- `npm run test:training:all`
- `npm run test:role:all`
- `npm run test:zoom:browsers`

回歸測試與煙霧測試結果會輸出到：

- `logs/`
- `test-artifacts/`

## 部署

專案會使用以下幾種部署模式：

- Cloudflare Pages
- 校內 Windows host + Ubuntu guest backend
- Azure Static Web Apps / Azure Web App 手動部署工作流

相關腳本與工作流可直接從 `scripts/` 與 `.github/workflows/` 目錄查看。

## 文件

建議先看：

- `docs/project-execution-flow.md`
- `docs/system-operation-manual.md`
- `docs/qa-regression.md`
- `docs/m365-unit-contact-api-contract.md`
- `docs/cloudflare-pages-and-tunnel-runbook.md`

## 重要提醒

- 不要把密鑰、token、password 寫進 repo。
- 新增功能後，先跑對應 smoke，再更新 live。
- 若修改登入、附件、教育訓練或單位申請流程，請同步更新對應 smoke。
