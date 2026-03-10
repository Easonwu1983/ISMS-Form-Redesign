@echo off
setlocal
"%ProgramFiles%\nodejs\node.exe" "%~dp0scripts\run-with-local-server.cjs" "\"%ProgramFiles%\nodejs\node.exe\" scripts\run-test-suite.cjs all"
exit /b %errorlevel%
