# Contributing

## Branching

- Use the `codex/` prefix for new branches.
- Keep changes focused. One branch should handle one theme of work.

## Before you push

Run the relevant checks for the area you touched:

- `node --check` on edited JS files
- `npm run test:live:all` for live/runtime changes
- `npm run test:security` for auth, upload, permission, or input handling changes
- `npm run test:training:all` for training flow changes
- `npm run test:role:all` for role / access-control changes
- `npm run test:zoom:browsers` for responsive or layout changes

## Commit quality

- Keep commit messages short and descriptive.
- Do not commit secrets, tokens, or generated deployment artifacts.
- Update docs when you change user-visible behavior or setup steps.

## Pull requests

Include:

- what changed
- how to verify it
- whether the change was deployed to live
- any remaining follow-up items

## Security and data handling

- Treat all user input as untrusted.
- Prefer allowlists over blocklists.
- Do not weaken existing authz or validation checks without a clear reason.
- If a change affects CSV export, attachments, or session handling, run the relevant security smoke after the change.

