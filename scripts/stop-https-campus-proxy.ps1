param(
  [string]$PidFile = '.runtime\https-proxy.pid'
)

$pidPath = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')) $PidFile
if (-not (Test-Path $pidPath)) {
  Write-Output 'HTTPS proxy is not running.'
  exit 0
}

$currentPid = Get-Content $pidPath | Select-Object -First 1
if ($currentPid -match '^\d+$') {
  try {
    Stop-Process -Id ([int]$currentPid) -Force -ErrorAction Stop
    Write-Output ("HTTPS proxy stopped. PID={0}" -f $currentPid)
  } catch {
    Write-Output ("HTTPS proxy stop failed. PID={0}" -f $currentPid)
  }
}
Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
