# Campus Production Deployment Checklist

- Updated: 2026-03-12
- Scope: `申請單位資安窗口` campus frontend + campus backend + SharePoint A3 path

## 1. Host Preparation

- [ ] Campus frontend host is ready
- [ ] Campus backend Windows host is ready
- [ ] Node.js is installed on the backend host
- [ ] Git checkout or deployment folder is ready
- [ ] Backend host can reach:
  - SharePoint Online
  - Microsoft login endpoints
  - campus frontend host

## 2. Accounts and Permissions

- [ ] One Windows service account is chosen for the backend
- [ ] That same account can sign in to M365
- [ ] That same account is a SharePoint `Site Owner` on:
  - `https://ntums365.sharepoint.com/sites/ISMSFormsWorkspace`
- [ ] SharePoint lists exist:
  - `UnitContactApplications`
  - `UnitAdmins`
  - `OpsAudit`

## 3. SharePoint Validation

Run:

```powershell
npm run m365:a3:site-owner:health
npm run m365:a3:site-owner:provision
```

Confirm:

- [ ] `canReadSite = true`
- [ ] `canReadLists = true`
- [ ] `listCount >= 4`

## 4. Backend Runtime File

Copy:

- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\campus-backend\runtime.sample.json](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\campus-backend\runtime.sample.json)

to:

- `m365\campus-backend\runtime.local.json`

Fill:

- [ ] `allowedOrigins`
- [ ] `sharePointSiteId`
- [ ] `sharePointSiteUrl`
- [ ] `logDir`

## 5. Backend Service Install

Use:

- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\install-unit-contact-backend-service.ps1](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\install-unit-contact-backend-service.ps1)

Confirm:

- [ ] Service name installed
- [ ] Startup type is automatic
- [ ] Recovery actions are set
- [ ] Service runs under the chosen M365 Windows account

## 6. Frontend Override

Copy:

- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.override.sample.js](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.override.sample.js)

to:

- `m365-config.override.js`

Set:

- [ ] `activeProfile = "a3CampusBackend"`
- [ ] `unitContactMode = "m365-api"`
- [ ] `unitContactSubmitEndpoint`
- [ ] `unitContactStatusEndpoint`

## 7. Post-Deploy Verification

- [ ] `GET /api/unit-contact/health` returns `ok = true`
- [ ] frontend page `/#apply-unit-contact` loads
- [ ] frontend page `/#apply-unit-contact-status` loads
- [ ] one test application can be submitted
- [ ] lookup by email returns the new application
- [ ] one SharePoint row is created
- [ ] one audit row is created

## 8. Operational Readiness

- [ ] Log path exists and is writable
- [ ] Backend log file rotates or is monitored
- [ ] Reviewer knows how to process submitted applications
- [ ] Admin knows how to create / hand off the current system account
- [ ] First-login guidance template is approved

## 9. Rollback Plan

- [ ] `m365-config.override.js` can be reverted to local demo or maintenance page
- [ ] Windows service can be stopped quickly
- [ ] Previous static frontend build is retained
- [ ] Review mailbox or manual process is ready if backend is paused
