# QA Regression Guide

- Updated: 2026-03-08
- Scope: `C:/AI/ISMS-Form-Redesign`
- Runtime: static preview + Playwright layered tests

## Goal

This project uses four regression layers so route permissions, focused business flow, broad role flow, and end-to-end submission behavior can be verified separately.

## Test Layers

### 1. Route Permission Matrix

- Command: `npm run test:role:permission`
- Script: [C:\AI\ISMS-Form-Redesign\scripts\route-permission-matrix.cjs](C:\AI\ISMS-Form-Redesign\scripts\route-permission-matrix.cjs)
- Purpose:
  - Verify `admin / unit1 / user1 / viewer1` route access against the whitelist.
  - Detect route guard regressions and unauthorized access.
- Output:
  - `test-artifacts/role-flow-regression-YYYY-MM-DD/permission-matrix.json`

### 2. Flow Probe

- Command: `npm run test:role:probe`
- Script: [C:\AI\ISMS-Form-Redesign\scripts\role-flow-probe.cjs](C:\AI\ISMS-Form-Redesign\scripts\role-flow-probe.cjs)
- Purpose:
  - Fast cross-role signal test.
  - Validate the core sequence `admin create -> unit1 respond -> admin inspect`.
- Output:
  - `test-artifacts/role-flow-regression-YYYY-MM-DD/flow-probe.json`

### 3. Focus Regression

- Command: `npm run test:role:focus`
- Script: [C:\AI\ISMS-Form-Redesign\scripts\admin-reporter-regression.cjs](C:\AI\ISMS-Form-Redesign\scripts\admin-reporter-regression.cjs)
- Purpose:
  - Validate the most critical business path only.
  - Sequence:
    - admin create
    - unit1 respond
    - admin review to tracking
    - unit1 tracking submit
    - admin close
- Output:
  - `test-artifacts/role-flow-focus-YYYY-MM-DD/admin-reporter-regression.json`

### 4. Full Smoke Flow

- Command: `npm run test:role:smoke`
- Script: [C:\AI\ISMS-Form-Redesign\scripts\role-flow-smoke.cjs](C:\AI\ISMS-Form-Redesign\scripts\role-flow-smoke.cjs)
- Purpose:
  - Run the full operational path:
  - `admin` management permissions
  - `unit1` create CAR response flow
  - `user1` same-unit proxy access
  - `viewer1` read-only access
  - checklist draft + submit
  - training draft + submit
  - tracking submit + admin close
- Output:
  - `test-artifacts/role-flow-smoke-YYYY-MM-DD/results.json`
  - `test-artifacts/role-flow-smoke-YYYY-MM-DD/screenshots/*`

## Recommended Execution Order

1. `npm run test:role:permission`
2. `npm run test:role:probe`
3. `npm run test:role:focus`
4. `npm run test:role:smoke`

Or run all in one command:

```bash
npm run test:role:all
```

## Local Run

1. Start local preview server:

```bash
node .codex-local-server.cjs
```

2. In another terminal, run:

```bash
npm run test:role:all
```

## CI Run

- Workflow: [C:\AI\ISMS-Form-Redesign\.github\workflows\role-tests.yml](C:\AI\ISMS-Form-Redesign\.github\workflows\role-tests.yml)
- Trigger:
  - push to `main`
  - pull request
- CI steps:
  - `npm ci`
  - `npx playwright install --with-deps chromium`
  - start static preview
  - `npm run test:role:all`
  - upload `test-artifacts/`

## Pass Criteria

### Route Permission Matrix

- `failed = 0`
- `consoleErrors = 0`
- `pageErrors = 0`
- no route `mismatches`

### Flow Probe

- `failed = 0`
- `consoleErrors = 0`
- `pageErrors = 0`

### Focus Regression

- `failed = 0`
- `consoleErrors = 0`
- `pageErrors = 0`
- all 5 focus steps present and passed

### Full Smoke Flow

- `failed = 0`
- `pageErrors = 0`
- core steps all present:
  - create
  - respond
  - checklist draft
  - checklist submit
  - training draft
  - training submit
  - tracking submit
  - admin close

## When To Use Which Layer

- Use `permission` after route or role logic changes.
- Use `probe` after form selector or UI interaction changes.
- Use `focus` after correction workflow, state machine, or review logic changes.
- Use `smoke` before merge, release, or after wider data flow changes.

## Maintenance Rules

1. New protected route:
   - update `ROUTE_WHITELIST`
   - update `route-permission-matrix.cjs`

2. New critical form field:
   - add stable `data-testid`
   - update probe, focus, or smoke script if that field is part of a blocking flow

3. New workflow stage:
   - extend focus and smoke flow
   - keep probe short and focused

4. New test run:
   - outputs are written to a date-stamped artifact directory
   - do not hardcode a dated output path in scripts

## Troubleshooting

### Server not reachable

- Symptom: `ERR_CONNECTION_REFUSED`
- Check:
  - `node .codex-local-server.cjs` is running
  - `http://127.0.0.1:8080/` returns `200`

### Selector timeout

- First check whether `data-testid` exists in the rendered page.
- If the UI was redesigned, update the relevant script instead of falling back to brittle CSS selectors.

### Permission mismatch

- Check:
  - `ROUTE_WHITELIST`
  - sidebar visibility rules
  - `canAccessRoute()` and role helpers

### Flow passes locally but fails in CI

- Confirm Playwright browser version matches `package-lock.json`
- Inspect uploaded `test-artifacts/` and `server.log`
- Prefer deterministic waits tied to route hash or DOM state, not arbitrary sleep inflation
