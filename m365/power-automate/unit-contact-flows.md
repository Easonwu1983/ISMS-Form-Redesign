# Unit Contact Power Automate Flows

- Updated: 2026-03-11
- Scope: operational flows for `申請單位資安窗口`

## Flow 1: Submit Application

### Trigger

- `When an HTTP request is received`
- or `When an item is created` on `UnitContactApplications`
- Request schema:
  [http-trigger-apply-request.schema.json](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365/power-automate/http-trigger-apply-request.schema.json)

### Purpose

- confirm the application was received
- normalize workflow state
- notify the review mailbox or reviewers

### Inputs

- `ApplicationId`
- `ApplicantName`
- `ApplicantEmail`
- `ExtensionNumber`
- `UnitCode`
- `UnitValue`
- `ContactType`
- `SubmittedAt`

### Actions

1. Validate required fields.
2. Optionally query `UnitAdmins` to see if a primary contact already exists for the same unit.
3. Update `Status` to `pending_review` if valid.
4. Send confirmation email to the applicant.
5. Send review notification to the admin mailbox or approval group.
6. Insert `OpsAudit` row with event type `unit_contact.application_submitted`.

## Flow 2: Review Application

### Trigger

- `When an item is modified` on `UnitContactApplications`
- filtered where reviewer changes `Status`

### Supported target states

- `approved`
- `rejected`
- `returned`

### Actions

1. If `approved`:
   - write `ReviewedAt`
   - write `ReviewedBy`
   - send approval email
   - either send activation link immediately or queue activation flow
   - insert `OpsAudit` row `unit_contact.application_approved`
2. If `returned`:
   - send return-for-correction email with `ReviewComment`
   - insert `OpsAudit` row `unit_contact.application_returned`
3. If `rejected`:
   - send rejection email
   - insert `OpsAudit` row `unit_contact.application_rejected`

## Flow 3: Issue Account Handoff Notice

### Trigger

- approval flow completed
- or admin manually updates `Status` to `activation_pending`

### Actions

1. Confirm how this applicant will sign in to the current system.
2. If the current app still uses local accounts:
   - create or update the account through the existing admin process
   - prepare `AppUsername`
   - prepare first-login or password-reset instructions
3. Update these columns on `UnitContactApplications`:
   - `ProvisionedAt`
   - `ProvisionedBy`
   - `ProvisioningNote`
   - `AppUsername`
   - `ActivationSentAt`
4. Update `Status` to `activation_pending`.
5. Send the account handoff email to the applicant.
6. Insert `OpsAudit` row `unit_contact.activation_sent`.

## Flow 4: First Login Confirmed

### Trigger

- user confirms login success
- or admin manually confirms the account handoff is complete

### Actions

1. Update `UnitContactApplications`:
   - `ActivatedAt`
   - `Status = active`
   - optional `ExternalUserId` if you later upgrade the identity model
2. Upsert `UnitAdmins`
3. Insert `OpsAudit` row `unit_contact.activated`

## Flow 5: Activation Reminder

### Trigger

- scheduled cloud flow

### Scope

- applications with `Status = activation_pending`
- `ActivationSentAt` older than 3 or 7 days

### Actions

1. Send reminder email about account handoff or first login.
2. Insert `OpsAudit` row `unit_contact.activation_reminder`.

## Recommended Review Mailbox Inputs

- shared mailbox or service mailbox
- reviewer display name
- approval comment
- action link to admin review surface

## Recommended Event Types

- `unit_contact.application_submitted`
- `unit_contact.application_reviewed`
- `unit_contact.application_approved`
- `unit_contact.application_returned`
- `unit_contact.application_rejected`
- `unit_contact.activation_sent`
- `unit_contact.activation_reminder`
- `unit_contact.activated`

## Optional Azure Function Alternative

If you do not want Power Automate to own the public HTTP endpoint directly, use the
Azure Function template in:

- [m365/azure-function/unit-contact-api/README.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/m365/azure-function/unit-contact-api/README.md)

That template already implements:

- `POST /api/unit-contact/apply`
- `GET|POST /api/unit-contact/status`
- `GET /api/unit-contact/health`

and follows the same contract documented in
[docs/m365-unit-contact-api-contract.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/docs/m365-unit-contact-api-contract.md).
