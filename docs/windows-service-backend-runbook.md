# Windows Service Backend Runbook

- Updated: 2026-03-12
- Scope: keep the campus backend running as a Windows service

## Important Rule

The Windows service must run under the same Windows account that already completed:

- Microsoft 365 sign-in
- CLI for Microsoft 365 sign-in
- SharePoint site-owner access validation

Do not run this service as `LocalSystem` if you expect delegated M365 access to work.

## No-Admin Fallback

If the machine is not in an elevated PowerShell session and you cannot install a real Windows service yet, use the per-user startup task fallback:

- Installer:
  [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\install-unit-contact-backend-user-task.ps1](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\install-unit-contact-backend-user-task.ps1)
- Runner:
  [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\start-unit-contact-backend-user-session.ps1](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\start-unit-contact-backend-user-session.ps1)
- Health:
  [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\test-unit-contact-backend-user-task.ps1](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\test-unit-contact-backend-user-task.ps1)
- Remove:
  [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\uninstall-unit-contact-backend-user-task.ps1](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\uninstall-unit-contact-backend-user-task.ps1)

This fallback starts the backend automatically when the current Windows user signs in. It is not a true system service, but it preserves the same delegated M365 identity that already works for SharePoint access.

If Scheduled Tasks are also blocked by local policy, use the Startup folder fallback:

- Installer:
  [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\install-unit-contact-backend-startup.ps1](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\install-unit-contact-backend-startup.ps1)
- Health:
  [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\test-unit-contact-backend-startup.ps1](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\test-unit-contact-backend-startup.ps1)
- Remove:
  [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\uninstall-unit-contact-backend-startup.ps1](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\uninstall-unit-contact-backend-startup.ps1)

## Files

- Service host:
  [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\campus-backend\service-host.cjs](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\campus-backend\service-host.cjs)
- Runtime sample:
  [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\campus-backend\runtime.sample.json](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\m365\campus-backend\runtime.sample.json)
- Install script:
  [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\install-unit-contact-backend-service.ps1](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\install-unit-contact-backend-service.ps1)
- Restart script:
  [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\restart-unit-contact-backend-service.ps1](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\restart-unit-contact-backend-service.ps1)
- Health script:
  [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\test-unit-contact-backend-service.ps1](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\test-unit-contact-backend-service.ps1)
- Uninstall script:
  [C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\uninstall-unit-contact-backend-service.ps1](C:\Users\MOECISH\Desktop\ai-isms\ISMS-Form-Redesign\scripts\uninstall-unit-contact-backend-service.ps1)

## Install

1. Copy `runtime.sample.json` to `runtime.local.json`
2. Fill real values
3. Open elevated PowerShell
4. Run:

```powershell
$cred = Get-Credential
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-unit-contact-backend-service.ps1 -ServiceCredential $cred -StartNow
```

## Check

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-unit-contact-backend-service.ps1
```

## Restart

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\restart-unit-contact-backend-service.ps1
```

## Remove

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\uninstall-unit-contact-backend-service.ps1
```

## Logs

The service host writes to:

- `logDir` from `runtime.local.json`

Default sample value:

- `C:\ProgramData\ISMSFormRedesign\logs`
