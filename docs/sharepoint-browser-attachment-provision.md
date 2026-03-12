# SharePoint Browser Attachment Provision

Use this when the backend account can read the SharePoint site but `Graph POST /lists` still returns `403 accessDenied`, and you need to create the `ISMSAttachments` document library by using your current signed-in browser session.

This script uses the browser session on:

- `https://ntums365.sharepoint.com/sites/ISMSFormsWorkspace`

to create the missing attachment library, columns, and standard folders directly through SharePoint REST.

## What It Creates

- Document library: `ISMSAttachments`
- Columns:
  - `AttachmentId`
  - `Scope`
  - `OwnerId`
  - `RecordType`
  - `ContentTypeHint`
  - `UploadedAt`
- Folders:
  - `corrective-actions`
  - `checklists`
  - `training`
  - `misc`

## How To Run

1. Open:
   - `https://ntums365.sharepoint.com/sites/ISMSFormsWorkspace`
2. Press `F12`
3. Open the browser `Console`
4. Paste the contents of:
   - [scripts/sharepoint-browser-attachment-provision.js](/C:/Users/User/Playground/ISMS-Form-Redesign/scripts/sharepoint-browser-attachment-provision.js)
5. Press `Enter`
6. Wait until the console shows:
   - `SharePoint attachment library provision completed.`

## After It Finishes

Run this health check again:

- `http://127.0.0.1:8088/api/attachments/health`

It should switch from:

- `ready: false`

to:

- `ready: true`
