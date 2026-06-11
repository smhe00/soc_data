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
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}

$backendCommand = "cd `"$ProjectRoot`"; uv run uvicorn backend.main:app --host $HostAddress --port $BackendPort"
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $backendCommand

$frontendScript = if ($Preview) { "preview:host" } else { "dev:host" }
$frontendCommand = "cd `"$FrontendRoot`"; npm run $frontendScript"
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $frontendCommand

$localIp = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
  Select-Object -First 1 -ExpandProperty IPAddress)

Write-Host ""
Write-Host "Backend:  http://$($localIp):$BackendPort"
Write-Host "Frontend: http://$($localIp):$FrontendPort"
Write-Host ""
Write-Host "If another computer cannot open it, allow TCP $FrontendPort and $BackendPort in Windows Firewall."
