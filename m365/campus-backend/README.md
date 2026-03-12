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

The request and response contract stays aligned with:

- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\m365-unit-contact-api-contract.md](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\m365-unit-contact-api-contract.md)

## Prerequisites

1. Sign in on the campus host with CLI for Microsoft 365 using the site-owner account.
2. Ensure the required SharePoint site and lists already exist.
3. Keep the SharePoint site id or URL available in environment variables or local backend config.

## Environment Variables

- `PORT`
- `UNIT_CONTACT_ALLOWED_ORIGINS`
- `UNIT_CONTACT_SHAREPOINT_SITE_ID`
- `UNIT_CONTACT_SHAREPOINT_SITE_URL`
- `UNIT_CONTACT_APPLICATIONS_LIST`
- `UNIT_CONTACT_UNITADMINS_LIST`
- `UNIT_CONTACT_AUDIT_LIST`
- `CORRECTIVE_ACTIONS_LIST`
- `CHECKLISTS_LIST`
- `TRAINING_FORMS_LIST`
- `TRAINING_ROSTERS_LIST`
- `SYSTEM_USERS_LIST`

The backend can also reuse the local-only file:

- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\.local-secrets\m365-a3-backend.json](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\.local-secrets\m365-a3-backend.json)

for `siteId` and `sharePointSiteUrl`.

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
