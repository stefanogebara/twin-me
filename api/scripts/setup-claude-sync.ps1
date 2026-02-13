# TwinMe Claude Desktop Sync Setup
# This script sets up automatic syncing of Claude Desktop conversations to TwinMe
#
# Run this once: Right-click -> Run with PowerShell
# Or: powershell -ExecutionPolicy Bypass -File setup-claude-sync.ps1

param(
    [string]$UserId,
    [string]$ApiKey
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TwinMe Claude Desktop Sync Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "ERROR: Node.js is not installed!" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org" -ForegroundColor Yellow
    exit 1
}
Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green

# Get TwinMe installation path
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$twinmePath = Split-Path -Parent $scriptPath

# Prompt for User ID if not provided
if (-not $UserId) {
    Write-Host ""
    Write-Host "Enter your TwinMe User ID:" -ForegroundColor Yellow
    Write-Host "(Find this in TwinMe Settings > API Keys)" -ForegroundColor Gray
    $UserId = Read-Host "User ID"
}

if (-not $UserId) {
    Write-Host "ERROR: User ID is required!" -ForegroundColor Red
    exit 1
}

# Create the sync script wrapper
$syncScriptContent = @"
# TwinMe Claude Sync - Auto-generated
`$ErrorActionPreference = "SilentlyContinue"

# Check if Claude Desktop is running
`$claudeProcess = Get-Process -Name "Claude" -ErrorAction SilentlyContinue

if (`$claudeProcess) {
    # Claude is running, skip sync
    exit 0
}

# Run the sync
Set-Location "$twinmePath\scripts"
node sync-claude-conversations.js --user-id $UserId 2>&1 | Out-File -Append "`$env:TEMP\twinme-sync.log"
"@

$wrapperPath = "$env:LOCALAPPDATA\TwinMe\sync-claude.ps1"
$wrapperDir = Split-Path -Parent $wrapperPath

# Create TwinMe directory
if (-not (Test-Path $wrapperDir)) {
    New-Item -ItemType Directory -Path $wrapperDir -Force | Out-Null
}

# Save wrapper script
$syncScriptContent | Out-File -FilePath $wrapperPath -Encoding UTF8
Write-Host "Created sync script: $wrapperPath" -ForegroundColor Green

# Create scheduled task
$taskName = "TwinMe Claude Sync"
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($existingTask) {
    Write-Host "Removing existing scheduled task..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Create task that runs every hour
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$wrapperPath`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Syncs Claude Desktop conversations to TwinMe" | Out-Null

Write-Host "Created scheduled task: $taskName" -ForegroundColor Green
Write-Host "  - Runs every hour" -ForegroundColor Gray
Write-Host "  - Only syncs when Claude Desktop is closed" -ForegroundColor Gray

# Run initial sync
Write-Host ""
Write-Host "Running initial sync..." -ForegroundColor Yellow

$claudeRunning = Get-Process -Name "Claude" -ErrorAction SilentlyContinue
if ($claudeRunning) {
    Write-Host "Claude Desktop is running. Close it to sync conversations." -ForegroundColor Yellow
} else {
    Set-Location "$twinmePath\scripts"
    node sync-claude-conversations.js --user-id $UserId
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Your Claude Desktop conversations will now sync to TwinMe automatically." -ForegroundColor Cyan
Write-Host "The sync runs every hour when Claude Desktop is closed." -ForegroundColor Gray
Write-Host ""
Write-Host "To manually sync: Close Claude Desktop and run:" -ForegroundColor Gray
Write-Host "  node $twinmePath\scripts\sync-claude-conversations.js --user-id $UserId" -ForegroundColor White
Write-Host ""

Read-Host "Press Enter to exit"
