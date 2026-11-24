@echo off
setlocal

pushd "%~dp0.." || exit /b 1
call npm.cmd ci --include=dev
if not errorlevel 1 call npm.cmd run dist

set "build_exit=%errorlevel%"
popd
exit /b %build_exit%
