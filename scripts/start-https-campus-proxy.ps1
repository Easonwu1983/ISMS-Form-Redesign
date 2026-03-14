param(
  [string]$ConfigPath = '.runtime\Caddyfile.sslip',
  [string]$PidFile = '.runtime\https-proxy.pid',
  [string]$StdOutLog = '.runtime\https-proxy.out.log',
  [string]$StdErrLog = '.runtime\https-proxy.err.log'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$runtimeDir = Join-Path $projectRoot '.runtime'
$caddyExe = Join-Path $runtimeDir 'caddy.exe'
$zipPath = Join-Path $runtimeDir 'caddy_windows_amd64.zip'
$extractDir = Join-Path $runtimeDir 'caddy-extract'
$config = Join-Path $projectRoot $ConfigPath
$pid = Join-Path $projectRoot $PidFile
$outLog = Join-Path $projectRoot $StdOutLog
$errLog = Join-Path $projectRoot $StdErrLog

if (-not (Test-Path $caddyExe)) {
  $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/caddyserver/caddy/releases/latest'
  $asset = $release.assets | Where-Object { $_.name -match 'windows_amd64.zip$' } | Select-Object -First 1
  if (-not $asset) {
    throw 'Unable to resolve latest Caddy Windows zip.'
  }
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath
  if (Test-Path $extractDir) {
    Remove-Item $extractDir -Recurse -Force
  }
  Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
  Copy-Item (Join-Path $extractDir 'caddy.exe') $caddyExe -Force
}

if (Test-Path $pid) {
  $oldPid = Get-Content $pid | Select-Object -First 1
  if ($oldPid -match '^\d+$') {
    try {
      Stop-Process -Id ([int]$oldPid) -Force -ErrorAction Stop
    } catch {
    }
  }
  Remove-Item $pid -Force -ErrorAction SilentlyContinue
}

$proc = Start-Process -FilePath $caddyExe -ArgumentList @('run', '--config', $config, '--adapter', 'caddyfile') -PassThru -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog
Set-Content $pid $proc.Id
Start-Sleep -Seconds 5
if (-not (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)) {
  throw 'HTTPS proxy exited during startup. Check .runtime\https-proxy.err.log'
}

Write-Output ("HTTPS proxy started. PID={0}" -f $proc.Id)
