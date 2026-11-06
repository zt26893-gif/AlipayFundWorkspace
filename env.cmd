@echo off
rem Project-local isolated environment (like a venv).
rem Puts runtime\node and runtime\git first on PATH and keeps npm cache inside the project.
set "AF_ROOT=%~dp0"
if "%AF_ROOT:~-1%"=="\" set "AF_ROOT=%AF_ROOT:~0,-1%"

set "AF_NODE=%AF_ROOT%\runtime\node"
set "AF_GIT=%AF_ROOT%\runtime\git\cmd"

if exist "%AF_NODE%\node.exe" (
  set "PATH=%AF_NODE%;%PATH%"
) else (
  echo [WARN] portable node not found: %AF_NODE%\node.exe - falling back to system node
)
if exist "%AF_GIT%\git.exe" set "PATH=%AF_GIT%;%PATH%"

set "npm_config_cache=%AF_ROOT%\.npm-cache"
set "npm_config_prefix=%AF_ROOT%\runtime\npm-global"
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"
