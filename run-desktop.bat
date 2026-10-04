@echo off
title TersooPilot Desktop Launcher
cd /d "%~dp0"
echo ========================================================
echo   Launching TersooPilot Desktop Application...
echo ========================================================
call pnpm start
pause
