# isms-campus-portal.pages.dev Security Remediation

Source report:
- [isms-campus-portal.pages.dev 安全報告.pdf](C:\Users\User\Desktop\isms-campus-portal.pages.dev%20%E5%AE%89%E5%85%A8%E5%A0%B1%E5%91%8A.pdf)

This note records which findings were fixed in the repository and which findings remain platform-bound.

## Fixed in repository

### COEP / COOP / CORP

The report flagged missing or unsafe cross-origin isolation headers on the main entry page and on `deploy-manifest.json`.

Implemented headers:
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`

Applied to:
- [index.html](C:\Users\User\Playground\ISMS-Form-Redesign\index.html)
- [host-campus-gateway.cjs](C:\Users\User\Playground\ISMS-Form-Redesign\host-campus-gateway.cjs)
- [scripts/build-cloudflare-pages-package.cjs](C:\Users\User\Playground\ISMS-Form-Redesign\scripts\build-cloudflare-pages-package.cjs)
- [scripts/build-homepage-ntu-package.cjs](C:\Users\User\Playground\ISMS-Form-Redesign\scripts\build-homepage-ntu-package.cjs)
- [scripts/build-azure-static-package.cjs](C:\Users\User\Playground\ISMS-Form-Redesign\scripts/build-azure-static-package.cjs)
- [scripts/build-google-firebase-package.cjs](C:\Users\User\Playground\ISMS-Form-Redesign\scripts/build-google-firebase-package.cjs)

Verified response headers:
- `http://127.0.0.1:8088/`
- `https://isms-campus-portal.pages.dev/`
- `https://isms-campus-portal.pages.dev/deploy-manifest.json`

## Platform-bound residual risk

### SHA-1 / TLS cipher finding

The report also flags a `SHA-1`-related TLS/cipher finding for:
- `https://isms-campus-portal.pages.dev/deploy-manifest.json`

This is not a repo-level bug. It is a Cloudflare Pages edge/platform TLS capability issue. Cloudflare Pages hostnames do not provide the same TLS tuning controls as a custom zone, and the current `pages.dev` hostname cannot be remediated further from this repository.

Cloudflare reference points:
- Minimum TLS version is controlled at the zone/custom-domain level, not on `pages.dev`
- Cipher-suite restrictions are likewise zone-level controls

## Recommended next step

If the SHA-1 finding must be removed from the security report, migrate the public entry from `pages.dev` to a custom domain that you control, then set the zone's TLS policy there.

Until then, treat the SHA-1 item as accepted residual risk from the hosting platform, not a code defect.
