@echo off
setlocal
rem Backup desktop database to db-backups\ (outside release, survives rebuilds)
set "ROOT=%~dp0"
set "SRC=%ROOT%release\data\app.db"
set "DST=%ROOT%db-backups"

if not exist "%SRC%" (
  if /i not "%~1"=="quiet" echo [SKIP] no database: %SRC%
  exit /b 0
)
if not exist "%DST%" mkdir "%DST%"

set "TS="
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TS=%%i"
if "%TS%"=="" set "TS=manual"

copy /y "%SRC%" "%DST%\app-%TS%.db" >nul
if errorlevel 1 (
  echo [FAILED] backup failed
  exit /b 1
)

rem keep latest 30
for /f "skip=30 delims=" %%f in ('dir /b /o-d "%DST%\app-*.db" 2^>nul') do del "%DST%\%%f" >nul 2>nul

if /i not "%~1"=="quiet" echo [OK] backup: %DST%\app-%TS%.db
exit /b 0
