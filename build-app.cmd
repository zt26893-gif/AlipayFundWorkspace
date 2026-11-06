@echo off
chcp 65001 >nul
setlocal
call "%~dp0env.cmd"
cd /d "%~dp0Alipay-Fund-Investment-Recommendations"

call npm.cmd run build
if errorlevel 1 (
  echo.
  echo [FAILED] 前端构建失败
  pause
  exit /b 1
)
echo.
echo [OK] dist 已更新
pause
