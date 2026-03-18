# ============================================
# MODULEARN Stop Script
# ============================================
# This script stops both backend and frontend servers

Write-Host ""
Write-Host "========================================" -ForegroundColor Red
Write-Host "    Stopping MODULEARN Servers" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Red
Write-Host ""

# Stop backend (port 5000)
Write-Host "Stopping Backend Server (port 5000)..." -ForegroundColor Yellow
$backend = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue
if ($backend) {
    $backend | Select-Object -ExpandProperty OwningProcess | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
    Write-Host "  Backend stopped" -ForegroundColor Green
} else {
    Write-Host "  Backend was not running" -ForegroundColor Gray
}

# Stop frontend (port 3000)
Write-Host "Stopping Frontend Server (port 3000)..." -ForegroundColor Yellow
$frontend = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($frontend) {
    $frontend | Select-Object -ExpandProperty OwningProcess | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
    Write-Host "  Frontend stopped" -ForegroundColor Green
} else {
    Write-Host "  Frontend was not running" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "    All servers stopped!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
