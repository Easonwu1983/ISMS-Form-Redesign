param(
  [string]$TaskName = 'ISMSUnitContactBackendUser'
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
Write-Host "Removed user logon task: $TaskName"
