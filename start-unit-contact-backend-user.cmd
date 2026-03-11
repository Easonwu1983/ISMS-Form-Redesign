@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-unit-contact-backend-user-session.ps1"
exit /b %errorlevel%
