# Cloudflare Pages + Named Tunnel Runbook

Use this path when you want a public HTTPS frontend quickly without opening campus inbound `80/443`.

## Topology

- Frontend: Cloudflare Pages
- Backend: current campus backend through Cloudflare Named Tunnel
- Data: PostgreSQL（VM 本機）

## Why this path

- No inbound firewall opening is required for the backend host.
- Frontend gets HTTPS by default.
- Backend gets an HTTPS hostname through the tunnel.

## Prerequisites

1. A Cloudflare account
2. A domain managed in Cloudflare DNS
3. This workstation can run:
   - `cloudflared`
   - `npx wrangler`

## Step 1. Authenticate Cloudflare tooling

For tunnel:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-cloudflare-named-tunnel.ps1 -Hostname api-isms.example.com
```

If this is the first run, `cloudflared tunnel login` opens a browser. After login it will:

- create the named tunnel if needed
- create `infra/cloudflare/cloudflared-config.generated.yml`
- route DNS for the hostname

For Pages:

```powershell
cmd /c npx wrangler login
```

## Step 2A. Preferred: start a named tunnel

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-cloudflare-named-tunnel.ps1
```

Verify:

```text
https://api-isms.example.com/api/auth/health
```

## Step 3. Deploy the frontend to Cloudflare Pages

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-cloudflare-pages.ps1 -BackendBase https://api-isms.example.com -ProjectName isms-portal
```

This script:

1. builds `dist/cloudflare-pages`
2. rewrites `m365-config.override.js` to your tunnel hostname
3. deploys to Cloudflare Pages with Wrangler

## Step 4. Publish the full-proxy Pages frontend

Use the Pages HTTPS URL for internal testing after verifying:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-cloudflare-pages.ps1 -BackendBase https://YOUR-TUNNEL.trycloudflare.com -ProjectName isms-campus-portal -Mode full-proxy
```

This keeps users on the stable `pages.dev` URL and proxies `/api/*` through Pages to the current tunnel.

## Step 5. One-step reboot recovery

If the workstation reboots or the quick tunnel URL changes, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\bootstrap-cloudflare-pages-live.ps1 -ProjectName isms-campus-portal
```

This will:

1. start the quick tunnel if needed
2. read the current `trycloudflare.com` URL
3. republish Pages in `full-proxy` mode against that URL

## Step 5B. Health check and self-heal

To verify Pages + tunnel health without opening a browser:

```powershell
node .\scripts\cloudflare-live-health-check.cjs
```

To auto-heal Pages if the quick tunnel URL changed or the proxy drifted:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ensure-cloudflare-pages-live.ps1 -ProjectName isms-campus-portal
```

This will:

1. run the Cloudflare Pages health check
2. if unhealthy, rerun the bootstrap flow
3. rerun the health check and stop only when green

## Step 6. Switch users to the Cloudflare Pages URL

Use the Pages HTTPS URL for internal testing after verifying:

- login
- unit-contact submission/status lookup
- corrective action flow
- checklist flow
- training flow
- attachment upload

## Notes

- For large-scale internal UAT, use a Named Tunnel, not a Quick Tunnel.
- Cloudflare Access can be added later, but do not treat the free Access tier as the long-term answer for broad campus testing.

## Step 2B. Temporary fallback: quick tunnel

If the Cloudflare account does not currently control a zone for `route dns`, use a quick tunnel first:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-cloudflare-quick-tunnel.ps1
```

This will print a `https://...trycloudflare.com` backend URL. Use that URL as `-BackendBase` when deploying Pages.

If the campus network drops QUIC/UDP, the script already defaults to `http2`, which keeps the tunnel on TCP 443.

When you stop for the day:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-cloudflare-quick-tunnel.ps1
```

Quick tunnel is good enough to start moving, but it is not the long-term endpoint for large-scale internal UAT because the hostname is temporary.

When the quick tunnel hostname changes, republish the Pages site with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\refresh-cloudflare-quick-pages-entry.ps1
```
