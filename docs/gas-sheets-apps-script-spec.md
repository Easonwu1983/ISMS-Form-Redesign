# 內部稽核管考追蹤系統
## Google Sheets + Apps Script API 規格（v2.1）

> 目標：前端維持 HTML/JS；後端使用 Apps Script + Google Sheets，採用「帳號密碼 + Session Token」。

## 1. 系統架構

- 前端：`index.html` + `app.js` + `styles.css`
- 後端：Apps Script Web App（`doPost/doGet`）
- 資料：Google Sheets
- 通知：GmailApp
- 驗證：本系統帳密，不使用 Google SSO

## 2. 角色權限

- `最高管理員`
  - 全校資料檢視
  - 帳號管理、通知發送、退回修正
- `單位管理員`
  - 本單位資料管理
- `填報人`
  - 依權限填報與處理

## 3. 重要資料表

### `USERS`

- `id`, `username`, `password_hash`, `password_salt`
- `email`, `name`, `role`, `unit`, `sub_unit`, `employee_no`
- `is_active`, `must_change_password`
- `password_changed_at`, `password_expires_at`
- `failed_count`, `locked_until`, `last_login_at`
- `created_at`, `updated_at`, `row_version`

### `PASSWORD_HISTORY`

- `id`, `user_id`, `username`
- `password_hash`, `password_salt`
- `changed_at`, `changed_by`, `reason`

### `PASSWORD_RESETS`

- `id`, `user_id`, `username`, `email`
- `token_hash`, `requested_at`, `expires_at`, `used_at`
- `request_ip`, `request_ua`

### `LOGIN_SESSIONS`

- `id`, `session_token_hash`, `user_id`, `username`
- `issued_at`, `expires_at`, `revoked_at`
- `ip`, `ua`, `last_seen_at`

### `LOGIN_LOGS`

- `id`, `time`, `username`, `email`, `name`, `role`
- `success`, `ip`, `ua`, `message`
- `integrity_hash`

### `API_AUDIT`

- `id`, `request_id`, `action`
- `actor_email`, `actor_username`
- `status`, `message`, `integrity_hash`, `created_at`

## 4. API envelope

請求：

```json
{
  "action": "auth.login",
  "payload": {"username": "admin", "password": "***"},
  "sessionToken": "optional",
  "requestId": "optional",
  "ua": "optional"
}
```

回應：

```json
{
  "ok": true,
  "requestId": "...",
  "data": {},
  "ts": "2026-03-05T10:00:00.000Z"
}
```

## 5. 已實作 actions

- Public
  - `health.ping`
  - `auth.login`
  - `auth.requestPasswordReset`
  - `auth.resetPassword`
- Auth required
  - `auth.logout`
  - `auth.me`
  - `auth.changePassword`
  - `car.list`
  - `notify.sendUnitManagers`（僅最高管理員）

## 6. 安全控制

- 密碼複雜度政策（`password_*`）
- 密碼歷史（近 N 次不可重複）
- 首次登入/密碼過期強制改密碼
- 登入失敗鎖定
- 登入速率限制（帳號+IP）
- 一次性重設 token（有效期限）
- 日誌完整性雜湊（`integrity_hash`）
- 日誌保存維護（預設 180 天）

## 7. 重要 SYS_CONFIG

- `session_ttl_hours`
- `login_max_failures`
- `login_lock_minutes`
- `login_rate_limit_window_minutes`
- `login_rate_limit_max_attempts`
- `password_min_length`
- `password_require_upper`
- `password_require_lower`
- `password_require_digit`
- `password_require_special`
- `password_history_count`
- `password_max_age_days`
- `reset_token_ttl_minutes`
- `log_retention_days`
- `mail_sender`

## 8. 初始化流程

執行 `setupSpreadsheetTemplate()`：

- 建立所有 sheet
- seed `SYS_CONFIG` / `SEQUENCES`
- 建立初始管理員帳號

可透過 Script Properties 指定：

- `SPREADSHEET_ID`
- `INITIAL_ADMIN_USERNAME`
- `INITIAL_ADMIN_PASSWORD`
- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ADMIN_NAME`
- `INITIAL_ADMIN_UNIT`
- `LOG_HASH_SECRET`
