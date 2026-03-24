# 發佈與回滾

## 發佈

1. `npm run release:gate`
2. `npm run release:verify`
3. `git rev-parse --short HEAD`

## 回滾

1. `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\rollback-release.ps1 -TargetRef <good-commit> -Push`
2. `npm run release:gate`
3. `node scripts/campus-live-regression-smoke.cjs`
4. `node scripts/cloudflare-pages-regression-smoke.cjs`

## 原則

- 版本以 `deploy-manifest.json` 為準
- `release:gate` 沒過，不發佈
- smoke 沒綠，不算完成
