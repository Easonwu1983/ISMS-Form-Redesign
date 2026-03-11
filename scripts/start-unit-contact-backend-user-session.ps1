param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$NodePath = (Get-Command node).Source,
  [string]$RuntimeConfigPath = '',
  [int]$Port = 8787
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($RuntimeConfigPath)) {
  $RuntimeConfigPath = Join-Path $RepoRoot 'm365\campus-backend\runtime.local.json'
}

if (-not (Test-Path $RuntimeConfigPath -PathType Leaf)) {
  throw "Runtime config not found: $RuntimeConfigPath"
}

$listening = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($listening) {
  Write-Host "Backend already listening on port $Port"
  exit 0
}

$serviceHostPath = Join-Path $RepoRoot 'm365\campus-backend\service-host.cjs'
if (-not (Test-Path $serviceHostPath -PathType Leaf)) {
  throw "Service host not found: $serviceHostPath"
}

Start-Process -FilePath $NodePath -ArgumentList @($serviceHostPath, $RuntimeConfigPath) -WorkingDirectory $RepoRoot -WindowStyle Minimized | Out-Null
Write-Host "Started unit-contact backend for current user session on port $Port"
