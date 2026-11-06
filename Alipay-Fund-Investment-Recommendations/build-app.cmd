@echo off
setlocal
cd /d "%~dp0"

if exist "runtime\node\npm.cmd" (
  echo Using portable Node runtime...
  call "runtime\node\npm.cmd" run build
) else (
  echo Using system npm...
  call npm.cmd run build
)

if errorlevel 1 (
  echo.
  echo [FAILED] Build failed.
) else (
  echo.
  echo [OK] dist rebuilt. Double-click start-app.cmd to run.
)
pause
