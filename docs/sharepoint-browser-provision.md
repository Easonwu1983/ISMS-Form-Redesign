# SharePoint Browser Provision

Use this when the backend account can read the SharePoint site but `Graph POST /lists` still returns `403 accessDenied`.

This script uses the currently signed-in browser session on:

- `https://ntums365.sharepoint.com/sites/ISMSFormsWorkspace`

to create the missing lists and fields directly through SharePoint REST.

## What It Creates

- `CorrectiveActions`
- `Checklists`
- `TrainingForms`
- `TrainingRosters`

## How To Run

1. Open:
   - `https://ntums365.sharepoint.com/sites/ISMSFormsWorkspace`
2. Press `F12`
3. Open the browser `Console`
4. Paste the contents of:
   - [scripts/sharepoint-browser-provision.js](/C:/Users/User/Playground/ISMS-Form-Redesign/scripts/sharepoint-browser-provision.js)
5. Press `Enter`
6. Wait until the console shows:
   - `SharePoint browser provision completed.`

## After It Finishes

Run these health checks again:

- `http://127.0.0.1:8088/api/corrective-actions/health`
- `http://127.0.0.1:8088/api/checklists/health`
- `http://127.0.0.1:8088/api/training/health`

All three should switch from:

- `ready: false`

to:

- `ready: true`
