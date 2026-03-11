param(
  [string]$ServiceName = 'ISMSUnitContactBackend',
  [string]$HealthUrl = 'http://127.0.0.1:8787/api/unit-contact/health'
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

$service = Get-Service -Name $ServiceName -ErrorAction Stop
$response = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 20

[pscustomobject]@{
  ServiceName = $service.Name
  ServiceStatus = $service.Status
  HealthUrl = $HealthUrl
  BackendOk = $response.ok
  Repository = $response.repository
  SiteUrl = $response.site.url
} | Format-List
