param(
  [string]$StartupFileName = 'ISMSUnitContactBackendUser.cmd'
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

$startupDir = [Environment]::GetFolderPath('Startup')
$startupFile = Join-Path $startupDir $StartupFileName

[pscustomobject]@{
  StartupFolder = $startupDir
  StartupFile = $startupFile
  Exists = (Test-Path $startupFile -PathType Leaf)
} | Format-List
