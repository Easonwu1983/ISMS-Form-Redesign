param(
    [Parameter(Mandatory = $true)]
    [string]$BackendBase,
    [Parameter(Mandatory = $true)]
    [string]$ProjectName,
    [string]$Branch = 'main',
    [ValidateSet('full', 'redirect')]
    [string]$Mode = 'full',
    [string]$RedirectTarget = ''
)

$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location $repoRoot

$buildArgs = @('.\scripts\build-cloudflare-pages-package.cjs', "--backend-base=$BackendBase", "--mode=$Mode")
if ($Mode -eq 'redirect' -and $RedirectTarget) {
    $buildArgs += "--redirect-target=$RedirectTarget"
}

node @buildArgs
if ($LASTEXITCODE -ne 0) {
    throw 'Cloudflare Pages package build failed.'
}

$deployCommand = "npx wrangler pages deploy dist/cloudflare-pages --project-name $ProjectName --branch $Branch"
cmd /c $deployCommand
if ($LASTEXITCODE -ne 0) {
    throw 'Cloudflare Pages deploy failed.'
}

Write-Host "Cloudflare Pages deployed. Project: $ProjectName"
