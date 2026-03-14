param(
  [string]$PidFile = '.runtime\https-proxy.pid'
)

$pidPath = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')) $PidFile
if (-not (Test-Path $pidPath)) {
  Write-Output 'HTTPS proxy is not running.'
  exit 0
}

$pid = Get-Content $pidPath | Select-Object -First 1
if ($pid -match '^\d+$') {
  try {
    Stop-Process -Id ([int]$pid) -Force -ErrorAction Stop
    Write-Output ("HTTPS proxy stopped. PID={0}" -f $pid)
  } catch {
    Write-Output ("HTTPS proxy stop failed. PID={0}" -f $pid)
  }
}
Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
