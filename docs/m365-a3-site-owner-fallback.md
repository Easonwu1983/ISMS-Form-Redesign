# M365 A3 Site Owner Fallback

- Updated: 2026-03-12
- Audience:
  - project owner
  - SharePoint site owner
  - campus backend maintainer

## When To Use This Path

Use this path when:

- tenant-wide admin consent is not available
- your account can be added as `Site Owner` on one SharePoint site
- you still need a production workflow now

## What This Path Needs

1. one SharePoint site dedicated to this workflow
2. your account added as `Site Owner`
3. the three workflow lists provisioned in that site
4. either:
   - Power Automate flows
   - or the campus backend service

## What This Path Avoids

- tenant-wide Graph application permissions
- Entra External ID
- Azure Function as a requirement

## Current Recommended Runtime

For this tenant, the recommended runtime is now:

- `a3CampusBackend`

Because SharePoint delegated access is working, while Power Automate environment discovery currently returns no usable environments for this account.

## Required SharePoint Lists

- `UnitContactApplications`
- `UnitAdmins`
- `OpsAudit`

Schema source:

- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\sharepoint\unit-contact-lists.schema.json](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\sharepoint\unit-contact-lists.schema.json)

## Repo Commands

- `npm run m365:a3:site-owner:health`
- `npm run m365:a3:site-owner:provision`
- `npm run m365:a3:campus-backend:start`
- `npm run test:unit-contact:campus-backend`

## Frontend Switch

Deploy:

- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.override.sample.js](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.override.sample.js)

as `m365-config.override.js` with:

- `activeProfile: "a3CampusBackend"`
- `unitContactMode: "m365-api"`
- `unitContactSubmitEndpoint`
- `unitContactStatusEndpoint`
- `sharePointSiteUrl`

## Recommended Rollout Order

1. obtain site owner access
2. run `npm run m365:a3:site-owner:health`
3. run `npm run m365:a3:site-owner:provision`
4. start the campus backend
5. deploy frontend override
6. run the backend smoke test
