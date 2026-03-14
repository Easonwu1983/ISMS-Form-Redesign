param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot '..\infra\cloudflare\cloudflared-config.generated.yml'),
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

$configFullPath = [System.IO.Path]::GetFullPath($ConfigPath)
if (-not (Test-Path $configFullPath)) {
    throw "Cloudflare tunnel config not found: $configFullPath"
}

$runtimeDir = Join-Path $PSScriptRoot '..\.runtime'
$pidPath = Join-Path $runtimeDir 'cloudflare-tunnel.pid'
$stdoutPath = Join-Path $runtimeDir 'cloudflare-tunnel.out.log'
$stderrPath = Join-Path $runtimeDir 'cloudflare-tunnel.err.log'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

if (Test-Path $pidPath) {
    $existingPid = (Get-Content $pidPath -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
    if ($existingPid) {
        $process = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "Cloudflare tunnel already running. PID: $existingPid"
            exit 0
        }
    }
}

$cloudflared = Find-Cloudflared
$arguments = @('tunnel', '--protocol', $Protocol, '--config', $configFullPath, 'run')
$process = Start-Process -FilePath $cloudflared -ArgumentList $arguments -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru -WindowStyle Hidden

Set-Content -Path $pidPath -Value $process.Id -Encoding ASCII
Write-Host "Cloudflare tunnel started. PID: $($process.Id)"
Write-Host "stdout: $stdoutPath"
Write-Host "stderr: $stderrPath"
Write-Host "Protocol: $Protocol"
