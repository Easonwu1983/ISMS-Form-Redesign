# M365 Unit Contact Go-Live Runbook

- Updated: 2026-03-11
- Audience:
  - 校內前端維運人員
  - M365 / SharePoint / Power Automate 維運人員

## Goal

Turn the public `申請單位資安窗口` flow from local demo mode into a real
campus-hosted service backed by M365.

## Recommended First Cut For Your License

For Microsoft 365 A3, the recommended first production path is:

1. campus frontend in this repo
2. `a3SiteOwnerFlow` profile
3. SharePoint Lists
4. Power Automate HTTP trigger + review flows
5. admin-issued account handoff in the current system

Reference:
[docs/m365-a3-unit-contact-blueprint.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/docs/m365-a3-unit-contact-blueprint.md)
[docs/m365-a3-site-owner-fallback.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/docs/m365-a3-site-owner-fallback.md)

## Deployment Paths

Choose one backend path:

1. `sharepoint-flow`
   - frontend posts directly to Power Automate HTTP triggers
   - fastest to deliver
   - best when you have SharePoint site owner rights but do not have tenant-wide admin consent
2. `m365-api`
   - frontend posts to Azure Function
   - Azure Function writes to SharePoint and later可再擴充審核、啟用、Graph 整合
   - best when你要保留更清楚的 API 邊界與版本控管

## Frontend Runtime Switch

Edit [m365-config.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365-config.js):

- `ACTIVE_PROFILE = "localDemo"`
  - local demo only
- `ACTIVE_PROFILE = "a3SiteOwnerFlow"`
  - production via Power Automate with delegated site-owner provisioning
- `ACTIVE_PROFILE = "a3CampusFlow"`
  - production via Power Automate
- `ACTIVE_PROFILE = "azureFunctionCampus"`
  - production via Azure Function

Then replace the placeholder URLs in the selected profile.

Preferred campus deployment method:

1. keep `m365-config.js` in repo default mode
2. deploy a local override file based on
   [m365-config.override.sample.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365-config.override.sample.js)
3. rename it to `m365-config.override.js` on the campus host
4. fill only the environment-specific endpoint values there

## Option A: A3 Power Automate Go-Live

1. Create the SharePoint lists from:
   [m365/sharepoint/unit-contact-lists.schema.json](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365/sharepoint/unit-contact-lists.schema.json)
2. Build two HTTP trigger flows:
   - submit
   - lookup
3. Paste these schemas into the trigger designer:
   - [m365/power-automate/http-trigger-apply-request.schema.json](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365/power-automate/http-trigger-apply-request.schema.json)
   - [m365/power-automate/http-trigger-lookup-request.schema.json](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365/power-automate/http-trigger-lookup-request.schema.json)
4. Make the response body match:
   [docs/m365-unit-contact-api-contract.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/docs/m365-unit-contact-api-contract.md)
   Suggested examples:
   - [m365/power-automate/http-trigger-apply-response.sample.json](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365/power-automate/http-trigger-apply-response.sample.json)
   - [m365/power-automate/http-trigger-lookup-response.sample.json](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365/power-automate/http-trigger-lookup-response.sample.json)
5. Put the generated trigger URLs into:
   - `unitContactSubmitEndpoint`
   - `unitContactStatusEndpoint`
6. Switch `ACTIVE_PROFILE` to `a3SiteOwnerFlow` or `a3CampusFlow`
7. Test:
   - submit one fake application
   - lookup by email
   - verify SharePoint row is written
8. Confirm the admin side can:
   - create or update the current app account
   - send first-login or password-reset instructions
   - mark the application as `activation_pending`
9. Record the real values in:
   [docs/m365-a3-implementation-worksheet.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/docs/m365-a3-implementation-worksheet.md)

## Automated Backend Bootstrap

For tenant-side backend preparation from this repo:

1. Prepare app credentials in a local-only file or environment variables:
   - `M365_A3_TENANT_ID`
   - `M365_A3_CLIENT_ID`
   - `M365_A3_CLIENT_SECRET`
   - optional `M365_A3_SITE_ID`
2. Run `npm run m365:a3:health`
   - verifies whether Graph application permissions have been admin-consented
3. Run `npm run m365:a3:provision`
   - creates the SharePoint lists defined in
     [m365/sharepoint/unit-contact-lists.schema.json](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365/sharepoint/unit-contact-lists.schema.json)
4. If health reports missing roles, complete admin consent first, then rerun the two commands

## Site Owner Fallback Bootstrap

If tenant-wide admin consent is not available:

1. get added as `Site Owner` on the target SharePoint site
2. set `M365_A3_SITE_URL` or keep the site URL in local backend config
3. run `npm run m365:a3:site-owner:health`
4. run `npm run m365:a3:site-owner:provision`
5. switch frontend override to `a3SiteOwnerFlow`

Reference:
[docs/m365-a3-site-owner-fallback.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/docs/m365-a3-site-owner-fallback.md)
[docs/m365-a3-site-owner-request-template.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/docs/m365-a3-site-owner-request-template.md)

## Option B: Azure Function Go-Live

1. Open:
   [m365/azure-function/unit-contact-api/README.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365/azure-function/unit-contact-api/README.md)
2. Deploy the Azure Function app
3. Configure app settings:
   - `UNIT_CONTACT_REPOSITORY=sharepoint`
   - `MS_TENANT_ID`
   - `MS_CLIENT_ID`
   - `MS_CLIENT_SECRET`
   - `SHAREPOINT_SITE_ID`
   - `SHAREPOINT_APPLICATIONS_LIST_ID`
4. Grant Graph application permissions needed for SharePoint list access
5. Put the deployed function URLs into:
   - `unitContactSubmitEndpoint`
   - `unitContactStatusEndpoint`
   - optional `unitContactActivationEndpoint`
6. Switch `ACTIVE_PROFILE` to `azureFunctionCampus`
7. Test:
   - `GET /api/unit-contact/health`
   - submit one fake application
   - lookup by email
   - verify SharePoint row is written

## Campus Frontend Publish Checklist

1. Confirm the campus static host serves the latest [index.html](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/index.html)
2. Confirm `m365-config.js` is the correct environment version
3. Clear CDN or reverse-proxy cache if any
4. Open:
   - `/#apply-unit-contact`
   - `/#apply-unit-contact-status`
5. Submit a test record
6. Confirm the user sees:
   - generated application ID
   - status lookup result

## Security Checklist Before Go-Live

1. Do not keep production URLs in `localDemo`
2. Restrict CORS on Azure Function or proxy layer
3. Use service identity or app registration with minimum required permissions
4. Store client secret only in Azure app settings, never in frontend files
5. Add flow or API throttling if public traffic is possible
6. Add reviewer-side approval logging into `OpsAudit`
7. Review email templates to ensure they do not expose raw passwords

## Recommended First Production Cut

For your current project stage, I recommend this order:

1. Launch with `a3SiteOwnerFlow`
2. Validate end-to-end business flow with a small set of units
3. If tenant admin consent becomes available, optionally move to `a3CampusFlow`
4. If the workflow grows more complex, move to `azureFunctionCampus`

This keeps the first rollout faster, while preserving a cleaner API upgrade path.
