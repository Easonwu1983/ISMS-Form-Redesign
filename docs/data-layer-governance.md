# 資料層與版本治理

## 1. 單一真實來源

- 單位樹與分類
- 角色與單位授權
- 填報模式
- 資安窗口
- 訓練名單
- 檢核表
- 稽核軌跡
- 附件資訊

## 2. 權限層

- 最高管理者：全域資料、治理模式、稽核、版本資訊
- 單位管理者：自己授權範圍內資料
- 舊角色名稱不得再出現在正式流程
- 跨單位授權必須由後端決定

## 3. 版本治理

- `commit`
- `shortCommit`
- `builtAt`
- `branch`
- `versionKey`
- `deploy-manifest.json`

## 4. Release Gate

```powershell
node scripts/version-governance-smoke.cjs
node scripts/campus-live-regression-smoke.cjs
node scripts/live-security-smoke.cjs
node scripts/cloudflare-pages-regression-smoke.cjs
```

大資料變更再加：

```powershell
node scripts/stress-regression.cjs
```

