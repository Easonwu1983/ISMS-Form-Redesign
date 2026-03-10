# NotebookLM Dev Workflow

This project now includes a local NotebookLM CLI workflow that runs from the checked-out upstream source repo and local virtual environment.

## What is wired in

- Wrapper CLI: [scripts/notebooklm-cli.ps1](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/scripts/notebooklm-cli.ps1)
- Workflow commands: [scripts/notebooklm-workflow.ps1](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/scripts/notebooklm-workflow.ps1)
- Double-click / terminal launchers:
  - [notebooklm.cmd](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/notebooklm.cmd)
  - [notebooklm-workflow.cmd](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/notebooklm-workflow.cmd)
- Project brief source for NotebookLM:
  - [docs/notebooklm-dev-brief.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/docs/notebooklm-dev-brief.md)
- Project-level Codex skill installed from upstream:
  - [.agents/skills/nlm-skill/SKILL.md](/C:/Users/MOECISH/Desktop/ai-isms/ISMS-Form-Redesign/.agents/skills/nlm-skill/SKILL.md)

## First-time setup

Run these in the project root:

```powershell
.\notebooklm-workflow.cmd doctor
.\notebooklm-workflow.cmd login
```

If `doctor` says there are no profiles yet, that is expected until you complete `login`.

## Core dev flow

1. Create a project notebook:

```powershell
.\notebooklm-workflow.cmd create-project-notebook
```

Default alias:

```text
isms-form-redesign-dev
```

2. Seed the project brief:

```powershell
.\notebooklm-workflow.cmd seed-dev-context -Notebook isms-form-redesign-dev
```

3. Add the files you are actively changing:

```powershell
.\notebooklm-workflow.cmd capture-file -Notebook isms-form-redesign-dev -FilePath app.js
.\notebooklm-workflow.cmd capture-file -Notebook isms-form-redesign-dev -FilePath styles.css
.\notebooklm-workflow.cmd capture-file -Notebook isms-form-redesign-dev -FilePath docs/system-operation-manual.md
```

4. Ask NotebookLM for coding help:

```powershell
.\notebooklm-workflow.cmd project-query -Notebook isms-form-redesign-dev -Question "Summarize the training module data flow and point out risky areas before refactoring."
```

5. Use research when you need external references:

```powershell
.\notebooklm-workflow.cmd research-start -Notebook isms-form-redesign-dev -Query "higher education information security training signoff workflow" -Mode fast
.\notebooklm-workflow.cmd research-import -Notebook isms-form-redesign-dev
```

## Raw CLI access

Use the wrapper if you want the upstream `nlm` command behavior without remembering paths:

```powershell
.\notebooklm.cmd notebook list
.\notebooklm.cmd source list isms-form-redesign-dev
.\notebooklm.cmd notebook query isms-form-redesign-dev "What should I regression test after changing roster import?"
```

If `npm` is available in your PATH, you can also use npm scripts:

```powershell
npm run nlm:doctor
npm run nlm:login
npm run nlm -- notebook list
```

## Recommended development pattern

Use NotebookLM as a research and code-context sidecar:

1. Seed one concise project brief.
2. Add only the files you are touching.
3. Ask for architecture summary first.
4. Ask for edge cases and regression risks second.
5. Implement in the repo.
6. Ask NotebookLM for a verification checklist before final testing.

## Current platform limitation

Full MCP server integration is not active on this machine yet.

Reason:

- Upstream `notebooklm-mcp-cli` installs the MCP server through dependencies that currently fail on Windows ARM64 in this environment.
- The CLI path works from source and is already integrated here.

What this means:

- CLI workflow: ready now
- Codex project skill: installed for reference
- Direct `notebooklm-mcp` server in Codex MCP config: blocked until upstream Windows ARM64 dependency support improves or the environment moves to x64

## Suggested prompts

- "Summarize how app.js handles the training module flow and point out state transitions."
- "Compare the dashboard logic with the unit selection logic and list likely regression risks."
- "Based on app.js, styles.css, and units.js, explain which files I need to change for a unit hierarchy redesign."
