# M365 A3 Campus Backend Path

- Updated: 2026-03-12
- Recommended when: SharePoint site access works, but Power Automate environments or HTTP-trigger flows are unavailable

## Why This Path Exists

In this tenant, SharePoint list provisioning works with the site-owner account, but Power Automate environment discovery currently returns no available environments for this user. To keep delivery moving, this project supports a campus-hosted backend that writes directly to SharePoint lists.

## Architecture

1. campus frontend serves this repo
2. campus backend exposes:
   - `POST /api/unit-contact/apply`
   - `GET|POST /api/unit-contact/status`
   - `GET /api/unit-contact/health`
3. backend uses the signed-in site-owner M365 account through CLI for Microsoft 365
4. backend writes:
   - `UnitContactApplications`
   - `OpsAudit`
5. review and account handoff remain operational processes in the existing admin flow

## What You Need

- SharePoint site owner rights
- the three workflow lists already provisioned
- one campus host or Node service runtime
- one signed-in site-owner service account on that backend host

## Runtime Profile

Use frontend profile:

- `a3CampusBackend`

The simplest campus override is:

- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.override.sample.js](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.override.sample.js)

## Backend Entry

- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\campus-backend\server.cjs](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\campus-backend\server.cjs)

## Validation

- `npm run test:unit-contact:campus-backend`

## Why This Is Acceptable For Phase 1

- no tenant-wide admin consent is required
- no Power Automate premium dependency is required
- no Azure subscription is required
- the frontend contract stays the same, so later migration to Azure Function or Power Automate still remains possible
