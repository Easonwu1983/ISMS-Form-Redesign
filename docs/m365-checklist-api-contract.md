# M365 Checklist API Contract

This document defines phase 1 of checklist backendization for the internal audit system.

## Goal

Move checklist drafts and submissions out of browser `localStorage` into the same M365 / SharePoint-backed campus backend pattern already used by `unit-contact` and `corrective-actions`.

Phase 1 intentionally keeps the current product behavior:

- checklist answers remain a single checklist record
- template sections still stay in frontend local storage
- workflow stays `draft` -> `submitted`
- no extra approval workflow is added yet

## SharePoint List

- List name: `Checklists`
- Provision schema:
  - [m365/sharepoint/checklist-lists.schema.json](C:\Users\User\Playground\ISMS-Form-Redesign\m365\sharepoint\checklist-lists.schema.json)

Core storage approach:

- one row per checklist
- `ResultsJson` stores the answer map keyed by checklist item id
- summary counts are duplicated into numeric columns for quick filtering/reporting

## Backend Endpoints

- `GET /api/checklists/health`
- `GET /api/checklists`
- `GET /api/checklists/:id`
- `POST /api/checklists/:id/save-draft`
- `POST /api/checklists/:id/submit`

## Request Envelope

All write endpoints use:

```json
{
  "action": "checklist.save-draft",
  "payload": {
    "id": "CHK-115-CC-1",
    "unit": "計算機及資訊網路中心",
    "fillerName": "李工程師",
    "fillerUsername": "li",
    "fillDate": "2026-03-12",
    "auditYear": "115",
    "supervisorName": "王主任",
    "supervisorTitle": "主任",
    "signStatus": "已簽核",
    "signDate": "2026-03-12",
    "supervisorNote": "",
    "results": {
      "1.1": {
        "compliance": "符合",
        "execution": "已完成",
        "evidence": "作業程序文件"
      }
    },
    "summary": {
      "total": 1,
      "conform": 1,
      "partial": 0,
      "nonConform": 0,
      "na": 0
    },
    "actorName": "李工程師",
    "actorUsername": "li"
  }
}
```

## Validation Rules

### Save draft

Required:

- `id`
- `unit`
- `fillerName`
- `fillDate`
- `auditYear`

Allowed:

- incomplete answers
- incomplete signoff metadata

Blocked:

- updating a checklist that is already submitted
- creating another checklist with the same `unit + auditYear`

### Submit

Required:

- all save-draft fields
- `supervisorName`
- `supervisorTitle`
- `signStatus`
- `signDate`
- all checklist items answered

Phase 1 completeness rule is based on:

- `summary.total`
- number of answered entries in `results`

The backend does not yet validate against the checklist template definition itself. That stays phase 2.

## Response Shape

Successful detail/list/write responses return:

```json
{
  "ok": true,
  "item": {
    "id": "CHK-115-CC-1",
    "documentNo": "CHK-115-CC",
    "checklistSeq": 1,
    "unit": "計算機及資訊網路中心",
    "unitCode": "CC",
    "status": "草稿",
    "results": {},
    "summary": {
      "total": 0,
      "conform": 0,
      "partial": 0,
      "nonConform": 0,
      "na": 0
    },
    "createdAt": "2026-03-12T08:00:00.000Z",
    "updatedAt": "2026-03-12T08:00:00.000Z"
  },
  "contractVersion": "2026-03-12"
}
```

## Provisioning

Provision the SharePoint list with:

```powershell
node scripts/m365-a3-checklist-provision.cjs
```

## Activation Notes

This phase only creates the backend contract and SharePoint schema. Frontend write-through integration is the next step after the `Checklists` list is provisioned and the campus backend is deployed with the new route.

## Live Activation Status

As of 2026-03-12:

- campus backend route has been deployed to the Ubuntu VM
- frontend runtime has been updated to point checklist traffic at `/api/checklists`
- live health is reachable from:
  - `http://127.0.0.1:8787/api/checklists/health`
  - `http://127.0.0.1:8088/api/checklists/health`
- current health response is still:
  - `ok: false`
  - `ready: false`
  - `message: SharePoint list not found: Checklists`

The blocking issue is now external to the code:

- running `node scripts/m365-a3-checklist-provision.cjs` on the live Ubuntu VM returns Graph `403 accessDenied`
- the delegated account can sign in, but still does not have `Manage Lists` capability on the SharePoint site

Required admin actions:

1. grant the delegated backend account list-management permission on `ISMSFormsWorkspace`
2. rerun:

```powershell
node scripts/m365-a3-checklist-provision.cjs
```

3. verify health returns `ready: true`
