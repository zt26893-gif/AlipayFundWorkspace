@echo off
chcp 65001 >nul
setlocal
call "%~dp0env.cmd"
cd /d "%~dp0Alipay-Fund-Investment-Recommendations"

echo.
echo   1/2 构建前端 ...
call npm.cmd run build
if errorlevel 1 (
  echo [FAILED] 前端构建失败
  pause
  exit /b 1
)

echo.
echo   2/2 打包 Electron 便携版 exe ...
call npm.cmd run dist:win
if errorlevel 1 (
  echo [FAILED] exe 打包失败
  pause
  exit /b 1
)

echo.
echo [OK] 输出目录: %~dp0release
dir /b "%~dp0release\*.exe"
pause
