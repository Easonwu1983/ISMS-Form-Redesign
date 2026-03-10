@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\notebooklm-cli.ps1" %*
exit /b %errorlevel%
