param(
  [Parameter(Mandatory = $true)]
  [string]$Command,
  [string]$Root = '',
  [int]$Port = 8080,
  [int]$StartupTimeoutSeconds = 15
)

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $Root) {
  $Root = (Resolve-Path (Join-Path $scriptDir '..')).Path
}

$serverScript = Join-Path $scriptDir 'local-static-server.ps1'
if (-not (Test-Path $serverScript -PathType Leaf)) {
  throw "Cannot find local server script: $serverScript"
}

$job = Start-Job -FilePath $serverScript -ArgumentList @($Root, $Port)
$url = "http://127.0.0.1:$Port/"
$deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
$started = $false

try {
  do {
    Start-Sleep -Milliseconds 250
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) {
        $started = $true
        break
      }
    } catch {
      if ($job.State -match 'Failed|Stopped|Completed') {
        $jobOutput = Receive-Job -Job $job -Keep | Out-String
        throw "Local server job stopped unexpectedly. Output:`n$jobOutput"
      }
    }
  } while ((Get-Date) -lt $deadline)

  if (-not $started) {
    $jobOutput = Receive-Job -Job $job -Keep | Out-String
    throw "Local server did not start within $StartupTimeoutSeconds seconds. Output:`n$jobOutput"
  }

  Invoke-Expression $Command
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  if ($job) {
    Stop-Job -Job $job -ErrorAction SilentlyContinue | Out-Null
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue | Out-Null
  }
}
