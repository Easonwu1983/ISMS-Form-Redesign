# ISMS Form Redesign

國立臺灣大學 ISMS 內部稽核管考追蹤系統前端原型與回歸測試專案。

目前已模組化為：

- `app.js`: 核心殼層與委派入口
- `auth-module.js`: 登入與 session
- `data-module.js`: `localStorage` schema / migration / store
- `shell-module.js`: header / sidebar / route shell
- `case-module.js`: 矯正單流程
- `checklist-module.js`: 內稽檢核表流程
- `training-module.js`: 資安教育訓練流程
- `admin-module.js`: 系統管理與資料健康檢查
- `workflow-support-module.js`: 編號、匯出、匯入與上傳輔助

## 啟動

先安裝套件：

```bash
npm ci
```

啟動本地預覽：

```bash
npm run preview:start
```

或在 Windows 直接雙擊：

- `start-local.cmd`

本地網址：

```text
http://127.0.0.1:8080/
```

## 測試分層

### 標準回歸

這組適合日常修改後固定跑，也會納入 CI：

```bash
npm run test:all
```

內容包含：

- 角色與權限流程
- 教育訓練流程
- 上傳安全驗證
- 單位管理者 / 填報人日常 UAT 模擬
- 大量資料壓力測試

### 本機加值回歸

這組適合發版前在本機補跑：

```bash
npm run test:all:plus
```

除了標準回歸，還會額外跑：

- Chrome / Edge `125%`、`150%` 縮放檢查

如果本機沒有安裝 Chrome 或 Edge，縮放測試會明確標示 `skipped`。

### Windows 本機一鍵入口

```bash
npm run test:role:all:local
npm run test:training:all:local
npm run test:all:local
```

## 主要測試指令

- `npm run test:role:all`
- `npm run test:training:all`
- `npm run test:bonus:all`
- `npm run test:upload:security`
- `npm run test:uat:daily`
- `npm run test:stress`
- `npm run test:zoom:browsers`

## 測試產物

所有測試結果會輸出到：

- `test-artifacts/`

JSON 結果、下載檔、fixture 與 screenshot 都會依日期分資料夾保存。

## 文件

- `docs/qa-regression.md`
- `docs/uat-daily-checklist.md`
- `docs/pre-launch-checklist.md`
- `docs/system-operation-manual.md`
- `docs/module-architecture.md`
- `docs/engineering-roadmap.md`
- `docs/m365-unit-contact-implementation-blueprint.md`
- `docs/m365-unit-contact-setup-checklist.md`
- `docs/m365-unit-contact-api-contract.md`
- `docs/m365-unit-contact-go-live-runbook.md`

## M365 Unit Contact Flow

The new public-facing `申請單位資安窗口` flow now exists in the frontend and is ready to move from local emulation to M365-backed endpoints.

Core files:

- `unit-contact-application-module.js`
- `m365-api-client.js`
- `m365-config.js`
- `m365/sharepoint/unit-contact-lists.schema.json`
- `m365/power-automate/unit-contact-flows.md`
- `m365/azure-function/unit-contact-api/`
- `docs/m365-unit-contact-api-contract.md`

## NotebookLM

本專案已整合 NotebookLM 工作流，可用：

```bash
notebooklm-workflow.cmd doctor
notebooklm-workflow.cmd login
```

Notebook alias：

```text
isms-form-redesign-dev
```
