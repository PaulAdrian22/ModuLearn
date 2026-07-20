# Database Setup Script for MODULEARN
# Run this after SETUP_FRESH_INSTALL.ps1

$ErrorActionPreference = "Stop"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   MODULEARN - Database Setup" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

function Get-MySqlCliPath {
    $command = Get-Command "mysql" -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $candidates = @(
        (Join-Path $env:ProgramFiles "MySQL\MySQL Server 8.4\bin\mysql.exe"),
        (Join-Path $env:ProgramFiles "MySQL\MySQL Server 8.0\bin\mysql.exe"),
        (Join-Path $env:ProgramFiles "MySQL\MySQL Server 9.0\bin\mysql.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "MySQL\MySQL Server 8.4\bin\mysql.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "MySQL\MySQL Server 8.0\bin\mysql.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "MySQL\MySQL Server 9.0\bin\mysql.exe")
    )

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    return $null
}

function Set-OrAddEnvValue {
    param(
        [string]$Path,
        [string]$Key,
        [string]$Value
    )

    $lines = @()
    if (Test-Path $Path) {
        $lines = @(Get-Content -Path $Path -Encoding UTF8)
    }

    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match ("^\s*" + [regex]::Escape($Key) + "=")) {
            $lines[$i] = "$Key=$Value"
            $found = $true
        }
    }

    if (-not $found) {
        $lines += "$Key=$Value"
    }

    Set-Content -Path $Path -Value $lines -Encoding UTF8
}

$mysqlExe = Get-MySqlCliPath
if ([string]::IsNullOrWhiteSpace($mysqlExe)) {
    Write-Host "mysql CLI was not found. Install MySQL Server/CLI and rerun." -ForegroundColor Red
    pause
    exit 1
}

Write-Host "Enter your MySQL credentials:" -ForegroundColor Yellow
$mysqlUser = Read-Host "MySQL Username (default: root)"
if ([string]::IsNullOrWhiteSpace($mysqlUser)) { $mysqlUser = "root" }

$mysqlPass = Read-Host "MySQL Password (leave blank if none)" -AsSecureString
$passPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($mysqlPass)
try {
    $mysqlPassPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passPtr)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passPtr)
}

$env:MYSQL_PWD = $mysqlPassPlain
try {
    Write-Host ""
    Write-Host "Testing MySQL connection..." -ForegroundColor Yellow
    & $mysqlExe -u $mysqlUser -e "SELECT 1;" *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  MySQL connection failed." -ForegroundColor Red
        Write-Host "  Please check your credentials and try again." -ForegroundColor Yellow
        pause
        exit 1
    }
    Write-Host "  MySQL connection successful" -ForegroundColor Green

    Write-Host ""
    Write-Host "Creating database..." -ForegroundColor Yellow
    & $mysqlExe -u $mysqlUser -e "CREATE DATABASE IF NOT EXISTS modulearn_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create modulearn_db."
    }
    Write-Host "  Database 'modulearn_db' is ready" -ForegroundColor Green

    Write-Host ""
    Write-Host "Importing database..." -ForegroundColor Yellow
    Write-Host "  This may take a minute..." -ForegroundColor Cyan

    $latestDatabasePath = ".\database\modulearn_latest.sql"
    $schemaPath = ".\database\schema.sql"
    $importPath = if (Test-Path $latestDatabasePath) { $latestDatabasePath } else { $schemaPath }
    $importLabel = if ($importPath -eq $latestDatabasePath) { "database\modulearn_latest.sql" } else { "database\schema.sql" }

    if (-not (Test-Path $importPath)) {
        Write-Host "  Database import file not found." -ForegroundColor Red
        Write-Host "  Add database\modulearn_latest.sql or database\schema.sql." -ForegroundColor Yellow
        pause
        exit 1
    }

    Write-Host "  Using $importLabel" -ForegroundColor Cyan
    Get-Content -Path $importPath -Raw | & $mysqlExe -u $mysqlUser modulearn_db
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Database import failed." -ForegroundColor Red
        Write-Host "  You may need to import manually:" -ForegroundColor Yellow
        Write-Host "  mysql -u $mysqlUser -p modulearn_db < $importLabel" -ForegroundColor White
        pause
        exit 1
    }
    Write-Host "  Database imported successfully" -ForegroundColor Green

    Write-Host ""
    Write-Host "Setting initial module locks..." -ForegroundColor Yellow
    $lockPath = ".\database\set_initial_locks.sql"
    if (Test-Path $lockPath) {
        Get-Content -Path $lockPath -Raw | & $mysqlExe -u $mysqlUser modulearn_db
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Lesson 1 unlocked by default" -ForegroundColor Green
        } else {
            Write-Host "  Warning: set_initial_locks.sql import failed." -ForegroundColor Yellow
        }
    }

    Write-Host ""
    Write-Host "Verifying database tables..." -ForegroundColor Yellow
    $tables = & $mysqlExe -u $mysqlUser modulearn_db -e "SHOW TABLES;"
    if ($LASTEXITCODE -eq 0 -and ($tables -match "Tables_in_modulearn_db")) {
        Write-Host "  Database tables verified" -ForegroundColor Green
        Write-Host ""
        Write-Host "  Tables found:" -ForegroundColor Cyan
        Write-Host $tables
    } else {
        Write-Host "  Could not verify tables" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "Updating backend configuration..." -ForegroundColor Yellow
    $envPath = ".\backend\.env"
    if (Test-Path $envPath) {
        Set-OrAddEnvValue -Path $envPath -Key "DB_USER" -Value $mysqlUser
        Set-OrAddEnvValue -Path $envPath -Key "DB_PASSWORD" -Value $mysqlPassPlain
        Set-OrAddEnvValue -Path $envPath -Key "DB_HOST" -Value "localhost"
        Set-OrAddEnvValue -Path $envPath -Key "DB_NAME" -Value "modulearn_db"
        Set-OrAddEnvValue -Path $envPath -Key "DB_PORT" -Value "3306"
        Write-Host "  Backend .env updated with database credentials" -ForegroundColor Green
    } else {
        Write-Host "  backend\.env not found; QUICK_SETUP_LOCALHOST.ps1 can create it." -ForegroundColor Yellow
    }
}
finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
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
