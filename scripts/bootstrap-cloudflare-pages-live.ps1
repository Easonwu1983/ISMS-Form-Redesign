param(
    [string]$ProjectName = 'isms-campus-portal',
    [string]$Branch = 'main',
    [string]$OriginUrl = '',
    [ValidateSet('auto', 'quic', 'http2')]
    [string]$Protocol = 'http2'
)

$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$startScript = Join-Path $PSScriptRoot 'start-cloudflare-quick-tunnel.ps1'
$refreshScript = Join-Path $PSScriptRoot 'refresh-cloudflare-quick-pages-entry.ps1'
$urlPath = Join-Path $repoRoot '.runtime\cloudflare-quick-tunnel.url'

$startArgs = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $startScript,
    '-Protocol', $Protocol
)
if (($OriginUrl | Out-String).Trim()) {
    $startArgs += @('-OriginUrl', $OriginUrl)
}
powershell @startArgs

if (-not (Test-Path $urlPath)) {
    throw "Quick tunnel URL file not found after startup: $urlPath"
}

$quickTunnelUrl = (Get-Content $urlPath -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
if (-not $quickTunnelUrl) {
    throw "Quick tunnel URL file was empty: $urlPath"
}

Write-Host "Publishing Cloudflare Pages backup entry against $quickTunnelUrl"
powershell -NoProfile -ExecutionPolicy Bypass -File $refreshScript `
    -ProjectName $ProjectName `
    -Branch $Branch

Write-Host 'Cloudflare Pages backup bootstrap completed.'
Write-Host "Pages URL: https://$ProjectName.pages.dev/"
Write-Host "Backend URL: $quickTunnelUrl"
