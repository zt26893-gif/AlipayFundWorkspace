@echo off
setlocal
call "%~dp0env.cmd"
cd /d "%~dp0Alipay-Fund-Investment-Recommendations"

call npm.cmd run build
if errorlevel 1 (
  echo.
  echo [FAILED] frontend build failed
  pause
  exit /b 1
)
echo.
echo [OK] dist updated
pause
