# Browser M365 Live Migration

用途：把目前瀏覽器 `localStorage` 內的本機資料，透過既有 campus backend API 寫入 M365 / SharePoint。

## 會搬哪些資料

- `cats_data.users` -> `SystemUsers`
- `cats_data.items` -> `CorrectiveActions`
- `cats_checklists.items` -> `Checklists`
- `cats_training_hours.rosters` -> `TrainingRosters`
- `cats_training_hours.forms` -> `TrainingForms`

## 執行前提

1. 目前頁面就是正式 campus host，例如 `http://140.112.3.65:8088/`
2. 目前瀏覽器內還保有要搬移的本機資料
3. backend health 至少已 ready：
   - `/api/system-users/health`
   - `/api/corrective-actions/health`
   - `/api/checklists/health`
   - `/api/training/health`

## 執行方式

1. 開啟系統首頁
2. 按 `F12`
3. 切到 `Console`
4. 先輸入 `allow pasting`
5. 貼上 [browser-m365-live-migration.js](C:\Users\User\Playground\ISMS-Form-Redesign\scripts\browser-m365-live-migration.js) 全部內容
6. 按 Enter

## 執行結果

腳本會把結果寫到：

- `window.__ISMS_M365_LIVE_MIGRATION_REPORT__`

Console 也會印出 summary：

- `users`
- `correctiveActions`
- `checklists`
- `trainingForms`
- `trainingRosters`

每個區塊都會有：

- `total`
- `success`
- `failed`

## 注意

- 這支腳本設計成可重跑，但重跑時仍可能遇到既有資料衝突，例如重複單號或同單位同年度表單。
- `correctiveActions` 屬於最佳努力遷移。若舊資料狀態已經很後段，腳本會依目前狀態補跑必要流程；若某筆資料本身欄位不完整，會記在 `failed` 清單。
- 若只想先搬帳號，可把 `runMigration()` 內其他 `migrate*` 呼叫先註解掉再執行。
