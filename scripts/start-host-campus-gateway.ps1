$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeExe = 'C:\Program Files\nodejs\node.exe'
$gatewayScript = Join-Path $projectRoot 'host-campus-gateway.cjs'
$resolverScript = Join-Path $projectRoot 'scripts\resolve-campus-api-origin.cjs'
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

$resolverResult = & $nodeExe $resolverScript | ConvertFrom-Json
$resolvedOrigin = (($resolverResult.origin | Out-String).Trim())
if (-not $resolvedOrigin) {
  throw "Failed to resolve campus API origin via $resolverScript"
}
$frontendResolverResult = & $nodeExe $resolverScript 'auto' '/service-registry-module.js' 'javascript' | ConvertFrom-Json
$resolvedFrontendOrigin = (($frontendResolverResult.origin | Out-String).Trim())
if (-not $resolvedFrontendOrigin) {
  $resolvedFrontendOrigin = $resolvedOrigin
}
$apiUpstreams = @()
if ($resolverResult.candidates) {
    foreach ($candidate in $resolverResult.candidates) {
        $originValue = (($candidate.origin | Out-String).Trim())
        if ($originValue) {
            $apiUpstreams += $originValue
        }
    }
}
if (-not $apiUpstreams.Count) {
    $apiUpstreams = @($resolvedOrigin)
}
$apiUpstreams = @($resolvedOrigin) + @($apiUpstreams | Where-Object { $_ -and $_ -ne $resolvedOrigin })
$resolvedUri = [System.Uri]$resolvedOrigin
$upstreamHost = $resolvedUri.Host
$upstreamPort = if ($resolvedUri.IsDefaultPort) {
  if ($resolvedUri.Scheme -eq 'https') { 443 } else { 80 }
} else {
  $resolvedUri.Port
}

$env:ISMS_UPSTREAM_HOST = $upstreamHost
$env:ISMS_UPSTREAM_PORT = [string]$upstreamPort
$env:ISMS_API_UPSTREAMS = ($apiUpstreams -join ',')
$env:ISMS_FRONTEND_BASE = $resolvedFrontendOrigin

$process = Start-Process -FilePath $nodeExe `
  -ArgumentList $gatewayScript `
  -WorkingDirectory $projectRoot `
  -RedirectStandardOutput $logFile `
  -RedirectStandardError $errFile `
  -PassThru

$process.Id | Set-Content -Path $pidFile -Encoding ascii
Write-Output "Gateway started. PID=$($process.Id) upstream=$resolvedOrigin frontend=$resolvedFrontendOrigin apiUpstreams=$($env:ISMS_API_UPSTREAMS)"
