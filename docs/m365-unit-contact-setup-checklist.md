# M365 Unit Contact Setup Checklist

- Updated: 2026-03-11
- Goal: turn the new public `申請單位資安窗口` frontend flow into a working M365-backed service

## Phase 1: SharePoint Foundation

1. Create SharePoint site `ISMS-Forms`.
2. Create these lists using [m365/sharepoint/unit-contact-lists.schema.json](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365/sharepoint/unit-contact-lists.schema.json):
   - `UnitContactApplications`
   - `UnitAdmins`
   - `OpsAudit`
3. Add indexes for:
   - `ApplicationId`
   - `ApplicantEmail`
   - `UnitCode`
   - `Status`
   - `OccurredAt`

## Phase 2: Power Automate

1. Build submit flow from [m365/power-automate/unit-contact-flows.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365/power-automate/unit-contact-flows.md).
2. Paste the request schemas:
   - [m365/power-automate/http-trigger-apply-request.schema.json](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365/power-automate/http-trigger-apply-request.schema.json)
   - [m365/power-automate/http-trigger-lookup-request.schema.json](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365/power-automate/http-trigger-lookup-request.schema.json)
3. Align response body with [docs/m365-unit-contact-api-contract.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/docs/m365-unit-contact-api-contract.md)
2. Build review flow.
3. Build activation flow.
4. Build reminder flow.

## Phase 3: Frontend Config

Update [m365-config.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365-config.js):

1. choose `ACTIVE_PROFILE`
   - recommended now: `a3CampusFlow`
2. fill the profile endpoints:
   - `unitContactSubmitEndpoint`
   - `unitContactStatusEndpoint`
   - optional `unitContactActivationEndpoint`
3. set `sharePointSiteUrl`
4. optional Entra app metadata
5. align endpoint payload/response with [docs/m365-unit-contact-api-contract.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/docs/m365-unit-contact-api-contract.md)
6. follow [docs/m365-unit-contact-go-live-runbook.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/docs/m365-unit-contact-go-live-runbook.md)

## Phase 4: Endpoint Integration

Choose one:

1. `sharepoint-flow`
   - the frontend posts to a Power Automate HTTP trigger
2. `m365-api`
   - the frontend posts to an Azure Function or API layer that writes to SharePoint and orchestrates activation
   - template already prepared in [m365/azure-function/unit-contact-api/README.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365/azure-function/unit-contact-api/README.md)

## Phase 5: Activation

1. Decide Pattern A or Pattern B from [docs/m365-unit-contact-implementation-blueprint.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/docs/m365-unit-contact-implementation-blueprint.md).
2. Preferred:
   - approve
   - admin prepares current-system account
   - send first-login / password-reset guidance
3. Fallback:
   - admin creates account
   - send temporary password through approved internal process
   - force change on first sign-in

## Repo Files Already Prepared

- Public frontend flow:
  - [unit-contact-application-module.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/unit-contact-application-module.js)
- Backend seam:
  - [m365-api-client.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365-api-client.js)
- Runtime config:
  - [m365-config.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365-config.js)
- Azure Function template:
  - [m365/azure-function/unit-contact-api/README.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365/azure-function/unit-contact-api/README.md)
- A3 first-cut blueprint:
  - [docs/m365-a3-unit-contact-blueprint.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/docs/m365-a3-unit-contact-blueprint.md)
- Architecture:
  - [docs/m365-unit-contact-implementation-blueprint.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/docs/m365-unit-contact-implementation-blueprint.md)
- API contract:
  - [docs/m365-unit-contact-api-contract.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/docs/m365-unit-contact-api-contract.md)

## Current Safe Default

Today the app is still safe to demo because:

- mode defaults to `local-emulator`
- no production endpoint is called until config is filled in
- frontend flow is already complete enough to validate UX before M365 wiring
