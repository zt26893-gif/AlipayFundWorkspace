@echo off
setlocal
call "%~dp0env.cmd"
cd /d "%~dp0Alipay-Fund-Investment-Recommendations"

set "PORT="
if /i not "%~1"=="nobrowser" set "PORT=%~1"
if "%PORT%"=="" set "PORT=8787"

rem Share the same database as the desktop app
set "DATA_DIR=%CD%\..\release\data"
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"

if not exist "dist\index.html" (
  echo [ERROR] frontend not built. Run build-app.cmd first.
  pause
  exit /b 1
)

echo.
echo   AI Fund Tracker - browser mode
echo   URL: http://127.0.0.1:%PORT%
echo   Database: ..\release\data\app.db
echo   Close this window to stop.
echo.

if /i "%~1"=="nobrowser" goto runserver
start "" cmd /c "timeout /t 2 >nul ^& start http://127.0.0.1:%PORT%"

:runserver
node server\index.mjs
pause
