param(
    [string]$OriginUrl = '',
    [int]$WaitSeconds = 45,
    [ValidateSet('auto', 'quic', 'http2')]
    [string]$Protocol = 'http2'
)

$ErrorActionPreference = 'Stop'

function Resolve-OriginUrl {
    param(
        [string]$RequestedOriginUrl
    )

    $explicitOrigin = ($RequestedOriginUrl | Out-String).Trim()
    $nodeExe = (Get-Command node -ErrorAction Stop).Source
    $resolverScript = Join-Path $PSScriptRoot 'resolve-campus-api-origin.cjs'
    $resultJson = if ($explicitOrigin) {
        & $nodeExe $resolverScript $explicitOrigin
    } else {
        & $nodeExe $resolverScript
    }
    $result = $resultJson | ConvertFrom-Json
    $resolvedOrigin = (($result.origin | Out-String).Trim())
    if (-not $resolvedOrigin) {
        throw "Failed to resolve origin URL via $resolverScript"
    }
    return $resolvedOrigin
}

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
            $existingTunnelUrl = ''
            if (Test-Path $urlPath) {
                $existingTunnelUrl = ((Get-Content $urlPath -ErrorAction SilentlyContinue | Select-Object -First 1) | Out-String).Trim()
            }
            if ($existingTunnelUrl) {
                $probeUrl = ('{0}/api/unit-governance?limit=1' -f $existingTunnelUrl.TrimEnd('/'))
                try {
                    Invoke-WebRequest -Uri $probeUrl -Method Get -UseBasicParsing -TimeoutSec 8 | Out-Null
                    $probeOk = $true
                } catch {
                    $statusCode = 0
                    try {
                        $statusCode = [int]$_.Exception.Response.StatusCode.value__
                    } catch {
                        $statusCode = 0
                    }
                    $probeOk = $statusCode -eq 200 -or $statusCode -eq 401
                }
                if ($probeOk) {
                    Write-Host "Cloudflare quick tunnel already running. PID: $existingPid"
                    Write-Host "Quick tunnel URL: $existingTunnelUrl"
                    exit 0
                }
            }

            Write-Warning "Existing quick tunnel is stale. Restarting. PID: $existingPid"
            Stop-Process -Id $existingPid -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        }
    }
}

$resolvedOriginUrl = Resolve-OriginUrl -RequestedOriginUrl $OriginUrl

$cloudflared = Find-Cloudflared
$arguments = @('tunnel', '--url', $resolvedOriginUrl, '--protocol', $Protocol, '--no-autoupdate')
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
Write-Host "Origin URL: $resolvedOriginUrl"
Write-Host "Protocol: $Protocol"
