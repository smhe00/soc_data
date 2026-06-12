param(
  [switch]$Pull,
  [switch]$Preview,
  [string]$HostAddress = "0.0.0.0",
  [int]$FrontendPort = 5173,
  [int]$BackendPort = 8000
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$FrontendRoot = Join-Path $ProjectRoot "frontend"
$ProjectRootText = $ProjectRoot.Path
$PowerShellExe = Join-Path $PSHOME "powershell.exe"

function Stop-ListeningProcess {
  param([int]$Port)

  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}

function Stop-StaleServerWindows {
  $escapedProjectRoot = $ProjectRootText.Replace("\", "\\")
  $markers = @(
    "uvicorn backend.main:app",
    "npm run dev:host",
    "npm run preview:host",
    "node_modules\vite\bin\vite.js",
    "node_modules/.bin/vite"
  )

  Get-CimInstance Win32_Process |
    Where-Object {
      $commandLine = $_.CommandLine
      if (-not $commandLine) { return $false }
      if ($commandLine -notlike "*$ProjectRootText*" -and $commandLine -notlike "*$escapedProjectRoot*") { return $false }
      foreach ($marker in $markers) {
        if ($commandLine -like "*$marker*") { return $true }
      }
      return $false
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Start-ServerWindow {
  param(
    [string]$Title,
    [string]$WorkingDirectory,
    [string]$Command
  )

  $windowCommand = @"
[Console]::Title = '$Title'
Set-Location -LiteralPath "$WorkingDirectory"
Clear-Host
Write-Host "$Title" -ForegroundColor Cyan
Write-Host "Working directory: $WorkingDirectory" -ForegroundColor DarkGray
Write-Host ""
$Command
"@
  Start-Process -FilePath $PowerShellExe -ArgumentList "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $windowCommand -WindowStyle Normal
}

function Start-ServerWindows {
  param(
    [string]$BackendCommand,
    [string]$FrontendCommand
  )

  Start-ServerWindow -Title "SoC Backend :$BackendPort" -WorkingDirectory $ProjectRoot -Command $BackendCommand
  Start-ServerWindow -Title "SoC Frontend :$FrontendPort" -WorkingDirectory $FrontendRoot -Command $FrontendCommand
}

Set-Location $ProjectRoot

if ($Pull) {
  git pull --ff-only
}

uv sync

Set-Location $FrontendRoot
npm install

if ($Preview) {
  npm run build
}

Set-Location $ProjectRoot

foreach ($port in @($BackendPort, $FrontendPort)) {
  Stop-ListeningProcess -Port $port
}
Start-Sleep -Milliseconds 500
Stop-StaleServerWindows

$backendPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$backendCommand = "& `"$backendPython`" -m uvicorn backend.main:app --host $HostAddress --port $BackendPort"

$viteCli = Join-Path $FrontendRoot "node_modules\vite\bin\vite.js"
$frontendCommand = if ($Preview) {
  "node `"$viteCli`" preview --host $HostAddress --port $FrontendPort"
} else {
  "node `"$viteCli`" --host $HostAddress --port $FrontendPort"
}
Start-ServerWindows -BackendCommand $backendCommand -FrontendCommand $frontendCommand

$localIp = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
  Select-Object -First 1 -ExpandProperty IPAddress)

Write-Host ""
Write-Host "Backend:  http://$($localIp):$BackendPort"
Write-Host "Frontend: http://$($localIp):$FrontendPort"
Write-Host ""
Write-Host "If another computer cannot open it, allow TCP $FrontendPort and $BackendPort in Windows Firewall."
