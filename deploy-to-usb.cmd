@echo off
setlocal
rem Deploy portable USB package to a drive letter.
rem Usage: deploy-to-usb.cmd E:
set "SRC=%~dp0usb-package"
set "DST=%~1\AlipayFundTracker"

if "%~1"=="" (
  echo Usage: deploy-to-usb.cmd E:
  echo   Copies usb-package to the USB drive folder \AlipayFundTracker
  pause
  exit /b 1
)

if not exist "%~1\" (
  echo [ERROR] drive %~1 not found
  pause
  exit /b 1
)

if not exist "%SRC%\AI Fund Tracker.exe" (
  echo [ERROR] usb-package missing, run build-desktop.cmd first
  pause
  exit /b 1
)

echo.
echo   Source: %SRC%
echo   Target: %DST%
echo.

robocopy "%SRC%" "%DST%" /E /R:1 /W:1 /NFL /NDL /NJH /NJS
set "RC=%ERRORLEVEL%"
if %RC% GEQ 8 (
  echo [FAILED] robocopy returned %RC%
  pause
  exit /b 1
)

echo.
echo [OK] deployed to %DST%
echo      double-click "AI Fund Tracker.exe" there
echo      data file: %DST%\data\app.db
pause
