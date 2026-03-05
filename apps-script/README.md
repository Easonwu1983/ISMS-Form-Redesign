# Apps Script Backend (Google Sheets)

This folder contains the deployable Apps Script backend for the ISMS tracking system.

## Implemented API actions

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
  - `notify.sendUnitManagers` (admin only)

## Security controls added (aligned to 附表十普級重點)

- Username/password + session token authentication
- Login lockout (`login_max_failures` + `login_lock_minutes`)
- Login rate limit (`login_rate_limit_*`)
- Password complexity policy (`password_*`)
- Password history (cannot reuse latest N)
- First-login/password-expired forced change (`must_change_password`)
- One-time password reset token with expiration (`PASSWORD_RESETS`)
- Security log integrity hash (`integrity_hash`)
- Security log retention maintenance (default 180 days)

## Files

- `appsscript.json`
- `src/Config.gs`
- `src/SheetSchema.gs`
- `src/SheetRepo.gs`
- `src/Security.gs`
- `src/Auth.gs`
- `src/CarService.gs`
- `src/Notify.gs`
- `src/Main.gs`
- `src/Setup.gs`

## Deploy (clasp)

1. Install and login:

```bash
npm i -g @google/clasp
clasp login
```

2. Create/link project in `apps-script/`:

```bash
clasp create --title "ISMS-CATS-Backend" --type webapp
# or
clasp clone <SCRIPT_ID>
```

3. Push:

```bash
clasp push
```

4. Script Properties (recommended):

- `SPREADSHEET_ID`
- `INITIAL_ADMIN_USERNAME`
- `INITIAL_ADMIN_PASSWORD`
- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ADMIN_NAME`
- `INITIAL_ADMIN_UNIT`
- `LOG_HASH_SECRET` (for audit hash hardening)

5. Deploy Web App:

- Execute as: `Me`
- Who has access: `Anyone within domain` or `Anyone`

6. Run once in editor:

- `setupSpreadsheetTemplate()`

## Request envelope

```json
{
  "action": "auth.login",
  "payload": {"username": "admin", "password": "***"},
  "sessionToken": "optional-after-login",
  "requestId": "optional-client-id",
  "ua": "optional-user-agent"
}
```

## Important notes

- All non-public actions require `sessionToken`.
- If `must_change_password=true`, user can only call `auth.me`, `auth.changePassword`, `auth.logout`.
- `notify.sendUnitManagers` and reset-mail sending use GmailApp; `SYS_CONFIG.mail_sender` must be an available alias or fallback to execution account.
