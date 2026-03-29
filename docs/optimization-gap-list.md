# Optimization Gap List

Updated: 2026-03-29

This checklist tracks the optimization report against the current repo state. Status values:

- `done`: implemented and verified
- `partial`: some work landed, but the gap is still open
- `open`: not meaningfully started

## 1. Load Performance

Status: `partial`

Done:
- `app.js` has been split across runtime, route, auth, shell, page orchestration, feature, bridge, and bootstrap helper modules.
- `vendor/xlsx.full.min.js` no longer loads on first paint. It is loaded on demand through the runtime asset loader.
- `vendor/lucide.min.js` no longer loads from `asset-loader.js`. Icons are hydrated on demand through the runtime asset loader.
- `admin-module.js`, `training-module.js`, `checklist-module.js`, `case-module.js`, `attachment-module.js`, and `workflow-support-module.js` no longer load on first paint. They are route- or feature-loaded.
- Static package builds now minify copied JS and CSS assets.
- Several heavy visual smoke paths were reduced by switching to focused synthetic captures.

Open:
- `asset-loader.js` still synchronously loads about 50 JS files before the app is fully ready.
- There is still no bundler-driven tree shaking or true chunk graph; lazy loading is implemented through the runtime asset loader.
- `policy-module.js`, `m365-api-client.js`, and several runtime bridge modules still remain on the initial path.

Next:
- Keep shrinking the synchronous core set.
- Evaluate a safe bundler migration after the remaining runtime bridges are extracted.
- Move from script-by-script lazy loading to real bundled chunks only after the runtime surface is stable.

## 2. CSS Optimization

Status: `partial`

Done:
- A small a11y utility layer was added, including `.sr-only`.
- Static package builds now minify CSS assets.

Open:
- `styles.css` is still large and monolithic.
- No PurgeCSS or safelist-driven removal is in place.
- Inline styles still exist inside module `innerHTML` templates.

Next:
- Extract repeated inline styles into CSS classes.
- Build a PurgeCSS safelist after the templates are stable.

## 3. API Layer

Status: `partial`

Done:
- `m365-api-client.js` now has GET request deduplication.
- TTL response caching and bounded client-side cache eviction were added.
- Retry logic now uses exponential backoff with jitter.
- Error classification now distinguishes timeout, auth, validation, rate-limit, server, and network failures.

Open:
- Formal release reports still do not show full module-level cache hit and miss rates.
- `training-forms`, `checklists`, and `audit-trail` summary warm paths still need more consistent wins over cold paths.
- Backend summary-only routes are still not fully isolated from list-oriented execution paths in every module.

Next:
- Add backend-side cache telemetry per module.
- Keep shrinking pure `summaryOnly` paths.
- Surface cache hit, miss, and snapshot reasons directly in the release report.

## 4. Accessibility

Status: `partial`

Done:
- `shell-module.js` now includes core shell a11y improvements such as `role="main"`, `aria-live`, and clearer labels.
- `ui-module.js` now has modal focus trap and focus return handling.
- Dialogs now expose `aria-describedby` for confirm and prompt flows.
- First-pass table semantics were added for admin, training, case, and checklist tables using captions and `scope="col"`.
- `scripts/security-regression.cjs` now checks that key admin/training/checklist/case tables expose captions and scoped headers.

Open:
- Many `innerHTML` templates still lack ARIA metadata.
- Keyboard navigation is not systematically tested across key workflows.
- There is no dedicated a11y smoke layer using axe or equivalent tooling.

Next:
- Finish table semantics and labels on `dashboard`, `users`, `unit-contact-review`, `training`, and `checklists`.
- Add keyboard coverage for modal close, filter bars, and main tables.
- Add a focused a11y smoke pass for the formal chain.

## 5. Memory and Runtime Stability

Status: `partial`

Done:
- Pager handling now uses root-level delegation instead of one listener per button.
- A page-runtime teardown path now exists and can scope event listeners to the current page lifetime.
- Client collection caches now have TTL and bounded eviction behavior.
- `data-module.js` access-profile caches and parsed storage cache now use bounded stores instead of unbounded raw maps.
- `training`, `checklist`, and `case` now use page-scoped listener registration for their main list and form flows.

Open:
- Many modules still attach listeners directly without page-scoped cleanup.
- There is still no complete page destroy lifecycle across all major routes.
- Large tables still render full DOM payloads instead of using virtualization.

Next:
- Convert admin, training, checklist, and case listeners to page-scoped registration.
- Add a consistent destroy hook for route transitions.
- Evaluate virtualization for `audit-trail`, `training roster`, and other large tables.

## Priority Order

1. Load performance: lazy loading and route splitting
2. Memory/runtime stability: page teardown and listener cleanup
3. API layer: stronger cache telemetry and pure summary paths
4. Accessibility: complete key workflow semantics and keyboard support
5. CSS: minify, extract inline styles, then purge safely
