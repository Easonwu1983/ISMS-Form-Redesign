# 發佈與回滾

這份文件只保留最短的可執行流程。切帳號後先看這份，再看 `docs/fast-redeploy-runbook.md`。

## 發佈前

先跑：

```powershell
npm run release:gate
npm run release:verify
```

通過條件：

- 工作樹沒有語義變更
- `dist/*/deploy-manifest.json` 版本一致
- `deploy-manifest.json` 與目前 `HEAD` 一致
- `version-governance-smoke` 通過

## 發佈時

1. 先確認目前版本：

```powershell
git rev-parse --short HEAD
```

2. 重新建置需要的發佈包
3. 重新發佈 Pages / guest
4. 再跑核心 smoke

## 回滾時

回到上一個已知穩定 commit：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\rollback-release.ps1 -TargetRef <good-commit> -Push
```

回滾後固定再做：

1. `npm run release:gate`
2. `npm run release:verify`
3. `node scripts/campus-live-regression-smoke.cjs`
4. `node scripts/cloudflare-pages-regression-smoke.cjs`

## 常見卡點

- 版本不一致：先不要發佈，直接看 `deploy-manifest.json`
- smoke 失敗：先判斷是產品問題、版本問題、還是快取問題
- guest / Pages 沒同步：先看最新 commit 和 `deploy-manifest.json`
- `gnutls_handshake() failed`：先執行 `git config --global http.version HTTP/1.1`

## 判斷原則

- 版本以 `deploy-manifest.json` 為準
- release gate 比人工判斷優先
- smoke 沒全綠，不算可發佈
