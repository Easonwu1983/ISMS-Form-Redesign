# Contributing

## 開發規範

- 所有 JS 檔案必須有 `// @ts-check` 標頭
- 變數宣告使用 `const`（預設）或 `let`（需要重新賦值時），**禁止使用 `var`**
- 後端核心函式需加 JSDoc 型別註解
- CSS 新增模組樣式請建立 `css/<module>.css` 並在 `styles.css` 中 `@import`

## 提交前檢查

```bash
node --check <修改的 JS 檔案>     # 語法檢查
npm run build                     # 確認 bundle 正常
npm run lint                      # ESLint 檢查
```

如涉及 API 或功能變更：

```bash
node tests/e2e-core-flows.cjs           # 核心流程 E2E
node tests/comprehensive-test-suite.cjs  # 綜合測試
```

## Commit 格式

```
<type>: <簡短描述>

- feat: 新功能
- fix: 修 bug
- refactor: 重構（不改功能）
- perf: 效能優化
- docs: 文件更新
```

## 安全規範

- 不要把密鑰、token、密碼寫進 repo
- 所有 SQL 使用參數化查詢（`$1`, `$2`）
- 所有 innerHTML 使用 `esc()` 跳脫
- 修改認證/附件/權限邏輯後，跑對應 smoke test
