# Optimization Gap List

Updated: 2026-03-31

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
- `admin-module.js`, `training-module.js`, `checklist-module.js`, `case-module.js`, `attachment-module.js`, and several bridge/runtime modules no longer load on first paint. They are route- or feature-loaded.
- A generated `app-core.bundle.min.js` now collapses the legacy 49-script core chain into a single minified browser bundle.
- Generated `feature-bundles/*.js` ESM entry bundles now back the admin, case, checklist, training, and public unit-contact lazy routes, with shared chunks emitted under `feature-bundles/chunks/`.
- Live and static package builds now use minified CSS through `styles.min.css`.
- Live and static package builds now prefer `styles.purged.min.css`, with fallback to `styles.min.css` and then raw `styles.css`.
- Static package builds now minify copied JS and CSS assets.
- Several heavy visual smoke paths were reduced by switching to focused synthetic captures.

Open:
- `asset-loader.js` still uses a script-loader bootstrap for the synchronous core path.
- `workflow-support-module.js`, `policy-module.js`, `m365-api-client.js`, and several runtime bridge modules still remain on the initial path because startup normalization depends on them.
- Pages/browser hot spots still remain on:
  - `visual:desktop:dashboard`
  - `visual:desktop:unit-review`
  - `checklist:list-loaded`
  - `visual:public-desktop:unit-contact-apply`
  - `unit-admin:login`

Next:
- Keep shrinking the synchronous core set.
- Evaluate a safe bundler migration after the remaining runtime bridges are extracted.
- Move from script-by-script lazy loading to real bundled chunks only after the runtime surface is stable.

## 2. CSS Optimization

Status: `partial`

Done:
- A small a11y utility layer was added, including `.sr-only`.
- A dedicated `styles.critical.min.css` now covers the login, public shell, and authenticated shell skeleton before the deferred stylesheet chain lands.
- Live and static package builds now load minified CSS assets through `styles.min.css`.
- Static package builds now minify CSS assets.
- A PurgeCSS safelist build now emits `styles.purged.min.css` and the live asset loader prefers it by default.
- Repeated inline styles from `admin`, `training`, and `checklist` flows have started moving into shared utility classes in `styles.css`.
- Shared utility classes now cover common empty-state padding, checklist applicable-rate emphasis, checklist item ID flex behavior, and compact subtitle spacing instead of repeating those inline styles inside templates.
- `case-module.js` now uses shared utility classes for its static card spacing, textarea sizing, detail links, muted text, and track-form visibility states instead of fixed inline styles.
- `training-module.js` now uses shared column-width classes for the training editor roster header instead of embedding static `width` and `min-width` inline styles in the table template.
- The live stylesheet now includes a dedicated `@media print` ruleset for public and authenticated layouts.

Open:
- `styles.css` is still large and monolithic.
- Inline styles still exist inside module `innerHTML` templates, but the tracked source total is down to roughly 40 static/dynamic `style="..."` occurrences.

Next:
- Extract repeated inline styles into CSS classes.
- Keep shrinking the live stylesheet after the critical/deferred split.

## 3. API Layer

Status: `partial`

Done:
- `m365-api-client.js` now has GET request deduplication.
- TTL response caching and bounded client-side cache eviction were added.
- Retry logic now uses exponential backoff with jitter.
- Error classification now distinguishes timeout, auth, validation, rate-limit, server, and network failures.
- `apps-script/src/SheetRepo.gs` now reuses request-scoped row caches, so repeated reads of the same sheet inside one API request no longer trigger repeated full-sheet scans.
- `apps-script/src/Config.gs` now resolves config through a request-scoped map backed by Script Cache, instead of re-reading the config sheet for every lookup.
- `apps-script/src/Auth.gs` now builds request-scoped user and login-session indexes, so `findUserById_/Username_/Email_` and session token validation no longer scan the full sheet repeatedly inside one request.
- `apps-script/src/Auth.gs`, `apps-script/src/Main.gs`, and `apps-script/src/Security.gs` no longer swallow operational write failures silently; they now record internal errors to `ScriptProperties` and `console.error`.
- Unit-admin review-scope authorization now uses a short-lived backend cache in `request-authz.cjs`, and `/api/review-scopes` no longer scans the SharePoint list twice for scoped users.
- The latest formal production report now shows module-level summary cache status for:
  - `audit-trail`
  - `checklists`
  - `training-forms`
- The current formal report shows all three `summaryOnly` warm paths as improved over cold.

Open:
- Formal release reports still do not show full cache hit and miss rates for every backend module; coverage is still focused on the main summary routes.
- Backend summary-only routes are still not fully isolated from list-oriented execution paths in every module.
- Apps Script login rate limiting still lives only in `CacheService`; it is still volatile across cache resets and has no durable fallback record.
- Low-frequency Apps Script paths such as notification alias lookup and malformed historical JSON rows now log internal errors, but there is still no dedicated error sheet or alerting channel.

Next:
- Add backend-side cache telemetry per module.
- Keep shrinking pure `summaryOnly` paths.
- Surface cache hit, miss, and snapshot reasons directly in the release report.
- Add a durable fallback for Apps Script login rate limits and internal error reporting if the Apps Script backend remains part of the supported stack.

## 4. Accessibility

Status: `partial`

Done:
- `shell-module.js` now includes core shell a11y improvements such as `role="main"`, `aria-live`, and clearer labels.
- `ui-module.js` now has modal focus trap and focus return handling.
- Toast containers and toast items now expose explicit live-region semantics.
- Dialogs now expose `aria-describedby` for confirm and prompt flows.
- First-pass table semantics were added for admin, training, case, and checklist tables using captions and `scope="col"`.
- `scripts/security-regression.cjs` now checks that key admin/training/checklist/case tables expose captions and scoped headers.
- `scripts/accessibility-regression.cjs` now provides a dedicated formal a11y smoke pass for shell landmarks, modal keyboard behavior, and table semantics.
- `scripts/accessibility-axe-regression.cjs` now adds an axe-based formal a11y smoke pass for login, dashboard, public apply, and public status pages.
- `unit-contact-application-module.js` now exposes accessible names for public apply search/listbox/file-input flows and avoids nested complementary landmarks on the public pages.
- Public apply and public status forms now expose `aria-invalid`, `aria-errormessage`, and screen-reader-visible feedback regions for validation failures.
- `unit-module.js` now assigns explicit accessible names to unit cascade search and select controls.

Open:
- Many `innerHTML` templates still lack ARIA metadata.
- Keyboard navigation is not systematically tested across key workflows.
- There is still no full `axe-core` coverage across every authenticated route; the current axe smoke focuses on shell and public workflows.

Next:
- Finish table semantics and labels on `dashboard`, `users`, `unit-contact-review`, `training`, and `checklists`.
- Add keyboard coverage for modal close, filter bars, and main tables.
- Expand the focused axe smoke to more authenticated routes once their page shells are fully stable.

## 5. Memory and Runtime Stability

Status: `partial`

Done:
- Pager handling now uses root-level delegation instead of one listener per button.
- A page-runtime teardown path now exists and can scope event listeners to the current page lifetime.
- Client collection caches now have TTL and bounded eviction behavior.
- `data-module.js` access-profile caches and parsed storage cache now use bounded stores instead of unbounded raw maps.
- `training`, `checklist`, and `case` now use page-scoped listener registration for their main list and form flows.
- `training` detail, `checklist` template modal, and `case` respond/track upload flows now use page-scoped listeners instead of raw direct bindings.
- `training`, `checklist`, and `audit-trail` remote page caches now use bounded stores instead of raw unbounded page maps.
- `admin-module.js` pager controls, governance cards, horizontal review scrollers, and unit-chip picker interactions now use page-scoped listener registration.
- `unit-contact-application-module.js` now uses page-scoped listener registration for public apply and status flows.
- `training-module.js` now window-renders the fill table for large rosters instead of painting the entire row set into the DOM at once.
- `admin-module.js` virtualizes both the `audit-trail` table and the `system-users` table instead of painting their full row sets into the DOM at once.
- `admin-module.js` now virtualizes the `unit-contact-review` table instead of painting the full review queue into the DOM at once.
- `admin-module.js` now virtualizes the `login-log` table and tears down its scroll/resize listeners on route cleanup.
- `admin-module.js` now renders the audit-trail filter shell immediately and lets the full audit payload continue loading in the background, instead of blocking the whole route on the first remote response.
- `training-module.js` now window-renders large `training roster` group lists instead of expanding every group body into the DOM at once.
- Debounced search and highlight timers in `training`, `checklist`, and `case` now register page cleanup handlers so route transitions clear pending timers.
- `unit-contact-review`, `unit-review`, and `security-window` now invalidate stale async renders on route teardown and reuse the same page-scoped review loading/empty-state classes.
- `unit-module.js` now owns a cleanup-aware unit cascade lifecycle so route teardown can dispose the custom search/input listeners instead of leaking them across renders.

Open:
- Some modules still attach listeners directly without page-scoped cleanup.
- There is still no complete page destroy lifecycle across every major route.
- Large read-heavy tables outside `audit-trail`, `system-users`, and `training roster` still render full DOM payloads instead of using virtualization.

Current high-value next steps:

- Finish route cleanup on the remaining admin and checklist branches.
- Keep shrinking `checklist:list-loaded`, which is still a browser-layer hot spot even after the smoke flake work.
- Expand virtualization only where the formal report still shows heavy DOM cost.

Next:
- Finish converting the remaining direct route listeners to page-scoped registration.
- Add a consistent destroy hook across the remaining route transitions.
- Evaluate virtualization for other large read-heavy tables after `audit-trail`, `system-users`, and `training roster`.

## 6. Production Logging Hygiene

Status: `done`

Done:
- Tracked source modules now use the buffered runtime logger helpers (`window.__ismsLog`, `window.__ismsWarn`, `window.__ismsError`) instead of direct production `console.log/warn/error` calls.
- Browser console mirroring is now limited to local debug contexts or explicit debug flags, while production keeps the messages buffered in memory.

Open:
- Temporary probe scripts in the repo root still use direct `console.*`, but they are not part of the deployed formal chain.

## Priority Order

1. Load performance: `dashboard`, `unit-review`, `checklist:list-loaded`, public apply
2. Memory/runtime stability: page teardown and listener cleanup
3. API layer: stronger cache telemetry and pure summary paths
4. CSS: keep extracting inline styles from `admin`, `training`, and `checklist`
5. Accessibility: expand authenticated-route coverage beyond the current shell/public focus
