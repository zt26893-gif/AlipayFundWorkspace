@echo off
chcp 65001 >nul
setlocal
rem ============================================================
rem  把 U 盘便携版部署到指定盘符
rem  用法：deploy-to-usb.cmd E:
rem ============================================================
set "SRC=%~dp0usb-package"
set "DST=%~1\AlipayFundTracker"

if "%~1"=="" (
  echo 用法: deploy-to-usb.cmd E:
  echo   把 usb-package 复制到 U 盘的 \AlipayFundTracker 目录
  pause
  exit /b 1
)

if not exist "%~1\" (
  echo [ERROR] 盘符 %~1 不存在
  pause
  exit /b 1
)

if not exist "%SRC%\AI Fund Tracker.exe" (
  echo [ERROR] 找不到 usb-package，请先运行 build-desktop.cmd
  pause
  exit /b 1
)

echo.
echo   源目录: %SRC%
echo   目标  : %DST%
echo.

robocopy "%SRC%" "%DST%" /E /R:1 /W:1 /NFL /NDL /NJH /NJS
set "RC=%ERRORLEVEL%"
if %RC% GEQ 8 (
  echo [FAILED] robocopy 返回 %RC%
  pause
  exit /b 1
)

echo.
echo [OK] 已部署到 %DST%
echo      双击其中的 "AI Fund Tracker.exe" 即可运行
echo      数据文件: %DST%\data\app.db
pause
