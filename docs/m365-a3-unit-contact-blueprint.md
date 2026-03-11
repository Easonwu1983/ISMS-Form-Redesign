# M365 A3 Unit Contact Blueprint

- Updated: 2026-03-12
- Goal: ship a practical first version of `申請單位資安窗口` using Microsoft 365 A3 plus a campus-hosted frontend

## Recommended Architecture

For this tenant, the most practical A3 path is now:

1. campus-hosted frontend from this repo
2. SharePoint Lists as the source of truth
3. campus-hosted backend API for `apply` and `status`
4. existing system admin process for account handoff

This path avoids the current Power Automate environment blocker while keeping the same frontend contract.

## What This Version Uses

- campus-hosted frontend in this repo
- SharePoint / Microsoft Lists
- campus backend service:
  - [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\campus-backend\server.cjs](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\campus-backend\server.cjs)
- current app account model for actual login

## What This Version Avoids

- tenant-wide Microsoft Graph application admin consent
- Entra External ID
- Azure Functions as a requirement
- premium Power Platform dependency

## Runtime Profiles

- `localDemo`
  - browser-only demo mode
- `a3CampusBackend`
  - recommended production path for this tenant
- `a3SiteOwnerFlow`
  - still valid if Power Automate environments become available
- `a3CampusFlow`
  - future option if tenant/admin setup improves
- `azureFunctionCampus`
  - future upgrade path

## End-to-End Business Flow

1. Applicant opens `#apply-unit-contact`
2. Frontend sends contract payload to campus backend
3. Backend writes `UnitContactApplications`
4. Backend writes `OpsAudit`
5. Reviewer checks application in the current admin process
6. Reviewer decides:
   - approve
   - return
   - reject
7. Admin creates or updates the current system account
8. Admin sends first-login instructions
9. Application status moves to:
   - `pending_review`
   - `returned`
   - `approved`
   - `activation_pending`
   - `active`

## Required SharePoint Lists

- `UnitContactApplications`
- `UnitAdmins`
- `OpsAudit`

Schema source:

- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\sharepoint\unit-contact-lists.schema.json](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\sharepoint\unit-contact-lists.schema.json)

## Why This Fits A3

- SharePoint Lists are included in A3
- the current user already has delegated site-owner access
- direct list write/read is working in this tenant
- no tenant-wide admin consent is required for the production runtime

## Supporting Docs

- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\m365-a3-campus-backend.md](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\m365-a3-campus-backend.md)
- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\m365-a3-site-owner-fallback.md](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\m365-a3-site-owner-fallback.md)
- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\m365-unit-contact-go-live-runbook.md](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\m365-unit-contact-go-live-runbook.md)
- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\m365-a3-implementation-worksheet.md](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\m365-a3-implementation-worksheet.md)

## Future Upgrade Path

If later you gain cleaner platform options, the frontend can keep the same contract and move to:

- Power Automate HTTP triggers
- Azure Function
- richer identity automation

The frontend pages and SharePoint workflow records can remain mostly unchanged.
