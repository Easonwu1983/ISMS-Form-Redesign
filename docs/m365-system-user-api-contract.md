# M365 System User API Contract

## Scope
- Module: `帳號 / 權限資料`
- Backend profile: `a3CampusBackend`
- Phase: 1
- Repository target:
  - SharePoint List `SystemUsers`

Phase 1 keeps the current frontend login flow intact. User records are stored in M365 and synced back into the browser-local store so the existing login and admin UI can keep running without a large rewrite.

## Endpoints

### Health
- `GET /api/system-users/health`

### Users
- `GET /api/system-users`
- `GET /api/system-users/:username`
- `POST /api/system-users/upsert`
- `POST /api/system-users/:username/delete`
- `POST /api/system-users/:username/reset-password`

Supported query parameters for `GET /api/system-users`:
- `role`
- `unit`
- `q`

## Upsert Envelope

```json
{
  "action": "system-user.upsert",
  "payload": {
    "username": "unit1",
    "password": "unit123",
    "name": "王經理",
    "email": "wang@example.edu.tw",
    "role": "單位管理員",
    "unit": "計算機及資訊網路中心／資訊網路組",
    "units": [
      "計算機及資訊網路中心／資訊網路組"
    ],
    "activeUnit": "計算機及資訊網路中心／資訊網路組",
    "recordSource": "frontend"
  }
}
```

## Reset Password Envelope

```json
{
  "action": "system-user.reset-password",
  "payload": {
    "password": "Ab3xYt9Q"
  }
}
```

If `payload.password` is omitted, the backend generates an 8-character password and returns it in the response.

## SharePoint Mapping

### SystemUsers
- Key fields:
  - `UserName`
  - `Email`
  - `Role`
  - `PrimaryUnit`
- JSON fields:
  - `AuthorizedUnitsJson`

## Provisioning

```bash
node scripts/m365-a3-system-users-provision.cjs
```
