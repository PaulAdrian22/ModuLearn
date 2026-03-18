@echo off
REM ============================================
REM MODULEARN Comprehensive System Launcher
REM ============================================
REM Version: 2.0
REM Double-click this file to start the system
REM ============================================

echo.
echo ========================================
echo    MODULEARN System Launcher v2.0
echo ========================================
echo.
echo Initializing MODULEARN platform...
echo This will perform system checks and start all services.
echo.

REM Run the PowerShell script
powershell -ExecutionPolicy Bypass -File "%~dp0start-modulearn-enhanced.ps1"

pause
