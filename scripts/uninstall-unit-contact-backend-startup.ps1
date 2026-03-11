param(
  [string]$StartupFileName = 'ISMSUnitContactBackendUser.cmd'
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

$startupDir = [Environment]::GetFolderPath('Startup')
$startupFile = Join-Path $startupDir $StartupFileName

if (Test-Path $startupFile -PathType Leaf) {
  Remove-Item $startupFile -Force
  Write-Host "Removed startup launcher: $startupFile"
} else {
  Write-Host "Startup launcher not found: $startupFile"
}
