# Soul Signature Browser Extension - Chrome Web Store Build Script
# Usage: powershell -ExecutionPolicy Bypass -File build-for-store.ps1

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$distDir = Join-Path $scriptDir "dist"
$zipPath = Join-Path $scriptDir "soul-signature-extension.zip"

Write-Host "=== Soul Signature Extension - CWS Build ===" -ForegroundColor Cyan

# Step 1: Clean previous build
if (Test-Path $distDir) {
    Remove-Item -Recurse -Force $distDir
    Write-Host "[1/5] Cleaned previous dist/" -ForegroundColor Green
} else {
    Write-Host "[1/5] No previous dist/ to clean" -ForegroundColor Green
}

if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
}

# Step 2: Create dist directory
New-Item -ItemType Directory -Path $distDir | Out-Null
Write-Host "[2/5] Created dist/" -ForegroundColor Green

# Step 3: Copy extension files (excluding test/debug/build files)
$filesToCopy = @(
    "manifest.json",
    "config.js",
    "background.js",
    "soul-observer.js"
)

$dirsToCopy = @(
    "popup",
    "collectors",
    "content",
    "icons"
)

foreach ($file in $filesToCopy) {
    $src = Join-Path $scriptDir $file
    if (Test-Path $src) {
        Copy-Item $src -Destination $distDir
    }
}

foreach ($dir in $dirsToCopy) {
    $src = Join-Path $scriptDir $dir
    if (Test-Path $src) {
        Copy-Item $src -Destination (Join-Path $distDir $dir) -Recurse
    }
}

Write-Host "[3/5] Copied extension files to dist/" -ForegroundColor Green

# Step 4: Verify production config
$configContent = Get-Content (Join-Path $distDir "config.js") -Raw
if ($configContent -match "const ENV = 'production'") {
    Write-Host "[4/5] Config verified: ENV = 'production'" -ForegroundColor Green
} else {
    Write-Host "[4/5] WARNING: config.js is NOT set to production!" -ForegroundColor Red
    Write-Host "       Please set ENV = 'production' in config.js before building" -ForegroundColor Yellow
    exit 1
}

# Verify no localhost in manifest
$manifestContent = Get-Content (Join-Path $distDir "manifest.json") -Raw
if ($manifestContent -match "localhost") {
    Write-Host "       WARNING: manifest.json still contains localhost references!" -ForegroundColor Red
    exit 1
}

# Step 5: Create zip
Compress-Archive -Path (Join-Path $distDir "*") -DestinationPath $zipPath -Force
$zipSize = (Get-Item $zipPath).Length / 1KB
Write-Host "[5/5] Created $zipPath ($([math]::Round($zipSize, 1)) KB)" -ForegroundColor Green

Write-Host ""
Write-Host "=== Build Complete ===" -ForegroundColor Cyan
Write-Host "Upload '$zipPath' to Chrome Web Store Developer Console" -ForegroundColor White
Write-Host "https://chrome.google.com/webstore/devconsole" -ForegroundColor Blue
