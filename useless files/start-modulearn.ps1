# ============================================
# MODULEARN Startup Script
# ============================================
# This script starts both backend and frontend servers
# Your classmates can run this on their laptops

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "    MODULEARN System Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get the script's directory (works on any laptop)
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Check if Node.js is installed
Write-Host "[1/4] Checking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>$null
    if ($nodeVersion) {
        Write-Host "      Node.js $nodeVersion detected" -ForegroundColor Green
    } else {
        throw "Node.js not found"
    }
} catch {
    Write-Host "      ERROR: Node.js is not installed!" -ForegroundColor Red
    Write-Host "      Please install Node.js from https://nodejs.org" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if backend folder exists
if (-not (Test-Path ".\backend")) {
    Write-Host "      ERROR: Backend folder not found!" -ForegroundColor Red
    Write-Host "      Make sure you're running this from the modulearn folder" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if frontend folder exists
if (-not (Test-Path ".\frontend")) {
    Write-Host "      ERROR: Frontend folder not found!" -ForegroundColor Red
    Write-Host "      Make sure you're running this from the modulearn folder" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "[2/4] Starting Backend Server..." -ForegroundColor Yellow

# Kill any existing processes on ports 5000 and 3000
Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | 
    Select-Object -ExpandProperty OwningProcess | 
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | 
    Select-Object -ExpandProperty OwningProcess | 
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

Start-Sleep -Seconds 1

# Start backend in new window
$backendPath = Join-Path $scriptPath "backend"
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Write-Host '========================================' -ForegroundColor Green; Write-Host '   MODULEARN Backend Server' -ForegroundColor Green; Write-Host '========================================' -ForegroundColor Green; Write-Host ''; Set-Location '$backendPath'; npm start"
) -WindowStyle Normal

Write-Host "      Backend starting on http://localhost:5000" -ForegroundColor Green
Write-Host "      (Running in separate window)" -ForegroundColor Gray
Write-Host ""

# Wait for backend to initialize
Write-Host "[3/4] Waiting for backend to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Check if backend started successfully
$backendRunning = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue
if ($backendRunning) {
    Write-Host "      Backend server is running!" -ForegroundColor Green
} else {
    Write-Host "      Warning: Backend may not have started properly" -ForegroundColor Yellow
    Write-Host "      Check the backend window for errors" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[4/4] Starting Frontend Server..." -ForegroundColor Yellow
Write-Host "      Frontend will start on http://localhost:3000" -ForegroundColor Green
Write-Host "      Your browser will open automatically" -ForegroundColor Gray
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "    MODULEARN is starting up!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Login Credentials:" -ForegroundColor White
Write-Host "  Admin   : admin@modulearn.com / admin123" -ForegroundColor Cyan
Write-Host "  Student : student@modulearn.com / student123" -ForegroundColor Cyan
Write-Host ""
Write-Host "To stop the servers, close both windows or run stop-modulearn.ps1" -ForegroundColor Gray
Write-Host ""

# Start frontend in current window
Set-Location "$scriptPath\frontend"
npm start
