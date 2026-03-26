$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeExe = 'C:\Program Files\nodejs\node.exe'
$gatewayScript = Join-Path $projectRoot 'host-campus-gateway.cjs'
$runtimeDir = Join-Path $projectRoot '.runtime'
$pidFile = Join-Path $runtimeDir 'host-campus-gateway.pid'
$logFile = Join-Path $runtimeDir 'host-campus-gateway.log'
$errFile = Join-Path $runtimeDir 'host-campus-gateway.err.log'

function Test-UpstreamRoute {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url
  )

  try {
    Invoke-WebRequest -Uri $Url -Method Get -UseBasicParsing -TimeoutSec 5 | Out-Null
    return $true
  } catch {
    $statusCode = 0
    try {
      $statusCode = [int]$_.Exception.Response.StatusCode.value__
    } catch {
      $statusCode = 0
    }
    return $statusCode -eq 200 -or $statusCode -eq 401
  }
}

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

$upstreamHost = '127.0.0.1'
$upstreamPort = 18080
$routeProbeUrl = 'http://127.0.0.1:18080/api/unit-governance?limit=1'
if (-not (Test-UpstreamRoute -Url $routeProbeUrl)) {
  $upstreamHost = '140.112.97.150'
  $upstreamPort = 80
}

$env:ISMS_UPSTREAM_HOST = $upstreamHost
$env:ISMS_UPSTREAM_PORT = [string]$upstreamPort

$process = Start-Process -FilePath $nodeExe `
  -ArgumentList $gatewayScript `
  -WorkingDirectory $projectRoot `
  -RedirectStandardOutput $logFile `
  -RedirectStandardError $errFile `
  -PassThru

$process.Id | Set-Content -Path $pidFile -Encoding ascii
Write-Output "Gateway started. PID=$($process.Id) upstream=$upstreamHost`:$upstreamPort"
