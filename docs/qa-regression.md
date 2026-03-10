# QA Regression Guide

- Updated: 2026-03-10
- Scope: `C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign`
- Runtime: static preview + Playwright layered tests

## Goal

這個專案目前把驗證切成六層，目的不是讓每次都跑最重的 smoke，而是讓權限、主流程、教育訓練流程可以分層定位問題。

## Test Layers

### 1. Route Permission Matrix

- Command: `npm run test:role:permission`
- Script: `scripts/route-permission-matrix.cjs`
- Purpose:
  - 驗證 `admin / unit1 / user1 / viewer1` 的路由權限
  - 提早抓到 route guard 或 sidebar 權限回歸
- Output:
  - `test-artifacts/role-flow-regression-YYYY-MM-DD/permission-matrix.json`

### 2. Flow Probe

- Command: `npm run test:role:probe`
- Script: `scripts/role-flow-probe.cjs`
- Purpose:
  - 快速驗證 `admin create -> unit respond -> admin inspect`
  - 適合畫面調整後先確認主線還活著
- Output:
  - `test-artifacts/role-flow-regression-YYYY-MM-DD/flow-probe.json`

### 3. Focus Regression

- Command: `npm run test:role:focus`
- Script: `scripts/admin-reporter-regression.cjs`
- Purpose:
  - 驗證矯正單最關鍵業務主線
  - Sequence:
    - admin create
    - unit1 respond
    - admin review to tracking
    - unit1 tracking submit
    - admin close
- Output:
  - `test-artifacts/role-flow-focus-YYYY-MM-DD/admin-reporter-regression.json`

### 4. Full Smoke Flow

- Command: `npm run test:role:smoke`
- Script: `scripts/role-flow-smoke.cjs`
- Purpose:
  - 跑完整角色主線：
  - admin 管理權限
  - reporter / proxy / viewer 權限
  - checklist 草稿與送出
  - training 草稿與送出
  - tracking submit + admin close
- Output:
  - `test-artifacts/role-flow-smoke-YYYY-MM-DD/results.json`
  - `test-artifacts/role-flow-smoke-YYYY-MM-DD/screenshots/*`

### 5. Training Optimization Regression

- Command: `npm run test:training:optimization`
- Script: `scripts/training-optimization-regression.cjs`
- Purpose:
  - 驗證教育訓練模組的短流程 UX 改善
  - 包含 autocomplete、草稿權限、撤回機制等
- Output:
  - `test-artifacts/training-optimization-regression-YYYY-MM-DD/training-optimization-regression.json`

### 6. Training Acceptance

- Command: `npm run test:training:acceptance`
- Script: `scripts/training-flow-acceptance.cjs`
- Purpose:
  - 驗證教育訓練三流程：
  - 流程一填報並鎖定
  - 流程二列印簽核表
  - 流程三上傳簽核檔並完成
- Output:
  - `test-artifacts/training-flow-acceptance-YYYY-MM-DD/training-flow-acceptance.json`
  - `test-artifacts/training-flow-acceptance-YYYY-MM-DD/screenshots/*`
  - `test-artifacts/training-flow-acceptance-YYYY-MM-DD/downloads/*`

## Recommended Execution Order

1. `npm run test:role:permission`
2. `npm run test:role:probe`
3. `npm run test:role:focus`
4. `npm run test:role:smoke`
5. `npm run test:training:optimization`
6. `npm run test:training:acceptance`

如果要一次跑完：

```bash
npm run test:all
```

## Local Run

Windows 本機最簡單的方式：

```bash
npm run test:all:local
```

這個指令會自動：

1. 啟動本地靜態 server
2. 等待 `http://127.0.0.1:8080/` 正常
3. 跑完整回歸
4. 關閉 server

跨平台或 CI 風格的手動方式：

```bash
npm run preview:start
npm run test:all
```

## CI Run

- Workflow: `.github/workflows/role-tests.yml`
- Trigger:
  - push to `main`
  - pull request
- CI steps:
  - `npm ci`
  - `npx playwright install --with-deps chromium`
  - start static preview
  - `npm run test:all`
  - upload `test-artifacts/`

## Pass Criteria

- 所有測試 summary 的 `failed = 0`
- `consoleErrors = 0` 或 `pageErrors = 0`
- 矯正單、檢核表、教育訓練三條主線都至少有一支腳本覆蓋通過

## Maintenance Rules

1. 新 protected route：
   - 更新 route whitelist
   - 更新 route permission matrix

2. 新關鍵欄位：
   - 優先補 `data-testid`
   - 再更新相關 regression script

3. 新 workflow stage：
   - 先決定屬於 role flow 還是 training flow
   - 再擴 probe / focus / smoke / acceptance

4. 新測試產物：
   - 一律落在 `test-artifacts/` 帶日期資料夾
   - 保持 repo 不追蹤這些產物

## Troubleshooting

### Server not reachable

- Symptom: `ERR_CONNECTION_REFUSED`
- Preferred fix:
  - `npm run test:all:local`
- Manual check:
  - `npm run preview:start`
  - `http://127.0.0.1:8080/` 回應 `200`

### Selector timeout

- 先檢查畫面上是否還有對應 `data-testid`
- 若 UI 改版，優先更新 test id，不要退回脆弱 CSS selector

### Local passes but CI fails

- 確認 Playwright 版本與 `package-lock.json` 一致
- 檢查 CI 上傳的 `test-artifacts/` 與 `server.log`
- 優先使用 route hash 或 DOM 狀態等待，不要盲目加 sleep
