$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot '.runtime'
$logFile = Join-Path $runtimeDir 'bootstrap-campus-host.log'
$vboxManage = 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe'
$vmName = 'ISMS'
$healthUrl = 'http://127.0.0.1:18080/api/unit-contact/health'

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

function Write-Log {
  param([string]$Message)
  $line = ('[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message)
  Add-Content -Path $logFile -Value $line
  Write-Output $line
}

if (-not (Test-Path $vboxManage)) {
  throw "VBoxManage not found: $vboxManage"
}

$running = & $vboxManage list runningvms
if ($running -notmatch ('"' + [regex]::Escape($vmName) + '"')) {
  Write-Log "Starting VM: $vmName"
  & $vboxManage startvm $vmName --type headless | Out-Null
} else {
  Write-Log "VM already running: $vmName"
}

$ready = $false
for ($i = 1; $i -le 90; $i++) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 3
    if ($response.StatusCode -eq 200) {
      $ready = $true
      Write-Log 'VM HTTP health endpoint is ready on 127.0.0.1:18080'
      break
    }
  }
  catch {
    Start-Sleep -Seconds 2
  }
}

if (-not $ready) {
  Write-Log 'VM HTTP health endpoint did not become ready in time; starting host gateway anyway.'
}

Write-Log 'Starting host campus gateway'
& (Join-Path $PSScriptRoot 'start-host-campus-gateway.ps1') | Out-Null
Write-Log 'Bootstrap completed'
