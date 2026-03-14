param()

$ErrorActionPreference = 'Stop'

$pidPath = Join-Path $PSScriptRoot '..\.runtime\cloudflare-quick-tunnel.pid'
if (-not (Test-Path $pidPath)) {
    Write-Host 'Cloudflare quick tunnel PID file not found.'
    exit 0
}

$targetPid = (Get-Content $pidPath -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
if (-not $targetPid) {
    Remove-Item -Force $pidPath -ErrorAction SilentlyContinue
    Write-Host 'Cloudflare quick tunnel PID file was empty.'
    exit 0
}

$process = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
if ($process) {
    Stop-Process -Id $targetPid -Force
    Write-Host "Cloudflare quick tunnel stopped. PID: $targetPid"
}
else {
    Write-Host "Cloudflare quick tunnel process $targetPid was not running."
}

Remove-Item -Force $pidPath -ErrorAction SilentlyContinue
