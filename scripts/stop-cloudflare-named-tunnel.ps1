param()

$ErrorActionPreference = 'Stop'

$pidPath = Join-Path $PSScriptRoot '..\.runtime\cloudflare-tunnel.pid'
if (-not (Test-Path $pidPath)) {
    Write-Host 'Cloudflare tunnel PID file not found.'
    exit 0
}

$targetPid = (Get-Content $pidPath -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
if (-not $targetPid) {
    Remove-Item -Force $pidPath -ErrorAction SilentlyContinue
    Write-Host 'Cloudflare tunnel PID file was empty.'
    exit 0
}

$process = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
if ($process) {
    Stop-Process -Id $targetPid -Force
    Write-Host "Cloudflare tunnel stopped. PID: $targetPid"
}
else {
    Write-Host "Cloudflare tunnel process $targetPid was not running."
}

Remove-Item -Force $pidPath -ErrorAction SilentlyContinue
