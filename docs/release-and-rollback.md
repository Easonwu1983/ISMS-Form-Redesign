# 發佈與回滾

這份文件只記錄兩件事：

1. 發佈前要擋住什麼
2. 出問題時怎麼快速回上一版

## 發佈前門檻

發佈前先跑：

```powershell
npm run release:gate
```

release gate 會檢查：

- tracked working tree 是否乾淨
- 本機版本資訊是否可對上 git HEAD
- `deploy-manifest.json` 是否一致

只要這一關不過，就不要往下發佈。

## 正式驗證順序

```powershell
npm run release:verify
```

等同於完整回歸的最終確認。

## 回滾流程

如果正式版有問題，先選一個「最後已知正常」的 commit，再做回滾：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\rollback-release.ps1 -TargetRef <good-commit> -Push
```

回滾完成後，照這個順序補驗：

1. `npm run release:gate`
2. `npm run release:verify`
3. 重新部署 guest / Pages

## 回滾原則

- 只回到你確定可用的 commit
- 不要靠記憶猜版本
- 以 `deploy-manifest.json` 顯示的版本當作對照
- 回滾後一定要補 smoke
