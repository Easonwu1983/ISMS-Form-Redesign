# M365 A3 Site Owner Fallback

- Updated: 2026-03-11
- Audience:
  - project owner
  - SharePoint site owner
  - Power Automate maintainer

## When To Use This Path

Use this path when:

- your Microsoft 365 account can sign in and create Power Automate flows
- but you cannot grant tenant-wide admin consent for Microsoft Graph application permissions
- and you can instead get `Site Owner` access on one SharePoint site

This is the recommended fallback for the current project.

## What This Path Needs

1. one SharePoint site dedicated to this workflow
2. your account added as `Site Owner`
3. Power Automate flows created with your account or a designated service account
4. frontend switched to `a3SiteOwnerFlow`

## What This Path Avoids

- tenant-wide admin consent
- application permissions on Microsoft Graph
- Azure Function requirement
- Entra External ID requirement

## Backend Pattern

1. frontend submits to Power Automate HTTP trigger
2. flow writes to SharePoint lists in the selected site
3. review and account handoff are still handled by workflow owners
4. current system account remains the login target for the applicant

## Required SharePoint Lists

- `UnitContactApplications`
- `UnitAdmins`
- `OpsAudit`

Schema source:
[C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\sharepoint\unit-contact-lists.schema.json](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\sharepoint\unit-contact-lists.schema.json)

## Repo Commands

- `npm run m365:a3:site-owner:health`
- `npm run m365:a3:site-owner:provision`

These commands use the current delegated M365 login from CLI for Microsoft 365 and try to create or verify the SharePoint lists in the configured site.

## Minimum Request To Your M365 / SharePoint Admin

Ask for:

- a SharePoint site URL for this project
- your account added as `Site Owner`
- permission to create and edit SharePoint lists in that site
- permission to create Power Automate flows bound to that site

## Frontend Switch

Deploy [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.override.sample.js](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.override.sample.js) as `m365-config.override.js` with:

- `activeProfile: "a3SiteOwnerFlow"`
- `unitContactMode: "sharepoint-flow"`
- `sharePointSiteUrl`
- `unitContactSubmitEndpoint`
- `unitContactStatusEndpoint`

## Recommended Rollout Order

1. obtain site owner access
2. run `npm run m365:a3:site-owner:health`
3. run `npm run m365:a3:site-owner:provision`
4. build submit and lookup flows
5. deploy override config
6. run frontend smoke test
