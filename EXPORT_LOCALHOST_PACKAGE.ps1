param(
    [string]$OutputDir = ".\portable_exports",
    [switch]$NoZip,
    [switch]$KeepStaging
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$staging = Join-Path $root "_portable_localhost_staging"
$outputAbsolute = if ([System.IO.Path]::IsPathRooted($OutputDir)) {
    $OutputDir
} else {
    Join-Path $root $OutputDir
}

$includeDirs = @(
    "backend",
    "frontend",
    "database",
    "lessons",
    "docs",
    "scripts",
    "Simulations",
    "netlify"
)

$includeFiles = @(
    "README.md",
    "SETUP_FRESH_INSTALL.ps1",
    "SETUP_DATABASE.ps1",
    "QUICK_SETUP_LOCALHOST.ps1",
    "START_SYSTEM.bat",
    "start-modulearn-enhanced.ps1",
    "stop-modulearn.ps1",
    "netlify.toml",
    "LOCALHOST_MIGRATION_GUIDE.md",
    "EXPORT_LOCALHOST_PACKAGE.ps1"
)

$excludeDirNames = @(
    "node_modules",
    "build",
    "dist",
    "coverage",
    ".cache",
    ".next"
)

$excludeFilePatterns = @(
    "*.zip",
    "*.log",
    ".scan_summary_*.txt"
)

Write-Host "" 
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host " MODULEARN Localhost Package Export" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "Root: $root"

if (Test-Path $staging) {
    Remove-Item -Path $staging -Recurse -Force
}
New-Item -Path $staging -ItemType Directory | Out-Null

Write-Host "" 
Write-Host "[1/5] Copying required folders and files..." -ForegroundColor Yellow

foreach ($dir in $includeDirs) {
    $src = Join-Path $root $dir
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $staging $dir) -Recurse -Force
        Write-Host "  Copied folder: $dir" -ForegroundColor Green
    }
}

foreach ($file in $includeFiles) {
    $src = Join-Path $root $file
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $staging $file) -Force
        Write-Host "  Copied file: $file" -ForegroundColor Green
    }
}

Write-Host "" 
Write-Host "[2/5] Removing generated and local-only folders..." -ForegroundColor Yellow
foreach ($name in $excludeDirNames) {
    $dirs = Get-ChildItem -Path $staging -Directory -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $name }
    foreach ($d in $dirs) {
        Remove-Item -Path $d.FullName -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  Removed folder: $($d.FullName.Replace($staging + '\\', ''))" -ForegroundColor DarkGray
    }
}

Write-Host "" 
Write-Host "[3/5] Removing sensitive and transient files..." -ForegroundColor Yellow

# Remove exact .env files but keep .env.example variants.
Get-ChildItem -Path $staging -File -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq ".env" } |
    ForEach-Object {
        Remove-Item -Path $_.FullName -Force -ErrorAction SilentlyContinue
        Write-Host "  Removed file: $($_.FullName.Replace($staging + '\\', ''))" -ForegroundColor DarkGray
    }

foreach ($pattern in $excludeFilePatterns) {
    Get-ChildItem -Path $staging -File -Recurse -Force -Filter $pattern -ErrorAction SilentlyContinue |
        ForEach-Object {
            Remove-Item -Path $_.FullName -Force -ErrorAction SilentlyContinue
            Write-Host "  Removed file: $($_.FullName.Replace($staging + '\\', ''))" -ForegroundColor DarkGray
        }
}

Write-Host "" 
Write-Host "[4/5] Writing package manifest..." -ForegroundColor Yellow
$manifestPath = Join-Path $staging "PORTABLE_PACKAGE_MANIFEST.txt"
$manifest = @()
$manifest += "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$manifest += "Root Source: $root"
$manifest += ""
$manifest += "Included folders:"
$manifest += ($includeDirs | ForEach-Object { "- $_" })
$manifest += ""
$manifest += "Included files:"
$manifest += ($includeFiles | ForEach-Object { "- $_" })
$manifest += ""
$manifest += "Removed folder names:"
$manifest += ($excludeDirNames | ForEach-Object { "- $_" })
$manifest += ""
$manifest += "Removed file patterns:"
$manifest += ($excludeFilePatterns | ForEach-Object { "- $_" })
$manifest += ""
$manifest += "Final package file list:"
$manifest += (Get-ChildItem -Path $staging -Recurse -File | ForEach-Object { "- " + $_.FullName.Replace($staging + "\\", "") })
$manifest | Set-Content -Path $manifestPath -Encoding UTF8

if (-not (Test-Path $outputAbsolute)) {
    New-Item -Path $outputAbsolute -ItemType Directory | Out-Null
}

$zipPath = Join-Path $outputAbsolute "modulearn-localhost-portable-$timestamp.zip"

if (-not $NoZip) {
    Write-Host "" 
    Write-Host "[5/5] Creating zip archive..." -ForegroundColor Yellow
    if (Test-Path $zipPath) {
        Remove-Item -Path $zipPath -Force
    }
    Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zipPath -CompressionLevel Optimal
    Write-Host "  Zip created: $zipPath" -ForegroundColor Green
} else {
    Write-Host "" 
    Write-Host "[5/5] Zip creation skipped (-NoZip)." -ForegroundColor Yellow
}

if (-not $KeepStaging) {
    Remove-Item -Path $staging -Recurse -Force
    Write-Host "Staging removed." -ForegroundColor DarkGray
} else {
    Write-Host "Staging kept at: $staging" -ForegroundColor DarkGray
}

Write-Host "" 
Write-Host "Done. Share the zip in portable_exports with testers." -ForegroundColor Cyan
Write-Host ""