# 發佈與回滾

只保留最少可執行步驟。

## 發佈前

```powershell
npm run release:gate
npm run release:verify
```

## 發佈時

```powershell
git rev-parse --short HEAD
```

建置、發佈、再跑核心 smoke。

## 回滾時

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\rollback-release.ps1 -TargetRef <good-commit> -Push
```

回滾後只做三件事：

```powershell
npm run release:gate
node scripts/campus-live-regression-smoke.cjs
node scripts/cloudflare-pages-regression-smoke.cjs
```

## 判斷原則

- 版本以 `deploy-manifest.json` 為準
- `release:gate` 沒過，不發佈
- smoke 沒綠，不算完成
