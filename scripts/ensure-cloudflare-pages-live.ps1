param(
    [string]$ProjectName = 'isms-campus-portal',
    [string]$Branch = 'main',
    [string]$OriginUrl = '',
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

function Wait-ForCloudflareHealth {
    param(
        [int]$Attempts = 6,
        [int]$DelaySeconds = 10
    )

    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        $exitCode = Invoke-CloudflareHealthCheck
        if ($exitCode -eq 0) {
            return $true
        }

        if ($attempt -lt $Attempts) {
            Write-Warning "Cloudflare Pages health still failing after bootstrap recovery. Retrying in $DelaySeconds seconds... ($attempt/$Attempts)"
            Start-Sleep -Seconds $DelaySeconds
        }
    }

    return $false
}

if (Wait-ForCloudflareHealth -Attempts 2 -DelaySeconds 5) {
    Write-Host 'Cloudflare Pages backup health is already green.'
    exit 0
}

Write-Warning 'Cloudflare Pages backup health check failed. Running bootstrap recovery.'
$bootstrapArgs = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $bootstrapScript,
    '-ProjectName', $ProjectName,
    '-Branch', $Branch,
    '-Protocol', $Protocol
)
if (($OriginUrl | Out-String).Trim()) {
    $bootstrapArgs += @('-OriginUrl', $OriginUrl)
}
powershell @bootstrapArgs

if (-not (Wait-ForCloudflareHealth)) {
    throw 'Cloudflare Pages backup health is still failing after bootstrap recovery.'
}

Write-Host 'Cloudflare Pages backup health recovered successfully.'
