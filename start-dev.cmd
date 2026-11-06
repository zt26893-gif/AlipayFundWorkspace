@echo off
setlocal
call "%~dp0env.cmd"
cd /d "%~dp0Alipay-Fund-Investment-Recommendations"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=5173"

rem Share the same database as the desktop app
set "DATA_DIR=%APPDATA%\AI Fund Tracker\data"
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"

echo.
echo   AI Fund Tracker - dev mode
echo   Frontend: http://127.0.0.1:%PORT%/
echo   Backend : http://127.0.0.1:8787/ (separate window)
echo   Stop: Ctrl+C or close this window
echo.

start "AI Fund Tracker - API 8787" /min cmd /c "node server\index.mjs"
timeout /t 2 >nul

call npm.cmd run dev -- --host 127.0.0.1 --port %PORT% --strictPort

if errorlevel 1 (
  echo.
  echo [FAILED] port %PORT% may be in use, or node_modules is missing.
  echo          Retry: start-dev.cmd 5174
)
pause
