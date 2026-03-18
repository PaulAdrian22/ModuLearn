@echo off
REM ============================================
REM MODULEARN Easy Startup - Double-click this!
REM ============================================

echo.
echo ========================================
echo    MODULEARN System Launcher
echo ========================================
echo.
echo Starting MODULEARN servers...
echo.

REM Run the PowerShell script
powershell -ExecutionPolicy Bypass -File "%~dp0start-modulearn.ps1"

pause
