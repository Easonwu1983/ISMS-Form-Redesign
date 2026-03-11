# M365 Unit Contact API Contract

- Updated: 2026-03-11
- Used by: [m365-api-client.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365-api-client.js)
- Applies to:
  - `sharepoint-flow`
  - `m365-api`

## Goal

Define one stable request/response envelope so the frontend can switch between:

- Power Automate HTTP trigger
- Azure Function / custom API

without rewriting the public application UI.

## Runtime Config

Configured in [m365-config.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365-config.js):

- `unitContactMode`
- `unitContactSubmitEndpoint`
- `unitContactStatusEndpoint`
- `unitContactRequestTimeoutMs`
- `unitContactStatusLookupMethod`
- `unitContactStatusQueryParam`
- `unitContactSharedHeaders`
- `unitContactActivationEndpoint`

For the A3-ready version, `unitContactActivationEndpoint` is optional and can be
used as an account handoff page rather than a self-service identity endpoint.

## Contract Version

- `2026-03-11`

Frontend sends:

- `X-ISMS-Contract-Version: 2026-03-11`

## Submit Application

### Endpoint

- `unitContactSubmitEndpoint`

### Method

- `POST`

### Request body

```json
{
  "action": "unit-contact.apply",
  "requestId": "uca-1741680000000-ab12cd",
  "context": {
    "contractVersion": "2026-03-11",
    "source": "isms-form-redesign-frontend",
    "frontendOrigin": "https://your-campus-host",
    "frontendHash": "#apply-unit-contact",
    "sentAt": "2026-03-11T11:11:11.111Z"
  },
  "payload": {
    "applicantName": "王小明",
    "applicantEmail": "person@example.com",
    "extensionNumber": "61234",
    "unitCategory": "行政單位",
    "primaryUnit": "計算機及資訊網路中心",
    "secondaryUnit": "資訊網路組",
    "unitValue": "計算機及資訊網路中心／資訊網路組",
    "unitCode": "022.204",
    "contactType": "primary",
    "note": "新任窗口"
  }
}
```

### Successful response

Preferred response:

```json
{
  "ok": true,
  "application": {
    "id": "UCA-2026-0001",
    "applicantName": "王小明",
    "applicantEmail": "person@example.com",
    "extensionNumber": "61234",
    "unitCategory": "行政單位",
    "primaryUnit": "計算機及資訊網路中心",
    "secondaryUnit": "資訊網路組",
    "unitValue": "計算機及資訊網路中心／資訊網路組",
    "unitCode": "022.204",
    "contactType": "primary",
    "status": "pending_review",
    "statusLabel": "待人工審核",
    "statusDetail": "申請已收件，將由資安管理端確認單位與窗口資格。",
    "submittedAt": "2026-03-11T11:11:11.111Z",
    "updatedAt": "2026-03-11T11:11:11.111Z"
  }
}
```

Also accepted by frontend:

- SharePoint-style item with `fields`
- top-level `item`
- top-level `data`
- top-level `result`

## Lookup Application Status

### Endpoint

- `unitContactStatusEndpoint`

### Methods

1. `POST` recommended
2. `GET` supported

### POST request

```json
{
  "action": "unit-contact.lookup",
  "requestId": "ucl-1741680000000-ef45gh",
  "context": {
    "contractVersion": "2026-03-11",
    "source": "isms-form-redesign-frontend",
    "frontendOrigin": "https://your-campus-host",
    "frontendHash": "#apply-unit-contact-status",
    "sentAt": "2026-03-11T11:15:11.111Z"
  },
  "payload": {
    "email": "person@example.com"
  }
}
```

### GET request

The client will call:

```text
GET {unitContactStatusEndpoint}?email=person@example.com&contractVersion=2026-03-11
```

The query parameter name is configurable with `unitContactStatusQueryParam`.

### Successful response

Preferred response:

```json
{
  "ok": true,
  "applications": [
    {
      "id": "UCA-2026-0001",
      "applicantName": "王小明",
      "applicantEmail": "person@example.com",
      "unitValue": "計算機及資訊網路中心／資訊網路組",
      "unitCode": "022.204",
      "contactType": "primary",
      "status": "pending_review",
      "statusLabel": "待人工審核",
      "statusDetail": "申請已收件，將由資安管理端確認單位與窗口資格。",
      "submittedAt": "2026-03-11T11:11:11.111Z",
      "updatedAt": "2026-03-11T11:11:11.111Z"
    }
  ]
}
```

Also accepted by frontend:

- array at top level
- `items`
- `value`
- `data`
- SharePoint-style list items with `fields`

## Error Response

Recommended:

```json
{
  "ok": false,
  "message": "此信箱已存在同單位的進行中申請"
}
```

Accepted fields for message extraction:

- `message`
- `error`
- `detail`

## SharePoint / Power Automate Mapping

Recommended mapping from list columns to response fields:

- `ApplicationId -> id`
- `ApplicantName -> applicantName`
- `ApplicantEmail -> applicantEmail`
- `ExtensionNumber -> extensionNumber`
- `UnitCategory -> unitCategory`
- `PrimaryUnitName -> primaryUnit`
- `SecondaryUnitName -> secondaryUnit`
- `UnitValue -> unitValue`
- `UnitCode -> unitCode`
- `ContactType -> contactType`
- `Status -> status`
- `StatusLabel -> statusLabel` optional
- `StatusDetail -> statusDetail` optional
- `SubmittedAt -> submittedAt`
- `UpdatedAt -> updatedAt`
- `ReviewedAt -> reviewedAt`
- `ReviewedBy -> reviewedBy`
- `ReviewComment -> reviewComment`
- `ActivationSentAt -> activationSentAt`
- `ProvisionedAt -> provisionedAt` optional
- `ProvisionedBy -> provisionedBy` optional
- `ProvisioningNote -> provisioningNote` optional
- `AppUsername -> appUsername` optional
- `ActivatedAt -> activatedAt`
- `ExternalUserId -> externalUserId`

## Frontend Fallback Behavior

If `unitContactMode = local-emulator`:

- no remote endpoint is called
- data is stored in browser-local app store
- same UI flow still works

## Recommended Next Backend Step

Implement the two HTTP surfaces first:

1. `unit-contact.apply`
2. `unit-contact.lookup`

Once these two are live, the current frontend can switch from local emulation to real M365-backed submission and progress lookup with config only.
