param(
  [string]$ServiceName = 'ISMSUnitContactBackend'
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

Restart-Service -Name $ServiceName -Force
Write-Host "Restarted service: $ServiceName"
