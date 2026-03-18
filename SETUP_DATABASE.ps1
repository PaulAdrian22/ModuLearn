# Database Setup Script for MODULEARN
# Run this after SETUP_FRESH_INSTALL.ps1

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   MODULEARN - Database Setup" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Get MySQL credentials
Write-Host "Enter your MySQL credentials:" -ForegroundColor Yellow
$mysqlUser = Read-Host "MySQL Username (default: root)"
if ([string]::IsNullOrWhiteSpace($mysqlUser)) { $mysqlUser = "root" }

$mysqlPass = Read-Host "MySQL Password" -AsSecureString
$mysqlPassPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($mysqlPass))

Write-Host ""
Write-Host "Testing MySQL connection..." -ForegroundColor Yellow

# Test connection
$testCmd = "mysql -u $mysqlUser -p$mysqlPassPlain -e `"SELECT 1;`" 2>&1"
$testResult = Invoke-Expression $testCmd

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ MySQL connection failed!" -ForegroundColor Red
    Write-Host "  Please check your credentials and try again." -ForegroundColor Yellow
    pause
    exit
}

Write-Host "  ✓ MySQL connection successful" -ForegroundColor Green
Write-Host ""

# Create database
Write-Host "Creating database..." -ForegroundColor Yellow
$createDb = "mysql -u $mysqlUser -p$mysqlPassPlain -e `"CREATE DATABASE IF NOT EXISTS modulearn_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`" 2>&1"
Invoke-Expression $createDb

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Database 'modulearn_db' created" -ForegroundColor Green
} else {
    Write-Host "  ! Database might already exist (this is okay)" -ForegroundColor Yellow
}

Write-Host ""

# Import schema
Write-Host "Importing database schema..." -ForegroundColor Yellow
Write-Host "  This may take a minute..." -ForegroundColor Cyan

$schemaPath = ".\database\schema.sql"
if (Test-Path $schemaPath) {
    $importCmd = "mysql -u $mysqlUser -p$mysqlPassPlain modulearn_db < `"$schemaPath`" 2>&1"
    Invoke-Expression $importCmd
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Schema imported successfully" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Schema import failed" -ForegroundColor Red
        Write-Host "  You may need to import manually:" -ForegroundColor Yellow
        Write-Host "  mysql -u $mysqlUser -p modulearn_db < database\schema.sql" -ForegroundColor White
    }
} else {
    Write-Host "  ✗ Schema file not found: $schemaPath" -ForegroundColor Red
}

Write-Host ""

# Set initial locks (ensure Lesson 1 is unlocked)
Write-Host "Setting initial module locks..." -ForegroundColor Yellow
$lockPath = ".\database\set_initial_locks.sql"
if (Test-Path $lockPath) {
    $lockCmd = "mysql -u $mysqlUser -p$mysqlPassPlain modulearn_db < `"$lockPath`" 2>&1"
    Invoke-Expression $lockCmd
    Write-Host "  ✓ Lesson 1 unlocked by default" -ForegroundColor Green
}

Write-Host ""

# Verify tables
Write-Host "Verifying database tables..." -ForegroundColor Yellow
$verifyCmd = "mysql -u $mysqlUser -p$mysqlPassPlain modulearn_db -e `"SHOW TABLES;`" 2>&1"
$tables = Invoke-Expression $verifyCmd

if ($tables -match "Tables_in_modulearn_db") {
    Write-Host "  ✓ Database tables created successfully" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Tables found:" -ForegroundColor Cyan
    Write-Host $tables
} else {
    Write-Host "  ⚠ Could not verify tables" -ForegroundColor Yellow
}

Write-Host ""

# Update backend .env file
Write-Host "Updating backend configuration..." -ForegroundColor Yellow
$envPath = ".\backend\.env"
if (Test-Path $envPath) {
    $envContent = Get-Content $envPath -Raw
    $envContent = $envContent -replace "DB_USER=.*", "DB_USER=$mysqlUser"
    $envContent = $envContent -replace "DB_PASSWORD=.*", "DB_PASSWORD=$mysqlPassPlain"
    $envContent | Out-File -FilePath $envPath -Encoding UTF8 -NoNewline
    Write-Host "  ✓ Backend .env updated with database credentials" -ForegroundColor Green
} else {
    Write-Host "  ⚠ .env file not found, please create it manually" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   Database Setup Complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can now start the system:" -ForegroundColor Cyan
Write-Host "  Run: .\START_SYSTEM.bat" -ForegroundColor White
Write-Host ""
Write-Host "Or manually:" -ForegroundColor Cyan
Write-Host "  Backend:  cd backend && npm start" -ForegroundColor White
Write-Host "  Frontend: cd frontend && npm start" -ForegroundColor White
Write-Host ""
pause
