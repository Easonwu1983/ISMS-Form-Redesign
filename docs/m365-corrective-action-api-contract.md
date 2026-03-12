# M365 Corrective Action API Contract

- Updated: 2026-03-12
- Scope: phase 1 backendization for corrective action workflow

## Goal

Move corrective action records from browser `localStorage` into SharePoint-backed API endpoints without forcing an immediate frontend rewrite.

Phase 1 keeps the current frontend workflow shape:

- 開立矯正單
- 填報矯正措施
- 管理者審核
- 追蹤提報
- 追蹤審核

## Backend Mode

- runtime profile: `a3CampusBackend`
- repository: SharePoint Lists through campus backend
- auth model for current phase: delegated site-owner CLI session on the backend host

## SharePoint List

- schema: [C:\Users\User\Playground\ISMS-Form-Redesign\m365\sharepoint\corrective-action-lists.schema.json](C:\Users\User\Playground\ISMS-Form-Redesign\m365\sharepoint\corrective-action-lists.schema.json)
- primary list: `CorrectiveActions`
- audit list reuse: `OpsAudit`

## Endpoints

### `GET /api/corrective-actions/health`

Returns backend actor, site, and corrective-action list metadata.

### `GET /api/corrective-actions`

Optional query params:

- `status`
- `handlerUnit`
- `handlerUsername`
- `q`

Returns the normalized corrective-action list.

### `GET /api/corrective-actions/:id`

Returns one normalized corrective-action record.

### `POST /api/corrective-actions`

Envelope:

```json
{
  "action": "corrective-action.create",
  "payload": {
    "id": "CAR-0005",
    "documentNo": "ISC-1140001",
    "caseSeq": 1,
    "proposerUnit": "計算機及資訊網路中心／資訊網路組",
    "proposerUnitCode": "CC",
    "proposerName": "王經理",
    "proposerUsername": "unit1",
    "proposerDate": "2026-03-12",
    "handlerUnit": "總務處／營繕組",
    "handlerUnitCode": "GA",
    "handlerName": "黃工程師",
    "handlerUsername": "user3",
    "handlerEmail": "huang@company.com",
    "handlerDate": "2026-03-15",
    "deficiencyType": "主要缺失",
    "source": "內部稽核",
    "category": ["硬體", "基礎設施"],
    "clause": "A.11.2.2",
    "problemDesc": "伺服器機房溫度超標。",
    "occurrence": "例行巡檢發現空調異常。",
    "correctiveDueDate": "2026-03-20",
    "actorName": "王經理",
    "actorUsername": "unit1"
  }
}
```

### `POST /api/corrective-actions/:id/respond`

Envelope:

```json
{
  "action": "corrective-action.respond",
  "payload": {
    "correctiveAction": "已更換溫控感測器並完成校正。",
    "correctiveDueDate": "2026-03-20",
    "rootCause": "設備逾期未校正。",
    "rootElimination": "建立季度校正排程。",
    "rootElimDueDate": "2026-03-31",
    "riskDesc": "",
    "riskAcceptor": "",
    "riskAcceptDate": "",
    "riskAssessDate": "",
    "evidence": [],
    "actorName": "黃工程師",
    "actorUsername": "user3"
  }
}
```

### `POST /api/corrective-actions/:id/review`

Allowed `decision`:

- `start_review`
- `close`
- `tracking`
- `return`

### `POST /api/corrective-actions/:id/tracking-submit`

Envelope:

```json
{
  "action": "corrective-action.tracking.submit",
  "payload": {
    "tracker": "黃工程師",
    "trackDate": "2026-03-21",
    "execution": "改善措施已完成。",
    "trackNote": "現場溫度恢復正常。",
    "result": "擬請同意結案",
    "nextTrackDate": "",
    "evidence": [
      {
        "attachmentId": "trk_abc123",
        "name": "evidence.pdf",
        "type": "application/pdf",
        "size": 102400,
        "extension": "pdf",
        "signature": "evidence.pdf::102400::application/pdf",
        "storedAt": "2026-03-21T08:00:00.000Z",
        "scope": "tracking-evidence",
        "ownerId": "CAR-0005"
      }
    ],
    "actorName": "黃工程師",
    "actorUsername": "user3"
  }
}
```

Rules:

- `result = 擬請同意結案` => evidence required
- `result = 建議持續追蹤` => `nextTrackDate` required

### `POST /api/corrective-actions/:id/tracking-review`

Allowed `decision`:

- `close`
- `continue`

## Response Shape

Success body:

```json
{
  "ok": true,
  "item": {
    "id": "CAR-0005",
    "status": "追蹤中"
  },
  "contractVersion": "2026-03-12"
}
```

Error body:

```json
{
  "ok": false,
  "message": "建議持續追蹤時必須填寫下一次追蹤日期。"
}
```

## Notes

1. Phase 1 keeps `trackings`, `pendingTracking`, `evidence`, and `history` as JSON fields so the frontend can migrate faster.
2. Binary attachment storage should move to SharePoint document libraries in phase 2.
3. Checklist, training, user, and attachment backends should follow the same seam after corrective-action migration is stable.

## Live Activation Status

Current live campus backend state on 2026-03-12:

- service route is deployed
- frontend campus profile is deployed
- health endpoint returns `ready: false`
- blocking reason: SharePoint site does not currently allow this delegated account to create or manage the `CorrectiveActions` list

Required admin action:

1. Grant the deployment account site permission that includes list management on `ISMSFormsWorkspace`
2. Run `node scripts/m365-a3-corrective-action-provision.cjs` on the Ubuntu backend host as `ismsbackend`
3. Recheck `GET /api/corrective-actions/health` until `ready: true`
