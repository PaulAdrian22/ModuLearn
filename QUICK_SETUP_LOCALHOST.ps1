param(
    [switch]$SkipDatabase,
    [switch]$AutoStart,
    [switch]$ForceInstall
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Write-Step {
    param([string]$Message)
    Write-Host "" 
    Write-Host $Message -ForegroundColor Yellow
}

function Test-CommandExists {
    param([string]$CommandName)
    return $null -ne (Get-Command $CommandName -ErrorAction SilentlyContinue)
}

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

function Get-EnvValue {
    param(
        [string]$Path,
        [string]$Key,
        [string]$Default = ""
    )

    if (-not (Test-Path $Path)) {
        return $Default
    }

    $line = Get-Content -Path $Path -Encoding UTF8 | Where-Object { $_ -match ("^\s*" + [regex]::Escape($Key) + "=") } | Select-Object -First 1
    if (-not $line) {
        return $Default
    }

    return ($line -replace ("^\s*" + [regex]::Escape($Key) + "="), "").Trim()
}

function Ensure-NpmDependencies {
    param(
        [string]$ProjectPath,
        [string]$VerifyNodeExpression,
        [string]$Label,
        [switch]$Force
    )

    Push-Location $ProjectPath
    try {
        $needsInstall = $Force -or (-not (Test-Path "node_modules"))

        if (-not $needsInstall) {
            & node -e $VerifyNodeExpression *> $null
            if ($LASTEXITCODE -ne 0) {
                $needsInstall = $true
            }
        }

        if ($needsInstall) {
            Write-Host "  Installing $Label dependencies..." -ForegroundColor Cyan
            npm install
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to install $Label dependencies."
            }
            Write-Host "  $Label dependencies installed." -ForegroundColor Green
        } else {
            Write-Host "  $Label dependencies already satisfied." -ForegroundColor Green
        }
    }
    finally {
        Pop-Location
    }
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host " MODULEARN Quick Localhost Setup" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "Root: $root"

Write-Step "[1/6] Checking prerequisites..."
if (-not (Test-CommandExists "node")) {
    Write-Host "  Node.js is not installed." -ForegroundColor Red
    Write-Host "  Install from https://nodejs.org then rerun." -ForegroundColor Red
    exit 1
}
if (-not (Test-CommandExists "npm")) {
    Write-Host "  npm is not available." -ForegroundColor Red
    Write-Host "  Reinstall Node.js LTS then rerun." -ForegroundColor Red
    exit 1
}

$nodeVersion = node --version
$npmVersion = npm --version
Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green
Write-Host "  npm: $npmVersion" -ForegroundColor Green

$mysqlExe = Get-MySqlCliPath
$mysqlAvailable = -not [string]::IsNullOrWhiteSpace($mysqlExe)
if ($mysqlAvailable) {
    Write-Host "  mysql CLI detected: $mysqlExe" -ForegroundColor Green
} else {
    Write-Host "  mysql CLI not detected." -ForegroundColor Yellow
    if (-not $SkipDatabase) {
        Write-Host "  Install MySQL Server + CLI, or rerun with -SkipDatabase." -ForegroundColor Red
        exit 1
    }
}

Write-Step "[2/6] Preparing environment files..."
$backendEnv = Join-Path $root "backend\.env"
$backendEnvExample = Join-Path $root "backend\.env.example"
$frontendEnv = Join-Path $root "frontend\.env"

$backendEnvCreated = $false
if (-not (Test-Path $backendEnv)) {
    if (Test-Path $backendEnvExample) {
        Copy-Item -Path $backendEnvExample -Destination $backendEnv -Force
    } else {
        @(
            "PORT=5000",
            "NODE_ENV=development",
            "DB_HOST=localhost",
            "DB_USER=root",
            "DB_PASSWORD=",
            "DB_NAME=modulearn_db",
            "DB_PORT=3306",
            "JWT_SECRET=modulearn_local_secret_change_if_needed",
            "JWT_EXPIRE=24h",
            "CORS_ORIGIN=http://localhost:3000"
        ) | Set-Content -Path $backendEnv -Encoding UTF8
    }
    $backendEnvCreated = $true
    Write-Host "  Created backend/.env" -ForegroundColor Green
}

Set-OrAddEnvValue -Path $backendEnv -Key "NODE_ENV" -Value "development"
Set-OrAddEnvValue -Path $backendEnv -Key "PORT" -Value "5000"
Set-OrAddEnvValue -Path $backendEnv -Key "DB_HOST" -Value "localhost"
Set-OrAddEnvValue -Path $backendEnv -Key "DB_NAME" -Value "modulearn_db"
Set-OrAddEnvValue -Path $backendEnv -Key "DB_PORT" -Value "3306"
Set-OrAddEnvValue -Path $backendEnv -Key "CORS_ORIGIN" -Value "http://localhost:3000"
Set-OrAddEnvValue -Path $backendEnv -Key "APP_URL" -Value "http://localhost:5000"
Set-OrAddEnvValue -Path $backendEnv -Key "CLIENT_URL" -Value "http://localhost:3000"

if ($backendEnvCreated) {
    Set-OrAddEnvValue -Path $backendEnv -Key "DB_USER" -Value "root"
    Set-OrAddEnvValue -Path $backendEnv -Key "DB_PASSWORD" -Value ""
}

if (-not (Test-Path $frontendEnv)) {
    "REACT_APP_API_URL=http://localhost:5000/api" | Set-Content -Path $frontendEnv -Encoding UTF8
    Write-Host "  Created frontend/.env" -ForegroundColor Green
} else {
    Set-OrAddEnvValue -Path $frontendEnv -Key "REACT_APP_API_URL" -Value "http://localhost:5000/api"
}

Write-Host "  Localhost env configuration ensured." -ForegroundColor Green

Write-Step "[3/6] Installing missing dependencies..."
Ensure-NpmDependencies -ProjectPath (Join-Path $root "backend") -VerifyNodeExpression "require('express')" -Label "backend" -Force:$ForceInstall
Ensure-NpmDependencies -ProjectPath (Join-Path $root "frontend") -VerifyNodeExpression "require('react-scripts/package.json')" -Label "frontend" -Force:$ForceInstall

Write-Step "[4/6] Database bootstrap..."
$doDatabase = (-not $SkipDatabase) -and $mysqlAvailable
if (-not $doDatabase) {
    Write-Host "  Skipped database bootstrap." -ForegroundColor Yellow
} else {
    $defaultDbUser = Get-EnvValue -Path $backendEnv -Key "DB_USER" -Default "root"
    $dbUserInput = Read-Host "  MySQL username [$defaultDbUser]"
    $dbUser = if ([string]::IsNullOrWhiteSpace($dbUserInput)) { $defaultDbUser } else { $dbUserInput }

    $dbPassSecure = Read-Host "  MySQL password (leave blank if none)" -AsSecureString
    $passPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPassSecure)
    try {
        $dbPass = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passPtr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passPtr)
    }

    $env:MYSQL_PWD = $dbPass
    try {
        & $mysqlExe -u $dbUser -e "SELECT 1;" *> $null
        if ($LASTEXITCODE -ne 0) {
            throw "MySQL authentication failed."
        }

        & $mysqlExe -u $dbUser -e "CREATE DATABASE IF NOT EXISTS modulearn_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to create modulearn_db."
        }

        $schemaPath = Join-Path $root "database\schema.sql"
        if (-not (Test-Path $schemaPath)) {
            throw "database/schema.sql not found."
        }

        Get-Content -Path $schemaPath -Raw | & $mysqlExe -u $dbUser modulearn_db
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to import schema.sql."
        }

        $locksPath = Join-Path $root "database\set_initial_locks.sql"
        if (Test-Path $locksPath) {
            Get-Content -Path $locksPath -Raw | & $mysqlExe -u $dbUser modulearn_db
            if ($LASTEXITCODE -ne 0) {
                Write-Host "  Warning: set_initial_locks.sql import failed." -ForegroundColor Yellow
            }
        }

        Set-OrAddEnvValue -Path $backendEnv -Key "DB_USER" -Value $dbUser
        Set-OrAddEnvValue -Path $backendEnv -Key "DB_PASSWORD" -Value $dbPass

        Write-Host "  Database bootstrap complete." -ForegroundColor Green
    }
    finally {
        Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
    }
}

Write-Step "[5/6] Portability checks..."
Push-Location (Join-Path $root "backend")
try {
    & node -e "require('express'); console.log('backend_ok')"
}
finally {
    Pop-Location
}
Push-Location (Join-Path $root "frontend")
try {
    & node -e "require('react-scripts/package.json'); console.log('frontend_ok')"
}
finally {
    Pop-Location
}

Write-Step "[6/6] Complete"
Write-Host "  Quick setup completed successfully." -ForegroundColor Green
Write-Host "  Frontend URL: http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Backend URL:  http://localhost:5000" -ForegroundColor Cyan

if ($AutoStart) {
    Write-Host "" 
    Write-Host "Starting MODULEARN..." -ForegroundColor Cyan
    & (Join-Path $root "START_SYSTEM.bat")
} else {
    Write-Host "" 
    Write-Host "Run START_SYSTEM.bat when ready." -ForegroundColor White
}
