# ISMS Form Redesign

這是一套以純前端靜態頁面實作的 ISMS 管考與填報原型，包含三條主流程：

- 矯正單開立、回填、追蹤、結案
- 內稽檢核表填報與管理
- 資安教育訓練統計、名單匯入、簽核流程

主要檔案：

- `index.html`
- `app.js`
- `styles.css`
- `units.js`

## 快速開始

1. 安裝相依套件

```bash
npm ci
```

2. 啟動本地預覽

```bash
npm run preview:start
```

3. 開啟瀏覽器

```text
http://127.0.0.1:8080/
```

Windows 也可以直接使用：

- `start-local.cmd`

## 常用測試指令

Windows 本機便利指令：

只跑角色流程：

```bash
npm run test:role:all:local
```

只跑教育訓練：

```bash
npm run test:training:all:local
```

完整回歸：

```bash
npm run test:all:local
```

跨平台或 CI 環境，若你已經自己開好了本地 server，也可以直接跑不含 server wrapper 的版本：

```bash
npm run test:all
```

## 測試覆蓋

- `test:role:permission`: 路由與角色權限矩陣
- `test:role:probe`: 輕量跨角色主線驗證
- `test:role:focus`: 矯正單最關鍵主流程
- `test:role:smoke`: 整站角色主流程 smoke
- `test:training:optimization`: 教育訓練 UX / 權限優化驗證
- `test:training:acceptance`: 教育訓練三流程驗收

測試產物會輸出到本機的 `test-artifacts/`，目前已加入 `.gitignore`，不會再干擾 Git 狀態。

## GitHub Actions

CI 位置：

- `.github/workflows/role-tests.yml`

現在 CI 會跑完整回歸：

```bash
npm run test:all
```

## 文件

- `docs/qa-regression.md`
- `docs/pre-launch-checklist.md`
- `docs/system-operation-manual.md`
- `docs/engineering-roadmap.md`

## 目前值得持續改善的方向

- `app.js` 仍是大型單檔，建議逐步拆成 domain modules
- 畫面仍大量使用 `innerHTML` 與 inline `onclick`，後續可改成事件委派與 action registry
- `localStorage` 是主要資料層，下一步建議補 schema version 與 migration
- 自動化測試已穩定很多，但仍可再把 selector 與測試 helper 做更深的共用化
