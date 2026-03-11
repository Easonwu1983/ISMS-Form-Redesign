param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$StartupFileName = 'ISMSUnitContactBackendUser.cmd'
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

$runnerPath = Join-Path $RepoRoot 'start-unit-contact-backend-user.cmd'
if (-not (Test-Path $runnerPath -PathType Leaf)) {
  throw "Runner script not found: $runnerPath"
}

$startupDir = [Environment]::GetFolderPath('Startup')
if (-not (Test-Path $startupDir -PathType Container)) {
  throw "Startup folder not found: $startupDir"
}

$startupFile = Join-Path $startupDir $StartupFileName
$content = @(
  '@echo off'
  'setlocal'
  "call `"$runnerPath`""
  'exit /b %errorlevel%'
) -join "`r`n"

[System.IO.File]::WriteAllText($startupFile, $content, [System.Text.Encoding]::ASCII)
Write-Host "Installed startup launcher: $startupFile"
