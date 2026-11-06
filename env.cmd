@echo off
rem ============================================================
rem  项目内隔离环境（类似 Python venv）
rem  只把 runtime\ 下的 Node / Git 加进 PATH，不依赖系统安装
rem  用法：call env.cmd  然后直接用 node / npm / git
rem ============================================================
set "AF_ROOT=%~dp0"
if "%AF_ROOT:~-1%"=="\" set "AF_ROOT=%AF_ROOT:~0,-1%"

set "AF_NODE=%AF_ROOT%\runtime\node"
set "AF_GIT=%AF_ROOT%\runtime\git\cmd"

if exist "%AF_NODE%\node.exe" (
  set "PATH=%AF_NODE%;%PATH%"
) else (
  echo [WARN] 未找到项目内 Node：%AF_NODE%\node.exe，将回退到系统 Node
)

if exist "%AF_GIT%\git.exe" set "PATH=%AF_GIT%;%PATH%"

rem npm 缓存与全局目录也收进项目内，换电脑不污染系统
set "npm_config_cache=%AF_ROOT%\.npm-cache"
set "npm_config_prefix=%AF_ROOT%\runtime\npm-global"
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"
