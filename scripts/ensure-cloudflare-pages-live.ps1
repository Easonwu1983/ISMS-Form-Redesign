param(
    [string]$ProjectName = 'isms-campus-portal',
    [string]$Branch = 'main',
    [string]$OriginUrl = 'http://127.0.0.1:18080',
    [ValidateSet('auto', 'quic', 'http2')]
    [string]$Protocol = 'http2'
)

$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location $repoRoot

$healthScript = Join-Path $PSScriptRoot 'cloudflare-live-health-check.cjs'
$bootstrapScript = Join-Path $PSScriptRoot 'bootstrap-cloudflare-pages-live.ps1'

function Invoke-CloudflareHealthCheck {
    node $healthScript
    return $LASTEXITCODE
}

$firstExit = Invoke-CloudflareHealthCheck
if ($firstExit -eq 0) {
    Write-Host 'Cloudflare Pages live health is already green.'
    exit 0
}

Write-Warning 'Cloudflare Pages live health check failed. Running bootstrap recovery.'
powershell -NoProfile -ExecutionPolicy Bypass -File $bootstrapScript `
    -ProjectName $ProjectName `
    -Branch $Branch `
    -OriginUrl $OriginUrl `
    -Protocol $Protocol

$secondExit = Invoke-CloudflareHealthCheck
if ($secondExit -ne 0) {
    throw 'Cloudflare Pages live health is still failing after bootstrap recovery.'
}

Write-Host 'Cloudflare Pages live health recovered successfully.'
