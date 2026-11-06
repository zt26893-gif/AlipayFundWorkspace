@echo off
chcp 65001 >nul
setlocal
call "%~dp0env.cmd"
cd /d "%~dp0Alipay-Fund-Investment-Recommendations"

echo.
echo   1/2 Build frontend ...
call npm.cmd run build
if errorlevel 1 (
  echo [FAILED] frontend build failed
  pause
  exit /b 1
)

echo.
echo   2/2 Package Electron portable exe ...
rem Output goes to .build\ so release\data is never touched
call npm.cmd run dist:win
if errorlevel 1 (
  echo [FAILED] exe packaging failed
  pause
  exit /b 1
)

set "REL=%~dp0release"
if not exist "%REL%" mkdir "%REL%"
if not exist "%REL%\data" mkdir "%REL%\data"

rem Seed initial database only on first deploy; never overwrite existing data
if not exist "%REL%\data\app.db" (
  if exist "%~dp0Alipay-Fund-Investment-Recommendations\data\app.db" (
    copy /y "%~dp0Alipay-Fund-Investment-Recommendations\data\app.db" "%REL%\data\app.db" >nul
    echo [INFO] seeded initial database ^(first run only^)
  )
)

rem Copy exe only, leave data directory untouched
for %%f in ("%~dp0.build\AI-Fund-Tracker-*.exe") do (
  copy /y "%%f" "%REL%\%%~nxf" >nul
  echo [OK] updated %REL%\%%~nxf
)

rem Backup current database outside the release folder
call "%~dp0backup-data.cmd" quiet

echo.
echo   Done. Data untouched: %REL%\data\app.db
dir /b "%REL%\*.exe"
pause
