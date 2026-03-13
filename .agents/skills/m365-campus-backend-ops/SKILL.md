---
name: m365-campus-backend-ops
description: Use this skill when working on the ISMS M365 campus backend deployment, including VirtualBox Ubuntu guest operations, SharePoint list and library provisioning, campus host gateway, systemd and Caddy service management, browser-session provisioning fallbacks, live smoke verification, and migration between browser-local storage and M365.
---

# M365 Campus Backend Ops

Use this skill for this repo when the task touches any of these areas:

- `M365 / SharePoint` backend integration
- `Ubuntu VM` deployment under `VirtualBox`
- `systemd + Caddy` backend hosting
- Windows host `8088` campus gateway
- SharePoint list or document-library provisioning
- live smoke checks against `127.0.0.1:8088` or `140.112.3.65:8088`
- browser-local data migration into M365

## Known-good topology

Read [references/known-good-runbook.md](references/known-good-runbook.md) before changing deployment or provisioning behavior.

Key current topology:

- Windows host exposes campus entry on `http://140.112.3.65:8088/`
- Ubuntu guest backend runs from `/srv/isms-form-redesign`
- backend service: `isms-unit-contact-backend.service`
- guest backend port: `8787`
- host gateway restricts access to campus IP ranges

## Default workflow

1. Check repo cleanliness first.
2. Validate changed JS with `node --check`.
3. If live is involved, run `node scripts/campus-live-regression-smoke.cjs`.
4. Push to GitHub before guest deployment.
5. Deploy to guest with:
   - `sudo -u ismsbackend git -C /srv/isms-form-redesign pull --ff-only origin main`
   - restart `isms-unit-contact-backend.service` if backend code or runtime changed
6. Re-run live smoke after deployment.

## Guest deployment rules

- Guest SSH:
  - host `127.0.0.1`
  - port `2222`
- Repo path:
  - `/srv/isms-form-redesign`
- Runtime file:
  - `/srv/isms-form-redesign/m365/campus-backend/runtime.local.json`
- Frontend override:
  - `/srv/isms-form-redesign/m365-config.override.js`

If guest `git pull` fails with `gnutls_handshake() failed`, apply:

```bash
git config --global http.version HTTP/1.1
```

and retry the pull.

## Provisioning strategy

### Prefer backend provision scripts first

Use these when delegated Graph permissions are enough:

- `scripts/m365-a3-corrective-action-provision.cjs`
- `scripts/m365-a3-checklist-provision.cjs`
- `scripts/m365-a3-training-provision.cjs`
- `scripts/m365-a3-attachment-provision.cjs`

### Browser-session fallback

If Graph create calls return `403 accessDenied`, use browser-session provisioning on the signed-in SharePoint page:

- lists: `scripts/sharepoint-browser-provision.js`
- attachment library: `scripts/sharepoint-browser-attachment-provision.js`

The current tenant has already shown this pattern in real usage. Do not assume Graph create access just because read access works.

## Verification endpoints

Use these health checks after deployment:

- `/api/unit-contact/health`
- `/api/corrective-actions/health`
- `/api/checklists/health`
- `/api/training/health`
- `/api/system-users/health`
- `/api/auth/health`
- `/api/attachments/health`

Current expectation:

- all core modules should be `ready: true`
- `attachments` can remain `ready: false` until `ISMSAttachments` exists

## Migration rules

- Browser-local migration script:
  - `scripts/browser-m365-live-migration.js`
- Only run it in the browser profile that actually contains the old `localStorage` data.
- If migration report shows all totals `0`, that browser profile is not the real source.

## Attachments rules

- Do not force live `attachmentsMode = m365-api` until `ISMSAttachments` is provisioned and `/api/attachments/health` is `ready: true`.
- Before that point, keep attachment flows in local mode to avoid storing broken remote references.
- Once the library is ready, switch the override to:
  - `attachmentsMode: 'm365-api'`
  - `attachmentsEndpoint: '/api/attachments'`
  - `attachmentsHealthEndpoint: '/api/attachments/health'`

## When to read extra files

- Deployment details: [references/known-good-runbook.md](references/known-good-runbook.md)
- Full project runtime flow: [`/docs/project-execution-flow.md`](/C:/Users/User/Playground/ISMS-Form-Redesign/docs/project-execution-flow.md)
- Campus smoke script: [`/scripts/campus-live-regression-smoke.cjs`](/C:/Users/User/Playground/ISMS-Form-Redesign/scripts/campus-live-regression-smoke.cjs)

## Output expectations

When using this skill, report:

1. what changed locally
2. what was pushed to GitHub
3. what was deployed to guest/live
4. which health checks passed
5. what is still blocked by SharePoint permissions or browser-session requirements
