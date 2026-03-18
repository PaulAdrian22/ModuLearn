# MODULEARN - Fresh Installation Guide
# For freshly reset laptop
# Run this after installing Node.js

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   MODULEARN - System Setup & Installation" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Verify Node.js
Write-Host "[1/6] Checking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    $npmVersion = npm --version
    Write-Host "  ✓ Node.js: $nodeVersion" -ForegroundColor Green
    Write-Host "  ✓ npm: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Node.js not found!" -ForegroundColor Red
    Write-Host "  Please install Node.js from: https://nodejs.org/" -ForegroundColor Yellow
    Write-Host "  Then restart this script." -ForegroundColor Yellow
    pause
    exit
}

Write-Host ""

# Step 2: Check MySQL
Write-Host "[2/6] Checking MySQL installation..." -ForegroundColor Yellow
$mysqlService = Get-Service -Name "*mysql*" -ErrorAction SilentlyContinue
if ($mysqlService) {
    Write-Host "  ✓ MySQL service found: $($mysqlService.DisplayName)" -ForegroundColor Green
    if ($mysqlService.Status -ne 'Running') {
        Write-Host "  ! MySQL is not running. Starting..." -ForegroundColor Yellow
        Start-Service $mysqlService.Name
        Write-Host "  ✓ MySQL started" -ForegroundColor Green
    }
} else {
    Write-Host "  ✗ MySQL not found!" -ForegroundColor Red
    Write-Host "  Please install MySQL from: https://dev.mysql.com/downloads/installer/" -ForegroundColor Yellow
    Write-Host "  Download 'MySQL Installer for Windows'" -ForegroundColor Yellow
    Write-Host ""
    $installMysql = Read-Host "Open MySQL download page? (y/n)"
    if ($installMysql -eq 'y') {
        Start-Process "https://dev.mysql.com/downloads/installer/"
    }
    Write-Host "  After installing MySQL, run this script again." -ForegroundColor Yellow
    pause
    exit
}

Write-Host ""

# Step 3: Install Backend Dependencies
Write-Host "[3/6] Installing Backend Dependencies..." -ForegroundColor Yellow
Set-Location ".\backend"
if (Test-Path "node_modules") {
    Write-Host "  ! node_modules exists. Cleaning..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
}
Write-Host "  Installing packages (this may take a few minutes)..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Backend dependencies installed" -ForegroundColor Green
} else {
    Write-Host "  ✗ Backend installation failed" -ForegroundColor Red
    Set-Location ..
    pause
    exit
}

Write-Host ""

# Step 4: Configure Backend Environment
Write-Host "[4/6] Configuring Backend Environment..." -ForegroundColor Yellow
if (!(Test-Path ".env")) {
    Write-Host "  Creating .env file..." -ForegroundColor Cyan
    @"
PORT=5000
NODE_ENV=development
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=modulearn_db
DB_PORT=3306
JWT_SECRET=modulearn_jwt_secret_key_change_in_production_123456789
JWT_EXPIRE=24h
CORS_ORIGIN=http://localhost:3000
"@ | Out-File -FilePath ".env" -Encoding UTF8
    Write-Host "  ✓ .env file created" -ForegroundColor Green
    Write-Host ""
    Write-Host "  IMPORTANT: Edit backend\.env file with your MySQL credentials!" -ForegroundColor Yellow
    Write-Host "  Set DB_USER and DB_PASSWORD to match your MySQL setup" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ .env file already exists" -ForegroundColor Green
}

Set-Location ..
Write-Host ""

# Step 5: Install Frontend Dependencies
Write-Host "[5/6] Installing Frontend Dependencies..." -ForegroundColor Yellow
Set-Location ".\frontend"
if (Test-Path "node_modules") {
    Write-Host "  ! node_modules exists. Cleaning..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
}
Write-Host "  Installing packages (this may take several minutes)..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Frontend dependencies installed" -ForegroundColor Green
} else {
    Write-Host "  ✗ Frontend installation failed" -ForegroundColor Red
    Set-Location ..
    pause
    exit
}

Set-Location ..
Write-Host ""

# Step 6: Database Setup Instructions
Write-Host "[6/6] Database Setup Required" -ForegroundColor Yellow
Write-Host "  Next steps:" -ForegroundColor Cyan
Write-Host "  1. Update backend\.env with your MySQL credentials" -ForegroundColor White
Write-Host "  2. Create database: mysql -u root -p" -ForegroundColor White
Write-Host "     Then run: CREATE DATABASE modulearn_db;" -ForegroundColor White
Write-Host "  3. Import schema: mysql -u root -p modulearn_db < database\schema.sql" -ForegroundColor White
Write-Host "  4. Run: .\START_SYSTEM.bat to start the application" -ForegroundColor White
Write-Host ""

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   Installation Complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  ✓ Node.js verified" -ForegroundColor Green
Write-Host "  ✓ MySQL verified" -ForegroundColor Green
Write-Host "  ✓ Backend dependencies installed" -ForegroundColor Green
Write-Host "  ✓ Frontend dependencies installed" -ForegroundColor Green
Write-Host "  ! Database setup pending" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next: Setup database and run START_SYSTEM.bat" -ForegroundColor Cyan
Write-Host ""
pause
