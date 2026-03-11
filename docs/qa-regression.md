# QA Regression Guide

- Updated: 2026-03-11
- Scope: `C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign`
- Runtime: static preview + Playwright

## Goal

用分層回歸測試穩定覆蓋：

- 角色權限
- 矯正單主流程
- 內稽檢核表主流程
- 資安教育訓練三流程
- 上傳安全
- 大量資料壓力
- 單位管理者 / 填報人日常協作
- 多瀏覽器縮放與響應式檢查

## Test Layers

### 1. Route Permission Matrix

- Command: `npm run test:role:permission`
- Script: `scripts/route-permission-matrix.cjs`
- Purpose:
  - 驗證 `admin / unit1 / user1 / viewer1` 的 route guard
  - 驗證 sidebar 顯示與禁止進入頁面
- Output:
  - `test-artifacts/role-flow-regression-YYYY-MM-DD/permission-matrix.json`

### 2. Flow Probe

- Command: `npm run test:role:probe`
- Script: `scripts/role-flow-probe.cjs`
- Purpose:
  - 驗證 `admin create -> unit respond -> admin inspect`
  - 快速檢查主線資料流是否斷裂
- Output:
  - `test-artifacts/role-flow-regression-YYYY-MM-DD/flow-probe.json`

### 3. Focus Regression

- Command: `npm run test:role:focus`
- Script: `scripts/admin-reporter-regression.cjs`
- Purpose:
  - 驗證矯正單主線完整收尾
  - Sequence:
    - admin create
    - unit1 respond
    - admin review to tracking
    - unit1 tracking submit
    - admin close
- Output:
  - `test-artifacts/role-flow-focus-YYYY-MM-DD/admin-reporter-regression.json`

### 4. Unit Admin / Reporter Collaboration

- Command: `npm run test:role:unit-admin-reporter`
- Script: `scripts/unit-admin-reporter-security-regression.cjs`
- Purpose:
  - 驗證單位管理者與填報人的權限邊界
  - 驗證不可越權查看、修改、關閉不屬於自己的資料
- Output:
  - `test-artifacts/unit-admin-reporter-security-YYYY-MM-DD/unit-admin-reporter-security.json`

### 5. Full Smoke Flow

- Command: `npm run test:role:smoke`
- Script: `scripts/role-flow-smoke.cjs`
- Purpose:
  - 驗證主要頁面可開啟
  - 驗證 admin / reporter / proxy / viewer 的主流程
  - 驗證 checklist / training / tracking 的整體串接
- Output:
  - `test-artifacts/role-flow-smoke-YYYY-MM-DD/results.json`

### 6. Training Optimization Regression

- Command: `npm run test:training:optimization`
- Script: `scripts/training-optimization-regression.cjs`
- Purpose:
  - 驗證教育訓練優化項
  - 驗證單位 autocomplete、撤回、批次操作等功能
- Output:
  - `test-artifacts/training-optimization-regression-YYYY-MM-DD/training-optimization-regression.json`

### 7. Training Acceptance

- Command: `npm run test:training:acceptance`
- Script: `scripts/training-flow-acceptance.cjs`
- Purpose:
  - 驗證教育訓練三流程
  - 流程一填報
  - 流程二列印簽核
  - 流程三上傳簽核檔
- Output:
  - `test-artifacts/training-flow-acceptance-YYYY-MM-DD/training-flow-acceptance.json`

### 8. Upload Security Regression

- Command: `npm run test:upload:security`
- Script: `scripts/upload-security-regression.cjs`
- Purpose:
  - 驗證空檔、異常副檔名、超大檔、重複檔
  - 驗證矯正單回覆、追蹤附件、教育訓練簽核檔、名單匯入檔
- Output:
  - `test-artifacts/upload-security-regression-YYYY-MM-DD/upload-security-regression.json`

### 9. Daily UAT Flow

- Command: `npm run test:uat:daily`
- Script: `scripts/uat-daily-flow.cjs`
- Purpose:
  - 模擬 `單位管理者 + 填報人` 日常操作
  - 覆蓋 checklist 草稿、training 流程一到流程三
- Output:
  - `test-artifacts/uat-daily-flow-YYYY-MM-DD/uat-daily-flow.json`

### 10. Stress Regression

- Command: `npm run test:stress`
- Script: `scripts/stress-regression.cjs`
- Purpose:
  - 驗證大量名單匯入
  - 驗證長歷程與多附件情境
- Output:
  - `test-artifacts/stress-regression-YYYY-MM-DD/stress-regression.json`

### 11. Browser Zoom Regression

- Command: `npm run test:zoom:browsers`
- Script: `scripts/browser-zoom-regression.cjs`
- Purpose:
  - 驗證 Chrome / Edge 在 `125%`、`150%` 縮放下的主要頁面
  - 驗證 dashboard、create、checklist-fill、training-fill、training-roster、schema-health
- Note:
  - 這是本機加值檢查，不納入 CI 必跑
  - 若機器上沒有 Chrome 或 Edge，結果會標示 skipped
- Output:
  - `test-artifacts/browser-zoom-regression-YYYY-MM-DD/browser-zoom-regression.json`

## Recommended Execution Order

### Standard regression

```bash
npm run test:all
```

包含：

1. role
2. training
3. bonus

### Local plus regression

```bash
npm run test:all:plus
```

包含：

1. `npm run test:all`
2. `npm run test:zoom:browsers`

## Local Run

Windows 可直接使用：

```bash
npm run test:all:local
```

如果只想先跑真人模擬與加值測試：

```bash
npm run test:bonus:all
npm run test:zoom:browsers
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

- 所有 JSON summary 的 `failed = 0`
- `consoleErrors = 0`
- `pageErrors = 0`
- 關鍵流程可完整走完且產物可下載

## Maintenance Rules

1. 新增 protected route 時：
   - 更新 route whitelist
   - 更新 permission matrix

2. 新增重要互動時：
   - 優先補 `data-testid`
   - 更新對應 regression script

3. 新增 workflow stage 時：
   - 同步更新 role flow / training flow 測試
   - 補 `probe / focus / smoke / acceptance / bonus`

4. 測試產物維護：
   - `test-artifacts/` 不納入 Git
   - 需要保存時再另外整理

## Troubleshooting

### Server not reachable

- Symptom: `ERR_CONNECTION_REFUSED`
- Preferred fix:
  - `start-local.cmd`
  - 或 `npm run preview:start`

### Selector timeout

- 先補 `data-testid`
- 再更新腳本，不要只靠脆弱的 CSS selector

### Local passes but CI fails

- 檢查 Playwright 版本與 `package-lock.json`
- 檢查 CI artifact 裡的 `server.log`
- 確認新頁面 route 與 DOM ready 條件已納入 helper
