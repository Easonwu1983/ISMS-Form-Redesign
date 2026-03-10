@echo off
setlocal

for %%I in ("%~dp0.") do set "ROOT=%%~fI"
set "PORT=8080"
set "URL=http://127.0.0.1:%PORT%/"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$listening = Get-NetTCPConnection -State Listen -LocalPort %PORT% -ErrorAction SilentlyContinue; if ($listening) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  start "ISMS Local Server" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\local-static-server.ps1" -Root "%ROOT%" -Port %PORT%
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$deadline = (Get-Date).AddSeconds(10); do { try { $response = Invoke-WebRequest '%URL%' -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Milliseconds 300 } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 (
  echo Local server failed to start on %URL%
  pause
  exit /b 1
)

start "" "%URL%"
exit /b 0
