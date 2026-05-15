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

# ── [1/4] Check Node.js ──────────────────────────────────────────────────────
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

# ── Folder checks ────────────────────────────────────────────────────────────
if (-not (Test-Path ".\backend")) {
    Write-Host "      ERROR: backend folder not found!" -ForegroundColor Red
    Write-Host "      Make sure you're running this from the modulearn folder" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Test-Path ".\frontend")) {
    Write-Host "      ERROR: frontend folder not found!" -ForegroundColor Red
    Write-Host "      Make sure you're running this from the modulearn folder" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# ── [2/4] Kill anything on ports 5000 / 3000 ────────────────────────────────
Write-Host ""
Write-Host "[2/4] Freeing ports 5000 and 3000..." -ForegroundColor Yellow

function Stop-Port($port) {
    $lines = & netstat -ano 2>$null | Select-String ":$port\s"
    $ownerPids = $lines | ForEach-Object {
        if ($_ -match '\s+(\d+)\s*$') { $matches[1] }
    } | Sort-Object -Unique
    foreach ($ownerPid in $ownerPids) {
        Stop-Process -Id ([int]$ownerPid) -Force -ErrorAction SilentlyContinue
    }
    Stop-Process -Name "node","python","python3","uvicorn" -Force -ErrorAction SilentlyContinue
}

Stop-Port 5000
Stop-Port 3000
Start-Sleep -Seconds 2

# ── [3/4] Start Node.js backend ──────────────────────────────────────────────
Write-Host ""
Write-Host "[3/4] Starting Node.js Backend Server..." -ForegroundColor Yellow

$backendPath = Join-Path $scriptPath "backend"

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Write-Host '========================================' -ForegroundColor Green; " +
    "Write-Host '   MODULEARN Node.js Backend' -ForegroundColor Green; " +
    "Write-Host '========================================' -ForegroundColor Green; " +
    "Write-Host ''; " +
    "Set-Location '$backendPath'; " +
    "npm start"
) -WindowStyle Normal

Write-Host "      Backend starting on http://localhost:5000" -ForegroundColor Green
Write-Host "      (Running in separate window)" -ForegroundColor Gray
Write-Host ""

# Wait for backend to be ready
Write-Host "      Waiting for backend to initialize..." -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5000/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {}
}

if ($ready) {
    Write-Host "      Backend server is ready!" -ForegroundColor Green
} else {
    Write-Host "      Warning: Backend may not have started in time" -ForegroundColor Yellow
    Write-Host "      Check the backend window for errors" -ForegroundColor Yellow
}

# ── [4/4] Start frontend ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "[4/4] Starting Frontend Server..." -ForegroundColor Yellow
Write-Host "      Frontend will start on http://localhost:3000" -ForegroundColor Green
Write-Host "      Your browser will open automatically" -ForegroundColor Gray
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "    MODULEARN is starting up!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To stop the servers, close both windows or run stop-modulearn.ps1" -ForegroundColor Gray
Write-Host ""

Set-Location "$scriptPath\frontend"
npm start
