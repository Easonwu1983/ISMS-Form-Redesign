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
- Keeps persistence concerns out of feature and shell modules

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

## What Still Lives In [app.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/app.js)

- Shared constants and enums
- Authentication state helpers
- Permission and unit-scope rules
- Shared UI helpers such as `toast`, icon refresh, copy helpers, unit cascade helpers
- Module factories and route whitelist
- Application bootstrap

## Why This Split Helps

- Feature work can stay local to one module instead of touching the whole app
- Regression tests can target smaller surfaces with less selector drift
- Future migration from `innerHTML` to componentized rendering becomes incremental
- NotebookLM context capture is easier because module boundaries are clearer

## Recommended Next Refactors

1. Add a schema version and migration dispatcher for every persisted store in [data-module.js](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/data-module.js).
2. Replace high-churn inline `onclick` actions with `data-action` event delegation.
3. Move auth/session bootstrap into a dedicated auth module.
4. Clean up documentation files that still show encoding corruption in some terminals.
