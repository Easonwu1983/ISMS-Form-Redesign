# M365 Unit Contact Go-Live Runbook

- Updated: 2026-03-12
- Audience:
  - campus frontend maintainer
  - campus backend maintainer
  - SharePoint site owner

## Goal

Turn the public `申請單位資安窗口` flow from local demo mode into a real campus-hosted service backed by M365.

## Recommended First Production Path

For this tenant, use:

1. campus frontend in this repo
2. `a3CampusBackend` profile
3. SharePoint Lists
4. campus backend API
5. admin-issued account handoff in the current system

Deployment references:

- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\campus-production-deployment-checklist.md](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\campus-production-deployment-checklist.md)
- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\windows-service-backend-runbook.md](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\windows-service-backend-runbook.md)
- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\virtualbox-ubuntu-vm-deployment.md](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\virtualbox-ubuntu-vm-deployment.md)
- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\virtualbox-ubuntu-vm-one-hour-plan.md](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\virtualbox-ubuntu-vm-one-hour-plan.md)

## Why This Is The Recommended Path

- SharePoint site-owner access is working
- the required lists are already provisioned
- direct list read/write is verified
- Power Automate environment discovery currently returns zero available environments for this user

## Frontend Runtime Switch

Keep:

- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.js](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.js)

in repo default mode, and deploy:

- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.override.sample.js](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.override.sample.js)

as `m365-config.override.js` on the campus host.

Set:

- `activeProfile = "a3CampusBackend"`
- `unitContactMode = "m365-api"`
- `unitContactSubmitEndpoint`
- `unitContactStatusEndpoint`

## SharePoint Bootstrap

1. Confirm site owner access
2. Run:
   - `npm run m365:a3:site-owner:health`
   - `npm run m365:a3:site-owner:provision`
3. Confirm lists:
   - `UnitContactApplications`
   - `UnitAdmins`
   - `OpsAudit`

## Backend Bootstrap

1. On the campus backend host, sign in once with CLI for Microsoft 365 using the site-owner account
2. Either run directly or install as a Windows service
3. Direct start:

```powershell
npm run m365:a3:campus-backend:start
```

4. Windows service path:
   - follow [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\windows-service-backend-runbook.md](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\windows-service-backend-runbook.md)

5. Verify:

```text
GET /api/unit-contact/health
POST /api/unit-contact/apply
POST /api/unit-contact/status
```

## Validation

Run:

- `npm run test:unit-contact:campus-backend`

Then manually verify:

1. `/#apply-unit-contact`
2. `/#apply-unit-contact-status`
3. one test application appears in SharePoint
4. lookup by email returns that application

## Operational Follow-Up

After submission is working:

1. reviewer processes application
2. admin creates or updates the current app account
3. admin sends first-login guidance
4. reviewer/admin updates status to `activation_pending` and then `active`
