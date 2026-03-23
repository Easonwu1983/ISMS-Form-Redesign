param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$NodePath = (Get-Command node).Source,
  [string]$RuntimeConfigPath = '',
  [int]$Port = 8787
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

function Resolve-RuntimeConfigPath {
  param(
    [string]$Root,
    [string]$ExplicitPath = ''
  )

  if (-not [string]::IsNullOrWhiteSpace($ExplicitPath) -and (Test-Path $ExplicitPath -PathType Leaf)) {
    return (Resolve-Path $ExplicitPath).Path
  }

  $candidates = @(
    (Join-Path $Root '.runtime\runtime.local.host.json'),
    (Join-Path $Root 'm365\campus-backend\runtime.local.json')
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate -PathType Leaf) {
      return (Resolve-Path $candidate).Path
    }
  }

  if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
    throw "Runtime config not found: $ExplicitPath"
  }

  throw "Runtime config not found. Looked for: $($candidates -join ', ')"
}

$RuntimeConfigPath = Resolve-RuntimeConfigPath -Root $RepoRoot -ExplicitPath $RuntimeConfigPath
$env:PORT = [string]$Port

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
