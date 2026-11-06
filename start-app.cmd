@echo off
chcp 65001 >nul
setlocal
call "%~dp0env.cmd"
cd /d "%~dp0Alipay-Fund-Investment-Recommendations"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8787"

if not exist "dist\index.html" (
  echo [ERROR] 前端尚未构建，请先运行 build-app.cmd
  pause
  exit /b 1
)

echo.
echo   AI Fund Tracker - 浏览器模式
echo   URL: http://127.0.0.1:%PORT%
echo   数据库: data\app.db
echo   关闭本窗口即停止服务
echo.

if /i "%~1"=="nobrowser" goto runserver
start "" cmd /c "timeout /t 2 >nul ^& start http://127.0.0.1:%PORT%"

:runserver
node server\index.mjs
pause
