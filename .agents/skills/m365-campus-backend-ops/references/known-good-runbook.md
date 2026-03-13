# Known-good Runbook

## Infrastructure

- Windows host
- VirtualBox guest: Ubuntu Server 24.04
- Guest repo: `/srv/isms-form-redesign`
- Guest backend: Node service on `8787`
- Guest reverse proxy: Caddy on `80`
- Host campus entry: `8088`
- Public campus test URL: `http://140.112.3.65:8088/`

## Services and files

- systemd:
  - `isms-unit-contact-backend.service`
- runtime:
  - `/srv/isms-form-redesign/m365/campus-backend/runtime.local.json`
- frontend runtime override:
  - `/srv/isms-form-redesign/m365-config.override.js`

## Host gateway behavior

- Windows host gateway is the place where campus IP restriction is enforced.
- Current allowlist pattern is campus-only, not general LAN.
- If the guest bridged IP is unstable, keep using:
  - `host IP:8088 -> VirtualBox/NAT -> guest Caddy/backend`

## SharePoint provisioning pattern learned from real execution

### What worked

- Reading site and existing lists through delegated CLI token
- Browser-session provisioning for lists using SharePoint REST
- Browser-session provisioning is the reliable fallback when Graph create operations are blocked

### What failed in this tenant

- `Graph POST /lists` can still return `403 accessDenied` even after site read access works
- Attachment document-library creation can also be blocked by delegated Graph create permissions
- Therefore, list/library provisioning must support a browser-session fallback

## Git deployment pattern

Guest pull can intermittently fail with:

```text
gnutls_handshake() failed: Handshake failed
```

Use:

```bash
git config --global http.version HTTP/1.1
```

then retry:

```bash
git -C /srv/isms-form-redesign pull --ff-only origin main
```

## Health checks

Critical:

- `/api/unit-contact/health`
- `/api/corrective-actions/health`
- `/api/checklists/health`
- `/api/training/health`
- `/api/system-users/health`
- `/api/auth/health`

Optional until library exists:

- `/api/attachments/health`

## Current backendized modules

- unit contact
- corrective actions
- checklists
- training
- system users
- auth
- attachments skeleton

## Current attachment rule

- frontend attachment support for backend mode is in code
- live should not switch to `attachmentsMode = m365-api` until:
  - `ISMSAttachments` exists
  - attachment health reports `ready: true`

## Migration rule

If browser migration reports all zeros, it means the browser profile used for migration was not the real source of old local data.
