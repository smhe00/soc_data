param(
    [int]$Port = 8000
)

$ErrorActionPreference = "SilentlyContinue"

function Add-UniquePid {
    param(
        [System.Collections.Generic.List[int]]$PidList,
        [int]$ProcessId
    )
    if ($ProcessId -gt 0 -and -not $PidList.Contains($ProcessId)) {
        $PidList.Add($ProcessId) | Out-Null
    }
}

$pidsToStop = [System.Collections.Generic.List[int]]::new()
$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen

foreach ($listener in $listeners) {
    Add-UniquePid -PidList $pidsToStop -ProcessId ([int]$listener.OwningProcess)

    $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $listener.OwningProcess }
    foreach ($child in $children) {
        Add-UniquePid -PidList $pidsToStop -ProcessId ([int]$child.ProcessId)
    }
}

$backendProcesses = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and
    ($_.CommandLine -match "uvicorn|backend\.main") -and
    ($_.CommandLine -match [regex]::Escape($Port.ToString()))
}
foreach ($process in $backendProcesses) {
    Add-UniquePid -PidList $pidsToStop -ProcessId ([int]$process.ProcessId)
}

if ($pidsToStop.Count -eq 0) {
    Write-Host "No backend listener found on port $Port."
    exit 0
}

foreach ($processId in $pidsToStop) {
    $process = Get-Process -Id $processId
    if ($process) {
        Write-Host "Stopping PID $processId ($($process.ProcessName))..."
        Stop-Process -Id $processId -Force
    } else {
        Write-Host "PID $processId is already gone."
    }
}

Start-Sleep -Seconds 2
$remaining = Get-NetTCPConnection -LocalPort $Port -State Listen
if ($remaining) {
    Write-Host "Port $Port is still listening:"
    $remaining | Select-Object LocalAddress, LocalPort, State, OwningProcess
    exit 1
}

Write-Host "Backend port $Port is free."
