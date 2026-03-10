# ISMS Form Redesign Dev Brief

Use this project brief as a stable seed source in NotebookLM before adding deep-dive files.

## Project Summary

- Project: ISMS Form Redesign
- Stack: static frontend (`index.html`, `app.js`, `styles.css`, `units.js`)
- Local run: `start-local.cmd`
- Main product area: university ISMS reporting and training workflow

## Current High-Value Areas

1. Role-based reporting and dashboard views
2. Training roster import/export and Excel-based admin workflow
3. Three-step training process:
   - Step 1: fill training completion data
   - Step 2: print signoff sheet
   - Step 3: upload signed scan
4. Dashboard split between completed and incomplete reporting units
5. Unit selection UX:
   - category first
   - primary unit second
   - secondary unit only when it exists

## Files To Read First

- `index.html`: shell layout and script/style entrypoints
- `app.js`: main application state, routing, screens, training module logic
- `styles.css`: global visual system and responsive fixes
- `units.js`: unit data and hierarchy
- `scripts/training-flow-acceptance.cjs`: end-to-end acceptance flow for the training module
- `docs/system-operation-manual.md`: operator-facing process context
- `docs/qa-regression.md`: regression checkpoints

## Recommended NotebookLM Workflow

1. Seed this brief into a notebook.
2. Add the exact files you are editing as extra sources.
3. Ask NotebookLM to summarize dependencies before changing code.
4. Ask for edge cases and regression risks before implementation.
5. After edits, ask for a test checklist and rollout risks.

## Example Questions

- Explain how the training module state changes from draft to signoff complete.
- Which functions and UI blocks are affected if unit selection changes?
- What regression risks should be checked after changing roster import?
- Summarize the dashboard logic for completed vs incomplete reporting units.
