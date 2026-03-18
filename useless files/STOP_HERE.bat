@echo off
REM ============================================
REM MODULEARN Stop Script - Double-click this!
REM ============================================

echo.
echo ========================================
echo    MODULEARN Server Stopper
echo ========================================
echo.

REM Run the PowerShell stop script
powershell -ExecutionPolicy Bypass -File "%~dp0stop-modulearn.ps1"

echo.
pause
