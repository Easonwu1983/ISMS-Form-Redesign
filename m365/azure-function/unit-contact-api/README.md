# ISMS Unit Contact Azure Function Template

This folder provides a minimal Azure Functions v4 Node.js backend for the
public `申請單位資安窗口` flow.

It exposes three HTTP endpoints:

- `POST /api/unit-contact/apply`
- `GET|POST /api/unit-contact/status`
- `GET /api/unit-contact/health`

The request and response contract matches
[docs/m365-unit-contact-api-contract.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/docs/m365-unit-contact-api-contract.md).

## Modes

Set `UNIT_CONTACT_REPOSITORY` in `local.settings.json` or app settings:

- `mock`
  - default
  - keeps applications in process memory
  - useful for local API testing
- `sharepoint`
  - writes to SharePoint through Microsoft Graph
  - requires app registration and list IDs

## Quick Start

1. Copy `local.settings.sample.json` to `local.settings.json`
2. Install Azure Functions Core Tools
3. Install dependencies
4. Start the function host

```powershell
cd m365\azure-function\unit-contact-api
npm install
npm run check
npm run start
```

Then point [m365-config.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365-config.js) to:

- `unitContactMode = "m365-api"`
- `unitContactSubmitEndpoint = "http://127.0.0.1:7071/api/unit-contact/apply"`
- `unitContactStatusEndpoint = "http://127.0.0.1:7071/api/unit-contact/status"`

## SharePoint Mode Environment Variables

- `UNIT_CONTACT_REPOSITORY=sharepoint`
- `MS_TENANT_ID`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `SHAREPOINT_SITE_ID`
- `SHAREPOINT_APPLICATIONS_LIST_ID`
- `MS_GRAPH_SCOPE` optional, defaults to `https://graph.microsoft.com/.default`

## Notes

- The template uses `authLevel: "anonymous"` so the static frontend can call it
  directly. If you want stronger protection, put it behind APIM, a campus
  reverse proxy, or a trusted middleware layer.
- The SharePoint repository is intentionally simple. It is a good production
  starting point, but you will still want to add reviewer auth, rate limiting,
  CORS policy, and operational logging.
