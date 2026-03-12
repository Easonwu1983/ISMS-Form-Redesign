$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot '.runtime'
$pidFile = Join-Path $runtimeDir 'host-campus-gateway.pid'

if (-not (Test-Path $pidFile)) {
  Write-Output 'Gateway is not running.'
  exit 0
}

$pid = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pid) {
  $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
  if ($process) {
    Stop-Process -Id $pid -Force
  }
}

Remove-Item $pidFile -ErrorAction SilentlyContinue
Write-Output 'Gateway stopped.'
