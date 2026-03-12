$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeExe = 'C:\Program Files\nodejs\node.exe'
$gatewayScript = Join-Path $projectRoot 'host-campus-gateway.cjs'
$runtimeDir = Join-Path $projectRoot '.runtime'
$pidFile = Join-Path $runtimeDir 'host-campus-gateway.pid'
$logFile = Join-Path $runtimeDir 'host-campus-gateway.log'
$errFile = Join-Path $runtimeDir 'host-campus-gateway.err.log'

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

if (Test-Path $pidFile) {
  $oldPid = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($oldPid) {
    $process = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
    if ($process) {
      Stop-Process -Id $oldPid -Force
      Start-Sleep -Seconds 1
    }
  }
  Remove-Item $pidFile -ErrorAction SilentlyContinue
}

$process = Start-Process -FilePath $nodeExe `
  -ArgumentList $gatewayScript `
  -WorkingDirectory $projectRoot `
  -RedirectStandardOutput $logFile `
  -RedirectStandardError $errFile `
  -PassThru

$process.Id | Set-Content -Path $pidFile -Encoding ascii
Write-Output "Gateway started. PID=$($process.Id)"
