# M365 A3 Implementation Worksheet

- Updated: 2026-03-11
- Purpose: collect the real values needed to switch this repo from demo mode to the A3 production path

## SharePoint

- Site URL:
- Site ID:
- Site owner account added:
- Applications list name:
- Applications list id:
- UnitAdmins list name:
- UnitAdmins list id:
- OpsAudit list name:
- OpsAudit list id:

## Power Automate

### Submit flow

- Flow name:
- HTTP trigger URL:
- Response body checked against:
  [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\power-automate\http-trigger-apply-response.sample.json](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\power-automate\http-trigger-apply-response.sample.json)

### Lookup flow

- Flow name:
- HTTP trigger URL:
- Response body checked against:
  [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\power-automate\http-trigger-lookup-response.sample.json](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\power-automate\http-trigger-lookup-response.sample.json)

### Review flow

- Flow name:
- Reviewer mailbox:
- Approval mailbox/group:
- Return mail template ready: yes / no
- Approval mail template ready: yes / no

### Account handoff flow

- Flow name:
- Current system account creation owner:
- Username rule:
- Password/reset rule:
- First-login instructions approved: yes / no

## Frontend Deployment

- Campus host URL:
- Will use override file: yes / no
- If yes:
  - copy [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.override.sample.js](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.override.sample.js)
  - rename to `m365-config.override.js`
  - fill submit / lookup endpoint URLs

## Validation

- Public apply page reachable:
- Public status page reachable:
- Submit test application successful:
- Lookup by email successful:
- SharePoint row created:
- Admin handoff email received:
- First-login guidance verified:

## Final Switch

When all values above are ready:

1. keep [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.js](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.js) in `localDemo`
2. deploy `m365-config.override.js` to campus host
3. set:
   - `activeProfile: "a3SiteOwnerFlow"`
   - `unitContactMode: "sharepoint-flow"`
   - `unitContactSubmitEndpoint`
   - `unitContactStatusEndpoint`
4. smoke test `#apply-unit-contact` and `#apply-unit-contact-status`

## Site Owner Fallback Commands

If you are using the non-admin A3 fallback path:

1. `npm run m365:a3:site-owner:health`
2. `npm run m365:a3:site-owner:provision`
