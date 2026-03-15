$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot '.runtime'
$pidFile = Join-Path $runtimeDir 'host-campus-gateway.pid'

if (-not (Test-Path $pidFile)) {
  Write-Output 'Gateway is not running.'
  exit 0
}

$gatewayPid = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
if ($gatewayPid) {
  $process = Get-Process -Id $gatewayPid -ErrorAction SilentlyContinue
  if ($process) {
    Stop-Process -Id $gatewayPid -Force
  }
}

Remove-Item $pidFile -ErrorAction SilentlyContinue
Write-Output 'Gateway stopped.'
