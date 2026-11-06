@echo off
setlocal
cd /d "%~dp0"

set "PORT=8787"

if not exist "dist\index.html" (
  echo [ERROR] Frontend not built. Run build-app.cmd first.
  pause
  exit /b 1
)

rem 优先使用工作区内的便携 Node（..\runtime\node），找不到再回退系统 Node
set "NODE_EXE=..\runtime\node\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"

echo.
echo   AI Fund Tracker
echo   URL: http://127.0.0.1:%PORT%
echo   Database: data\app.db
echo   Close this window to stop the server.
echo.

if /i "%~1"=="nobrowser" goto runserver
start "" cmd /c "timeout /t 2 >nul ^& start http://127.0.0.1:%PORT%"

:runserver
"%NODE_EXE%" server\index.mjs
pause
