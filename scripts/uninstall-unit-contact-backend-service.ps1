param(
  [string]$ServiceName = 'ISMSUnitContactBackend'
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $existing) {
  Write-Host "Service not found: $ServiceName"
  exit 0
}

Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
sc.exe delete $ServiceName | Out-Null
Write-Host "Removed service: $ServiceName"
