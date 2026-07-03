<#
  Installs the Rail 2Touch agent as a Windows Service.
  Run in an ELEVATED (Administrator) PowerShell.

  Example:
    .\install-service.ps1 -ExePath "C:\rail-agent\rail-2touch-agent.exe"
#>
param(
    [string]$ExePath     = "C:\rail-agent\rail-2touch-agent.exe",
    [string]$ServiceName = "Rail2TouchSync",
    [string]$DisplayName = "Rail 2Touch Sync"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ExePath)) {
    Write-Error "Executable not found: $ExePath  (publish it first — see README.md)"
    exit 1
}

# Remove any prior install so this script is re-runnable.
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Service '$ServiceName' already exists — stopping and removing it first..."
    if ($existing.Status -ne 'Stopped') { Stop-Service -Name $ServiceName -Force }
    & sc.exe delete $ServiceName | Out-Host
    Start-Sleep -Seconds 2
}

Write-Host "Creating service '$ServiceName' -> $ExePath"
New-Service -Name $ServiceName `
            -BinaryPathName "`"$ExePath`"" `
            -DisplayName $DisplayName `
            -Description "Syncs 2TouchPOS SQL data to Rail every few minutes." `
            -StartupType Automatic | Out-Null

# Auto-restart on crash: wait 60s between the first three restarts, reset the
# failure counter once a day.
& sc.exe failure $ServiceName reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Host

Write-Host "Starting service..."
Start-Service -Name $ServiceName
Get-Service -Name $ServiceName | Format-Table -AutoSize

Write-Host ""
Write-Host "Done. Logs go to the Windows Event Log (Application source '$ServiceName')."
Write-Host "Uninstall with:  Stop-Service $ServiceName; sc.exe delete $ServiceName"
