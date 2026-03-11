param(
  [string]$TaskName = 'ISMSUnitContactBackendUser',
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$RuntimeConfigPath = ''
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($RuntimeConfigPath)) {
  $RuntimeConfigPath = Join-Path $RepoRoot 'm365\campus-backend\runtime.local.json'
}

if (-not (Test-Path $RuntimeConfigPath -PathType Leaf)) {
  throw "Runtime config not found: $RuntimeConfigPath"
}

$runnerPath = Join-Path $RepoRoot 'start-unit-contact-backend-user.cmd'
if (-not (Test-Path $runnerPath -PathType Leaf)) {
  throw "Runner script not found: $runnerPath"
}

$taskCommand = "`"$runnerPath`""
$createArgs = @(
  '/Create',
  '/TN', $TaskName,
  '/SC', 'ONLOGON',
  '/TR', $taskCommand,
  '/F'
)

& schtasks.exe @createArgs | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to create scheduled task: $TaskName"
}

Write-Host "Installed user logon task: $TaskName"
