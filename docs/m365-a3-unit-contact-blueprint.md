# M365 A3 Unit Contact Blueprint

- Updated: 2026-03-11
- Goal: ship a practical first version of `申請單位資安窗口` using only Microsoft 365 A3-included capabilities

## What This Version Uses

- campus-hosted frontend in this repo
- SharePoint / Microsoft Lists
- Power Automate for review and email notification
- current app account model for actual login

## What This Version Avoids

- Entra External ID
- Azure Functions as a requirement
- premium Power Platform connectors
- public self-service identity provisioning

## A3-Ready Flow

1. Applicant fills `申請單位資安窗口`
2. Frontend sends data to Power Automate HTTP trigger
3. Flow writes `UnitContactApplications`
4. 管理端審核申請
5. 核准後由管理端建立或確認目前系統帳號
6. Flow 寄出帳號開通 / 首次登入 / 改密碼說明
7. 申請人在既有系統完成首次登入
8. 管理端將該申請標記為 `active`

## Recommended Status Meaning

- `pending_review`
  - 已收件，等待人工審核
- `returned`
  - 退回補件
- `approved`
  - 已核准，等待管理端建帳或準備登入方式
- `activation_pending`
  - 已寄出帳號開通通知，等待申請人完成首次登入
- `active`
  - 帳號已開通，可正式使用

## Why This Fits A3

- SharePoint Lists and Power Automate are included in Microsoft 365 A3
- standard HTTP trigger + SharePoint actions are enough for this workflow
- no premium identity product is required in the first phase

## Practical Fallback If You Lack Tenant Admin

If the project owner cannot obtain tenant-wide admin consent, use the delegated site-owner route instead:

- get added as `Site Owner` on one SharePoint site
- create the three lists in that site
- let Power Automate write to those lists with the same delegated account
- keep the frontend profile on `a3SiteOwnerFlow`

Reference:
[C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\m365-a3-site-owner-fallback.md](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\m365-a3-site-owner-fallback.md)

## Suggested Operational Rule

- one primary contact per unit
- optional one backup contact
- any replacement must go through review
- do not email raw long-term passwords
- if a temporary password must be used, send it through your approved internal process and require first-login password change

## Repo Files To Use First

- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\unit-contact-application-module.js](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\unit-contact-application-module.js)
- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.js](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365-config.js)
- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\sharepoint\unit-contact-lists.schema.json](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\sharepoint\unit-contact-lists.schema.json)
- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\power-automate\unit-contact-flows.md](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\power-automate\unit-contact-flows.md)
- [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\m365-unit-contact-go-live-runbook.md](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\docs\m365-unit-contact-go-live-runbook.md)

## Future Upgrade Path

When you later need stronger identity automation, you can keep the same frontend and upgrade the backend to:

- Azure Function API
- Entra / External ID
- more automated account provisioning

The public application flow and SharePoint records can stay mostly unchanged.
