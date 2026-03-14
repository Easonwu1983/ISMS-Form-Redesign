param(
    [string]$ProjectName = 'isms-campus-portal',
    [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$urlPath = Join-Path $repoRoot '.runtime\cloudflare-quick-tunnel.url'
if (-not (Test-Path $urlPath)) {
    throw "Quick tunnel URL file not found: $urlPath"
}

$quickTunnelUrl = (Get-Content $urlPath -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
if (-not $quickTunnelUrl) {
    throw "Quick tunnel URL file was empty: $urlPath"
}

powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'deploy-cloudflare-pages.ps1') `
    -BackendBase $quickTunnelUrl `
    -ProjectName $ProjectName `
    -Branch $Branch `
    -Mode full-proxy
