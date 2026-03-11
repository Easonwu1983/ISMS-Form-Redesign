param(
  [string]$ServiceName = 'ISMSUnitContactBackend',
  [string]$DisplayName = 'ISMS Unit Contact Campus Backend',
  [string]$Description = 'Campus backend for unit-contact apply/status using SharePoint lists',
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$NodePath = (Get-Command node).Source,
  [string]$RuntimeConfigPath = '',
  [pscredential]$ServiceCredential,
  [switch]$StartNow,
  [switch]$ForceReinstall
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script in an elevated PowerShell session.'
  }
}

Assert-Administrator

$serviceHostPath = Join-Path $RepoRoot 'm365\campus-backend\service-host.cjs'
if (-not (Test-Path $serviceHostPath -PathType Leaf)) {
  throw "Service host not found: $serviceHostPath"
}

if ([string]::IsNullOrWhiteSpace($RuntimeConfigPath)) {
  $RuntimeConfigPath = Join-Path $RepoRoot 'm365\campus-backend\runtime.local.json'
}

if (-not (Test-Path $RuntimeConfigPath -PathType Leaf)) {
  throw "Runtime config not found: $RuntimeConfigPath"
}

$serviceArgs = @(
  "`"$serviceHostPath`"",
  "`"$RuntimeConfigPath`""
)

$binaryPath = "`"$NodePath`" " + ($serviceArgs -join ' ')

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  if (-not $ForceReinstall) {
    throw "Service '$ServiceName' already exists. Re-run with -ForceReinstall to replace it."
  }
  Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
  sc.exe delete $ServiceName | Out-Null
  Start-Sleep -Seconds 2
}

if ($ServiceCredential) {
  New-Service -Name $ServiceName -BinaryPathName $binaryPath -DisplayName $DisplayName -Description $Description -StartupType Automatic -Credential $ServiceCredential | Out-Null
} else {
  Write-Warning 'No service credential was supplied. The service will run as LocalSystem, which is not suitable for delegated M365 CLI login.'
  New-Service -Name $ServiceName -BinaryPathName $binaryPath -DisplayName $DisplayName -Description $Description -StartupType Automatic | Out-Null
}

sc.exe failure $ServiceName reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Null
sc.exe failureflag $ServiceName 1 | Out-Null

if ($StartNow) {
  Start-Service -Name $ServiceName
}

Write-Host "Installed service: $ServiceName"
Write-Host "Runtime config: $RuntimeConfigPath"
