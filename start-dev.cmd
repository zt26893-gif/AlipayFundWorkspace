@echo off
chcp 65001 >nul
setlocal
call "%~dp0env.cmd"
cd /d "%~dp0Alipay-Fund-Investment-Recommendations"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=5173"

echo.
echo   AI Fund Tracker - 开发模式
echo   前端：http://127.0.0.1:%PORT%/
echo   后端：http://127.0.0.1:8787/  （独立窗口，关闭它即停止数据服务）
echo   停止：按 Ctrl+C 或关闭本窗口
echo.

rem 开发模式的 /api 代理固定指向 8787，先拉起本地后端
start "AI Fund Tracker - API 8787" /min cmd /c "node server\index.mjs"
timeout /t 2 >nul

call npm.cmd run dev -- --host 127.0.0.1 --port %PORT% --strictPort

if errorlevel 1 (
  echo.
  echo [失败] 端口 %PORT% 可能已被占用，或 node_modules 缺失。
  echo        重试: start-dev.cmd 5174
)
pause
