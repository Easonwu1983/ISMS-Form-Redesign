param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$CliArgs
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$workspaceRoot = (Resolve-Path (Join-Path $projectRoot '..')).Path
$sourceRoot = Join-Path $workspaceRoot 'notebooklm-mcp-cli\src'
$pythonExe = Join-Path $workspaceRoot 'notebooklm-cli-venv\Scripts\python.exe'

if (-not (Test-Path $sourceRoot -PathType Container)) {
  Write-Error "NotebookLM source repo not found: $sourceRoot"
  exit 1
}

if (-not (Test-Path $pythonExe -PathType Leaf)) {
  Write-Error "NotebookLM venv python not found: $pythonExe"
  exit 1
}

$env:PYTHONPATH = if ([string]::IsNullOrWhiteSpace($env:PYTHONPATH)) {
  $sourceRoot
} else {
  "$sourceRoot;$env:PYTHONPATH"
}

$env:PYTHONUTF8 = '1'

& $pythonExe -m notebooklm_tools.cli.main @CliArgs
exit $LASTEXITCODE
