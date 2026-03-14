# Reusable M365 + Cloudflare Project Bootstrap

Use this playbook when a new internal system needs the same delivery path:

- frontend on Cloudflare Pages
- backend on an on-prem host
- M365 / SharePoint as the data layer
- Cloudflare Tunnel as the HTTPS bridge

This document is based on what actually failed and what actually worked in this repo.

## 1. Decide the architecture first

Do not start from static hosting alone. Fix the target topology before touching deployment:

```text
Cloudflare Pages (HTTPS frontend)
  -> Cloudflare Tunnel (HTTPS backend hostname)
    -> on-prem backend service
      -> M365 / SharePoint
```

If the system needs:

- login
- role authorization
- audit trail
- M365 writes
- attachment upload

then those parts must stay in the backend.

## 2. Keep deployment modes explicit

Every project should expose runtime profiles for:

1. `localDemo`
2. `campus/live backend`
3. `cloudflare pages + tunnel`

Do not hardcode URLs inside feature modules. Centralize them in:

- `m365-config.js`
- runtime override files
- build scripts

## 3. Backendize early

Do not let business truth stay in browser storage longer than necessary.

Move these first:

1. auth
2. system users
3. role/review scopes
4. main business forms
5. attachments
6. audit trail

Local fallback is acceptable only during transition. In live mode, use strict remote mode and fail loudly.

## 4. SharePoint provisioning strategy

### What worked

- read existing site/lists through delegated CLI token
- use backend provision scripts when the tenant allows Graph create
- use browser-session SharePoint REST fallback when Graph create is blocked

### What failed

- `Graph POST /lists` returned `403 accessDenied` even when read access worked
- document library creation could fail for the same reason

### Rule

Every M365 project should support both:

1. backend provision script
2. browser-session provision fallback

Do not assume Graph write permissions just because Graph read works.

## 5. Guest deployment rules

If the backend runs in an Ubuntu guest:

- repo path: `/srv/<project>`
- runtime file lives outside Git assumptions
- service user should own the runtime path

### What failed

1. `fatal: detected dubious ownership`
2. `cannot open '.git/FETCH_HEAD': Permission denied`
3. `gnutls_handshake() failed`

### What worked

```bash
git config --global --add safe.directory /srv/<project>
sudo -u <service-user> git config --global http.version HTTP/1.1
sudo -u <service-user> git -C /srv/<project> pull --ff-only origin main
sudo systemctl restart <service-name>
```

Rule: if the repo is owned by the service user, pull as that user.

## 6. Cloudflare Tunnel strategy

### What worked fast

- Cloudflare Pages for the fixed public URL
- Quick Tunnel for immediate HTTPS backend exposure
- Pages `full-proxy` mode so users stay on one stable Pages URL

### What did not scale

- relying on a raw Quick Tunnel hostname in user-facing links
- assuming Named Tunnel would be available without a Cloudflare zone

### Rule

Use:

1. Quick Tunnel to get moving
2. Pages full-proxy to hide tunnel churn
3. Named Tunnel only after a real Cloudflare zone exists

## 7. Health and recovery must be scripted

Do not rely on manual browser checking.

Each project should have:

1. live health check script
2. Pages/Tunnel health check script
3. one-step bootstrap recovery script
4. smoke test script

Minimum checks:

- homepage responds
- auth health responds
- core module health responds
- login succeeds
- protected API denies anonymous access

## 8. Audit trail should not stop at storage

Recording audit entries is not enough. Add a management page that can:

- filter by keyword/event type/actor/unit/record id
- inspect field diffs
- inspect snapshots/deleted state/request payload
- export the visible result set

Without a query surface, audit data exists but is operationally weak.

## 9. Common mistakes to avoid

1. Putting all logic in the frontend
2. Treating Homepage redirect as the final solution
3. Assuming public HTTPS can be solved by changing the client network
4. Assuming Azure/GCP credentials imply deployable subscriptions or projects
5. Assuming SharePoint create permissions because read works
6. Pulling the guest repo as the wrong user
7. Shipping live fallback-to-local behavior silently

## 10. Standard cutover order

For future projects, follow this order:

1. finalize runtime profiles
2. backendize auth + authorization
3. backendize business data
4. provision SharePoint lists/libraries
5. deploy backend to on-prem/guest
6. add health checks
7. publish Cloudflare Pages full-proxy
8. run live smoke
9. enable internal UAT
10. only then optimize UI and exports

## 11. Definition of ready

A project is ready for broad internal UAT only when:

- backend health is green
- auth is backend-enforced
- audit trail is queryable
- attachments work remotely
- Cloudflare Pages full-proxy is live
- recovery is scripted
- live smoke passes end to end
