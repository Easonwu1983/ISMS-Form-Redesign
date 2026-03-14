param(
    [string]$OriginUrl = 'http://127.0.0.1:18080',
    [int]$WaitSeconds = 45,
    [ValidateSet('auto', 'quic', 'http2')]
    [string]$Protocol = 'http2'
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

    throw 'cloudflared is not installed.'
}

$runtimeDir = Join-Path $PSScriptRoot '..\.runtime'
$pidPath = Join-Path $runtimeDir 'cloudflare-quick-tunnel.pid'
$stdoutPath = Join-Path $runtimeDir 'cloudflare-quick-tunnel.out.log'
$stderrPath = Join-Path $runtimeDir 'cloudflare-quick-tunnel.err.log'
$urlPath = Join-Path $runtimeDir 'cloudflare-quick-tunnel.url'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

if (Test-Path $pidPath) {
    $existingPid = (Get-Content $pidPath -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
    if ($existingPid) {
        $process = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "Cloudflare quick tunnel already running. PID: $existingPid"
            if (Test-Path $urlPath) {
                Write-Host "Quick tunnel URL: $((Get-Content $urlPath | Select-Object -First 1).Trim())"
            }
            exit 0
        }
    }
}

$cloudflared = Find-Cloudflared
$arguments = @('tunnel', '--url', $OriginUrl, '--protocol', $Protocol, '--no-autoupdate')
$process = Start-Process -FilePath $cloudflared -ArgumentList $arguments -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru -WindowStyle Hidden
Set-Content -Path $pidPath -Value $process.Id -Encoding ASCII

$deadline = (Get-Date).AddSeconds($WaitSeconds)
$pattern = 'https://[-a-z0-9]+\.trycloudflare\.com'
$quickTunnelUrl = ''

while ((Get-Date) -lt $deadline) {
    $content = @()
    if (Test-Path $stdoutPath) {
        $content += Get-Content $stdoutPath -ErrorAction SilentlyContinue
    }
    if (Test-Path $stderrPath) {
        $content += Get-Content $stderrPath -ErrorAction SilentlyContinue
    }
    $text = ($content -join "`n")
    $match = [regex]::Match($text, $pattern)
    if ($match.Success) {
        $quickTunnelUrl = $match.Value
        break
    }

    Start-Sleep -Seconds 1
}

if (-not $quickTunnelUrl) {
    throw "Cloudflare quick tunnel URL was not detected within $WaitSeconds seconds. Check $stdoutPath and $stderrPath"
}

Set-Content -Path $urlPath -Value $quickTunnelUrl -Encoding ASCII
Write-Host "Cloudflare quick tunnel started. PID: $($process.Id)"
Write-Host "Quick tunnel URL: $quickTunnelUrl"
Write-Host "Origin URL: $OriginUrl"
Write-Host "Protocol: $Protocol"
