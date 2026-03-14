param(
    [string]$TunnelName = 'isms-campus-backend',
    [Parameter(Mandatory = $true)]
    [string]$Hostname,
    [string]$OriginUrl = 'http://127.0.0.1:8787',
    [string]$ConfigPath = (Join-Path $PSScriptRoot '..\infra\cloudflare\cloudflared-config.generated.yml')
)

$ErrorActionPreference = 'Stop'

function Find-Cloudflared {
    $command = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\cloudflared.exe'),
        (Join-Path $PSScriptRoot '..\cloudflared.exe'),
        (Join-Path $PSScriptRoot '..\.runtime\cloudflared.exe')
    )

    foreach ($candidate in $candidates) {
        $resolved = [System.IO.Path]::GetFullPath($candidate)
        if (Test-Path $resolved) {
            return $resolved
        }
    }

    throw 'cloudflared is not installed. Install it first.'
}

function Invoke-Cloudflared {
    param(
        [string]$Executable,
        [string[]]$Arguments
    )

    $output = & $Executable @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        $message = ($output | Out-String).Trim()
        throw "cloudflared $($Arguments -join ' ') failed: $message"
    }
    return $output
}

$cloudflared = Find-Cloudflared
$cloudflareDir = Join-Path $env:USERPROFILE '.cloudflared'
$certPath = Join-Path $cloudflareDir 'cert.pem'
$configFullPath = [System.IO.Path]::GetFullPath($ConfigPath)
$configDir = Split-Path -Parent $configFullPath

New-Item -ItemType Directory -Force -Path $configDir | Out-Null
New-Item -ItemType Directory -Force -Path $cloudflareDir | Out-Null

if (-not (Test-Path $certPath)) {
    Write-Host 'Cloudflare login required. Opening browser for cloudflared tunnel login...'
    & $cloudflared tunnel login
    if ($LASTEXITCODE -ne 0) {
        throw 'cloudflared tunnel login failed.'
    }
}

$tunnelsJson = Invoke-Cloudflared -Executable $cloudflared -Arguments @('tunnel', 'list', '-o', 'json')
$tunnels = @()
if (($tunnelsJson | Out-String).Trim()) {
    $tunnels = $tunnelsJson | ConvertFrom-Json
}
$tunnel = $tunnels | Where-Object { $_.name -eq $TunnelName } | Select-Object -First 1

if (-not $tunnel) {
    Write-Host "Creating Cloudflare tunnel '$TunnelName'..."
    Invoke-Cloudflared -Executable $cloudflared -Arguments @('tunnel', 'create', $TunnelName) | Out-Null
    $tunnels = (Invoke-Cloudflared -Executable $cloudflared -Arguments @('tunnel', 'list', '-o', 'json')) | ConvertFrom-Json
    $tunnel = $tunnels | Where-Object { $_.name -eq $TunnelName } | Select-Object -First 1
}

if (-not $tunnel) {
    throw "Tunnel '$TunnelName' was not found after create."
}

$credentialsFile = Join-Path $cloudflareDir ("{0}.json" -f $tunnel.id)
if (-not (Test-Path $credentialsFile)) {
    throw "Tunnel credentials file not found: $credentialsFile"
}

$yaml = @(
    "tunnel: $($tunnel.id)"
    "credentials-file: $credentialsFile"
    'ingress:'
    "  - hostname: $Hostname"
    "    service: $OriginUrl"
    '  - service: http_status:404'
)

Set-Content -Path $configFullPath -Value ($yaml -join [Environment]::NewLine) -Encoding ASCII

Write-Host "Routing DNS hostname '$Hostname' to tunnel '$TunnelName'..."
Invoke-Cloudflared -Executable $cloudflared -Arguments @('tunnel', 'route', 'dns', $TunnelName, $Hostname) | Out-Null

Write-Host 'Cloudflare named tunnel is ready.'
Write-Host "Tunnel name: $TunnelName"
Write-Host "Tunnel id: $($tunnel.id)"
Write-Host "Hostname: $Hostname"
Write-Host "Config: $configFullPath"
Write-Host "Next: run scripts\\start-cloudflare-named-tunnel.ps1"
