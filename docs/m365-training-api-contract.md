# M365 Training API Contract

## Scope
- Module: `資安教育訓練統計`
- Backend profile: `a3CampusBackend`
- Phase: 1
- Repository target:
  - SharePoint List `TrainingForms`
  - SharePoint List `TrainingRosters`

Phase 1 keeps the current frontend workflow intact and moves the persisted form / roster data to M365. Per-person records, summary, signoff files, and history are stored as JSON fields inside `TrainingForms`.

## Endpoints

### Health
- `GET /api/training/health`

Response shape:

```json
{
  "ok": true,
  "ready": true,
  "contractVersion": "2026-03-12",
  "repository": "sharepoint-delegated-cli",
  "formsList": {
    "id": "..."
  },
  "rostersList": {
    "id": "..."
  }
}
```

### Forms
- `GET /api/training/forms`
- `GET /api/training/forms/:id`
- `POST /api/training/forms/:id/save-draft`
- `POST /api/training/forms/:id/submit-step-one`
- `POST /api/training/forms/:id/finalize`
- `POST /api/training/forms/:id/return`
- `POST /api/training/forms/:id/undo`

Supported query parameters for `GET /api/training/forms`:
- `status`
- `unit`
- `statsUnit`
- `trainingYear`
- `fillerUsername`
- `q`

Action envelope:

```json
{
  "action": "training.form.save-draft",
  "payload": {
    "id": "TRN-115-CC-1",
    "unit": "計算機及資訊網路中心 / 資訊網路組",
    "statsUnit": "計算機及資訊網路中心",
    "fillerName": "李工程師",
    "fillerUsername": "li",
    "submitterPhone": "02-3366-5020",
    "submitterEmail": "li@example.edu.tw",
    "fillDate": "2026-03-12",
    "trainingYear": "115",
    "records": [],
    "summary": {},
    "signedFiles": [],
    "history": [],
    "actorName": "李工程師",
    "actorUsername": "li"
  }
}
```

Rules:
- `save-draft`
  - allows `暫存`
  - if current record is `退回更正`, keep that status until re-submitted
- `submit-step-one`
  - target status becomes `待簽核`
  - clears `returnReason`
- `finalize`
  - requires at least one signoff file
  - target status becomes `已完成填報`
- `return`
  - requires `returnReason`
  - target status becomes `退回更正`
- `undo`
  - moves `待簽核` back to `暫存`
  - clears step-one / signoff timestamps

### Rosters
- `GET /api/training/rosters`
- `POST /api/training/rosters/upsert`
- `POST /api/training/rosters/:id/delete`

Supported query parameters for `GET /api/training/rosters`:
- `unit`
- `statsUnit`
- `source`
- `q`

Upsert envelope:

```json
{
  "action": "training.roster.upsert",
  "payload": {
    "id": "RST-0001",
    "unit": "計算機及資訊網路中心 / 資訊網路組",
    "statsUnit": "計算機及資訊網路中心",
    "l1Unit": "計算機及資訊網路中心",
    "name": "王小明",
    "unitName": "資訊網路組",
    "identity": "職員",
    "jobTitle": "工程師",
    "source": "manual",
    "createdBy": "李工程師",
    "createdByUsername": "li",
    "actorName": "李工程師",
    "actorUsername": "li"
  }
}
```

Delete envelope:

```json
{
  "action": "training.roster.delete",
  "payload": {
    "actorName": "計中管理者",
    "actorUsername": "admin"
  }
}
```

## SharePoint Mapping

### TrainingForms
- Key fields:
  - `FormId`
  - `DocumentNo`
  - `Unit`
  - `StatsUnit`
  - `TrainingYear`
  - `Status`
- JSON fields:
  - `RecordsJson`
  - `SummaryJson`
  - `SignedFilesJson`
  - `HistoryJson`

### TrainingRosters
- Key fields:
  - `RosterId`
  - `Unit`
  - `StatsUnit`
  - `Name`
  - `Source`

## Provisioning

```bash
node scripts/m365-a3-training-provision.cjs
```

The delegated account must be able to create and manage SharePoint lists on the configured site.

## Live Activation Status
- Phase 1 code can be deployed before SharePoint lists exist.
- Health will return:
  - `ok: false`
  - `ready: false`
  - `message: SharePoint list not found: TrainingForms`
  or
  - `message: SharePoint list not found: TrainingRosters`
- Once site permission is granted, rerun:

```bash
node scripts/m365-a3-training-provision.cjs
```
