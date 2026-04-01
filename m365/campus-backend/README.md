# Unit Contact Campus Backend

- Runtime: Node.js on the campus host
- Purpose: provide `apply` and `status` endpoints without requiring Power Automate environments or tenant-wide admin consent

## Why This Exists

This backend is the practical A3 fallback when:

- the project can use SharePoint Lists
- the service account can sign in with CLI for Microsoft 365
- the target account is a SharePoint site owner
- Power Automate HTTP environments are unavailable or blocked

## Endpoints

- `POST /api/unit-contact/apply`
- `GET|POST /api/unit-contact/status`
- `GET /api/unit-contact/health`
- `GET /api/corrective-actions/health`
- `GET /api/corrective-actions`
- `GET /api/corrective-actions/:id`
- `POST /api/corrective-actions`
- `POST /api/corrective-actions/:id/respond`
- `POST /api/corrective-actions/:id/review`
- `POST /api/corrective-actions/:id/tracking-submit`
- `POST /api/corrective-actions/:id/tracking-review`
- `GET /api/checklists/health`
- `GET /api/checklists`
- `GET /api/checklists/:id`
- `POST /api/checklists/:id/save-draft`
- `POST /api/checklists/:id/submit`
- `GET /api/training/health`
- `GET /api/training/forms`
- `GET /api/training/forms/:id`
- `POST /api/training/forms/:id/save-draft`
- `POST /api/training/forms/:id/submit-step-one`
- `POST /api/training/forms/:id/finalize`
- `POST /api/training/forms/:id/return`
- `POST /api/training/forms/:id/undo`
- `POST /api/training/forms/:id/delete`
- `GET /api/training/rosters`
- `POST /api/training/rosters/upsert`
- `POST /api/training/rosters/:id/delete`
- `GET /api/system-users/health`
- `GET /api/system-users`
- `GET /api/system-users/:username`
- `POST /api/system-users/upsert`
- `POST /api/system-users/:username/delete`
- `POST /api/system-users/:username/reset-password`
- `GET /api/auth/health`
- `POST /api/auth/login`
- `POST /api/auth/reset-password`
- `GET /api/attachments/health`
- `POST /api/attachments/upload`
- `GET /api/attachments/:driveItemId`
- `POST /api/attachments/:driveItemId/delete`

The request and response contract stays aligned with:

- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\m365-unit-contact-api-contract.md](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\m365-unit-contact-api-contract.md)

## Prerequisites

1. PostgreSQL 17 installed and running on the campus host.
2. Database `isms_db` created with user `isms_user` (see `migrations/001-initial-schema.sql`).
3. Graph Mail token available for email notifications (interim — SMTP migration pending).

## Environment Variables

- `PORT` — HTTP server port (default: 8787)
- `UNIT_CONTACT_ALLOWED_ORIGINS` — comma-separated CORS origins
- `AUTH_SESSION_SECRET` — session signing secret
- `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD` — PostgreSQL connection
- `PG_POOL_MIN`, `PG_POOL_MAX` — connection pool size (default: 2 / 10)
- `ATTACHMENTS_DIR` — local filesystem path for uploaded files
- `GRAPH_MAIL_SENDER_UPN` — Graph Mail sender UPN (interim)
- `M365_A3_TOKEN_MODE` — token mode for Graph Mail (interim)

All settings can be provided via `runtime.local.json` (see `runtime.sample.json`).

## Start

```powershell
node m365/campus-backend/server.cjs
```

## Health Check

```powershell
curl http://127.0.0.1:8787/api/unit-contact/health
```

## Frontend Profile

Use the frontend runtime profile:

- `a3CampusBackend`

or set equivalent values in:

- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.override.js](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.override.js)
