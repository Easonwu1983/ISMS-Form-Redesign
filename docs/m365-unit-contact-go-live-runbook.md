# M365 Unit Contact Go-Live Runbook

- Updated: 2026-03-11
- Audience:
  - 校內前端維運人員
  - M365 / SharePoint / Power Automate 維運人員

## Goal

Turn the public `申請單位資安窗口` flow from local demo mode into a real
campus-hosted service backed by M365.

## Deployment Paths

Choose one backend path:

1. `sharepoint-flow`
   - frontend posts directly to Power Automate HTTP triggers
   - fastest to deliver
   - best when流程主要由 M365 維運人員管理
2. `m365-api`
   - frontend posts to Azure Function
   - Azure Function writes to SharePoint and later可再擴充審核、啟用、Graph 整合
   - best when你要保留更清楚的 API 邊界與版本控管

## Frontend Runtime Switch

Edit [m365-config.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365-config.js):

- `ACTIVE_PROFILE = "localDemo"`
  - local demo only
- `ACTIVE_PROFILE = "sharePointFlowCampus"`
  - production via Power Automate
- `ACTIVE_PROFILE = "azureFunctionCampus"`
  - production via Azure Function

Then replace the placeholder URLs in the selected profile.

## Option A: Power Automate Go-Live

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
5. Put the generated trigger URLs into:
   - `unitContactSubmitEndpoint`
   - `unitContactStatusEndpoint`
6. Switch `ACTIVE_PROFILE` to `sharePointFlowCampus`
7. Test:
   - submit one fake application
   - lookup by email
   - verify SharePoint row is written

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

1. Launch with `sharePointFlowCampus`
2. Validate end-to-end business flow with a small set of units
3. If the workflow grows more complex, move to `azureFunctionCampus`

This keeps the first rollout faster, while preserving a cleaner API upgrade path.
