# M365 A3 Implementation Worksheet

- Updated: 2026-03-12
- Purpose: collect the real values needed to switch this repo from demo mode to the A3 production path

## SharePoint

- Site URL: https://ntums365.sharepoint.com/sites/ISMSFormsWorkspace
- Site ID: ntums365.sharepoint.com,8c29bc46-e7a8-445f-84cf-6dc48609bca8,f9096dd2-df76-4e86-9986-a121bffaee87
- Site owner account added: easonwu@m365.ntu.edu.tw
- Applications list name: UnitContactApplications
- Applications list id: b80533f7-b2a5-424f-8cee-4f743bb4779d
- UnitAdmins list name: UnitAdmins
- UnitAdmins list id: be2f5f0c-f954-4ade-b11b-8c34a2780498
- OpsAudit list name: OpsAudit
- OpsAudit list id: 8ab0e9f8-0ef2-421a-81b2-2a00f05fc233

## Power Automate

- Environment discovery on 2026-03-12: `0 environments returned`
- Decision: do not block delivery on Power Automate
- Keep these fields only if Power Automate becomes available later:

### Submit flow

- Flow name:
- HTTP trigger URL:

### Lookup flow

- Flow name:
- HTTP trigger URL:

## Campus Backend

- Recommended profile: `a3CampusBackend`
- Backend host URL:
- Submit endpoint:
- Lookup endpoint:
- Health endpoint:
- CLI site-owner account:
- Backend service runtime owner:
- CORS origins approved:

## Account Handoff

- Current system account creation owner:
- Username rule:
- Password / reset rule:
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
- Health endpoint reachable:
- Admin handoff guidance verified:

## Final Switch

When all values above are ready:

1. keep [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.js](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.js) in `localDemo`
2. deploy `m365-config.override.js` to campus host
3. set:
   - `activeProfile: "a3CampusBackend"`
   - `unitContactMode: "m365-api"`
   - `unitContactSubmitEndpoint`
   - `unitContactStatusEndpoint`
4. smoke test `#apply-unit-contact` and `#apply-unit-contact-status`
