# Module Architecture

- Updated: 2026-03-11
- Goal: keep `app.js` as the application kernel and move feature UI into focused modules

## Current Module Split

### [shell-module.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/shell-module.js)

- Owns login screen rendering
- Owns app shell rendering (`sidebar`, `header`, `main-content`)
- Owns route dispatch entrypoint via `handleRoute()`
- Owns mobile sidebar state and global shell handlers

### [data-module.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/data-module.js)

- Owns `localStorage` store access and cache
- Owns data normalization for users, corrective actions, checklists, and training forms
- Owns CRUD for correction data, checklist data, training data, unit review store, and login logs
- Owns store schema versioning and migration dispatch for persisted data
- Owns schema health diagnostics used by the admin health panel
- Keeps persistence concerns out of feature and shell modules

### [auth-module.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/auth-module.js)

- Owns session storage reads and writes for authenticated user state
- Owns login, logout, password reset helper, and current user hydration
- Owns scoped unit switching for multi-unit users
- Owns admin bootstrap repair for the primary administrator profile

### [unit-module.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/unit-module.js)

- Owns official unit catalog access and metadata lookup
- Owns custom-unit governance, approval registry, and merge flow
- Owns unit category classification and searchable cascade selector behavior
- Keeps unit-specific rules and autocomplete logic out of `app.js`

### [ui-module.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/ui-module.js)

- Owns shared formatting helpers such as `fmt`, `fmtTime`, and icon rendering
- Owns reusable UI helpers such as `toast`, copy-id interactions, test-id helpers, and checkbox/radio builders
- Owns icon refresh bootstrap for Lucide

### [policy-module.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/policy-module.js)

- Owns role and permission policy helpers
- Owns record visibility and editability rules for corrective actions, checklists, and training forms
- Owns training undo-window and manual-row deletion policy
- Keeps access-control decisions centralized instead of scattered across features

### [workflow-support-module.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/workflow-support-module.js)

- Owns shared record-number builders for corrective actions, checklists, and training forms
- Owns training export, print, and roster-import parsing helpers
- Owns seeded demo corrective-action bootstrap data
- Keeps workflow support logic out of `app.js` and feature modules

### [case-module.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/case-module.js)

- Corrective action dashboard
- Corrective action list
- Create / detail / respond / tracking flows

### [checklist-module.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/checklist-module.js)

- Checklist list, fill, detail, manage
- Checklist question template editing

### [training-module.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/training-module.js)

- Training dashboard
- Training fill and detail flows
- Training roster import / export / print support

### [admin-module.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/admin-module.js)

- User management
- Unit review
- Login log
- Schema health panel for admin diagnostics and migration repair

## What Still Lives In [app.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/app.js)

- Shared constants and enums
- Store/module factories and dependency wiring
- Module factories and route whitelist
- Application bootstrap
- A smaller set of cross-feature utility functions that are still shared by multiple modules

## Why This Split Helps

- Feature work can stay local to one module instead of touching the whole app
- Regression tests can target smaller surfaces with less selector drift
- Future migration from `innerHTML` to componentized rendering becomes incremental
- NotebookLM context capture is easier because module boundaries are clearer

## Interaction Contract

- Shared click handling now lives in [app.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/app.js) via `installGlobalDelegation()`
- Feature modules register handlers through `registerActionHandlers(namespace, handlers)`
- Rendered UI should prefer `data-action`, `data-route`, and `data-dismiss-modal` instead of inline `onclick`
- This keeps module code testable and prevents `window._legacyHandler` globals from spreading again

## Current Cleanup Checklist

1. Split feature UI into dedicated `case / checklist / training / admin / shell` modules.
2. Split persistence and migration into `data-module.js`.
3. Split auth/session bootstrap into `auth-module.js`.
4. Split unit catalog, autocomplete, and custom-unit governance into `unit-module.js`.
5. Split permission and visibility rules into `policy-module.js`.
6. Split shared formatting and copy/test helpers into `ui-module.js`.
7. Split record numbering, training export/import/print helpers, and seed bootstrap into `workflow-support-module.js`.
8. Replace most route-facing feature dependencies in `app.js` with thin delegates.

## Recommended Next Refactors

1. Continue converting long feature-specific `innerHTML` sections into smaller render partials.
2. Clean up a few docs/pages that still display mojibake in some terminals due legacy encoding.
3. Consider exporting schema diagnostics for offline support bundles if operational troubleshooting grows.
