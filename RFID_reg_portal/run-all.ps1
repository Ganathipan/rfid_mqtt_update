param(
  [string] $DbName = 'rfidn',
  [string] $DbHost = 'localhost',
  [int]    $DbPort = 5432,
  [string] $DbUser = 'postgres',
  [string] $PgPassword,
  [switch] $NoInitDb,
  [switch] $NoDropDb,
  [Nullable[int]] $BackendPortOverride
)

$env:PGPASSWORD = 'Gana11602' # set a default password here or pass via -PgPassword

$ErrorActionPreference = 'Stop'

# --- paths ---
$Root        = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir  = Join-Path $Root 'Backend'
$FrontendDir = Join-Path $Root 'frontend'

# --- schema file discovery (keep what you had, example below) ---
$SchemaCandidates = @(
  (Join-Path $Root 'Database\schema.sql'),
  (Join-Path $Root 'schema.sql'),
  (Join-Path $BackendDir 'server\db\migrations\2025-09-18_game_lite.sql')
)
$SchemaFile = $SchemaCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

# --- helpers (same as before) ---
function Ensure-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "$name not found on PATH."
  }
}
function Invoke-PSqlCmd([string]$Sql, [string]$Database = '') {
  $args = @('-h', $DbHost, '-p', $DbPort, '-U', $DbUser, '-v', 'ON_ERROR_STOP=1', '-c', $Sql)
  if ($Database) { $args += @('-d', $Database) }
  & psql @args
}
function Invoke-PSqlFile([string]$File, [string]$Database = '') {
  $args = @('-h', $DbHost, '-p', $DbPort, '-U', $DbUser, '-v', 'ON_ERROR_STOP=1', '-f', $File)
  if ($Database) { $args += @('-d', $Database) }
  & psql @args
}
function Ensure-Database {
  Write-Host "> Ensuring database '$DbName' exists..." -ForegroundColor Cyan
  $exists = (& psql -h $DbHost -p $DbPort -U $DbUser -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'") -eq '1'
  if (-not $exists) {
    Invoke-PSqlCmd "CREATE DATABASE `"$DbName`";" 'postgres'
    Write-Host "  created." -ForegroundColor Green
  } else {
    Write-Host "  already exists." -ForegroundColor DarkGray
  }
}
function Init-Database {
  if ($NoInitDb) { Write-Host "> Skipping DB init (-NoInitDb)" -ForegroundColor Yellow; return }
  if (-not $SchemaFile) { throw "No schema file found. Looked for: $($SchemaCandidates -join ', ')" }
  Write-Host "> Applying schema from '$SchemaFile' to '$DbName'..." -ForegroundColor Cyan
  Invoke-PSqlFile $SchemaFile $DbName
  Write-Host "  schema applied." -ForegroundColor Green
}
function Drop-Database {
  Write-Host "> Dropping database '$DbName'..." -ForegroundColor Magenta
  Invoke-PSqlCmd "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DbName' AND pid <> pg_backend_pid();" 'postgres'
  Invoke-PSqlCmd "DROP DATABASE IF EXISTS `"$DbName`";" 'postgres'
  Write-Host "  dropped." -ForegroundColor Green
}

# --- preflight ---
Ensure-Command 'psql'
Ensure-Command 'npm'
if (-not (Test-Path $BackendDir))  { throw "Backend directory not found: $BackendDir" }
if (-not (Test-Path $FrontendDir)) { throw "Frontend directory not found: $FrontendDir" }
if ($PgPassword) { $env:PGPASSWORD = $PgPassword }

# Check if Mosquitto is available
$MosquittoPath = "C:\Program Files\mosquitto\mosquitto.exe"
if (-not (Test-Path $MosquittoPath)) {
  Write-Warning "Mosquitto not found at $MosquittoPath - MQTT functionality will not be available"
}

# --- DB lifecycle ---
Ensure-Database
Init-Database

# --- launch four persistent terminals using cmd /k (window stays open even on error) ---
# MQTT Broker (Mosquitto)
$MqttConfigPath = Join-Path (Split-Path -Parent $Root) 'mosquitto.conf'
$mqttRunning = $false
try {
  $port1885Check = netstat -an | Select-String ":1885.*LISTENING"
  if ($port1885Check) {
    Write-Host "MQTT Broker already running on port 1885 - skipping startup" -ForegroundColor Yellow
    $mqttProc = $null
    $mqttRunning = $true
  }
} catch {}

if (-not $mqttRunning -and (Test-Path $MqttConfigPath) -and (Test-Path $MosquittoPath)) {
  $mqttCmd = "cd /d `"$(Split-Path -Parent $Root)`" && `"$MosquittoPath`" -c mosquitto.conf"
  $mqttProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $mqttCmd -PassThru -WindowStyle Normal
  Write-Host ("MQTT Broker window PID: {0}" -f $mqttProc.Id) -ForegroundColor Cyan
  Start-Sleep -Seconds 2  # Give MQTT broker time to start
} elseif (-not $mqttRunning) {
  Write-Warning "Mosquitto config not found at $MqttConfigPath or Mosquitto not installed - MQTT broker not started"
  $mqttProc = $null
}

# Backend
$backendCmd = if ($BackendPortOverride) {
  "cd /d `"$BackendDir`" && set PORT=$BackendPortOverride && npm run start"
} else {
  "cd /d `"$BackendDir`" && npm run start"
}
$backendProc  = Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $backendCmd -PassThru -WindowStyle Normal
Write-Host ("Backend window PID: {0}" -f $backendProc.Id)

# Frontend
$frontendCmd = "cd /d `"$FrontendDir`" && npm run dev"
$frontendProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $frontendCmd -PassThru -WindowStyle Normal
Write-Host ("Frontend window PID: {0}" -f $frontendProc.Id)

# DB console
$dbCmd = "psql -h `"$DbHost`" -p $DbPort -U `"$DbUser`" -d `"$DbName`""
$dbProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $dbCmd -PassThru -WindowStyle Normal
Write-Host ("DB (psql) window PID: {0}" -f $dbProc.Id)

Write-Host ""
Write-Host "=== RFID System Status ===" -ForegroundColor Green
Write-Host "✅ Database: Connected to '$DbName'" -ForegroundColor Green
if ($mqttProc -or $mqttRunning) {
  Write-Host "✅ MQTT Broker: Running on port 1885" -ForegroundColor Green
} else {
  Write-Host "❌ MQTT Broker: Not running" -ForegroundColor Red
}
Write-Host "✅ Backend API: Running on port 4000" -ForegroundColor Green
Write-Host "✅ Frontend UI: Running on network interface" -ForegroundColor Green
Write-Host "✅ DB Console: Available for queries" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Access URLs:" -ForegroundColor Cyan
Write-Host "   Frontend: http://10.30.6.239:5173" -ForegroundColor White
Write-Host "   Backend:  http://10.30.6.239:4000" -ForegroundColor White
Write-Host ""
Write-Host "All services launched. Press ENTER here to stop them..." -ForegroundColor Yellow
[void](Read-Host)

# --- shutdown & cleanup ---
foreach ($p in @($mqttProc,$backendProc,$frontendProc,$dbProc)) {
  if ($p -and -not $p.HasExited) {
    try { 
      Write-Host "Stopping process PID: $($p.Id)" -ForegroundColor DarkGray
      Stop-Process -Id $p.Id -Force 
    } catch {}
  }
}

if (-not $NoDropDb) {
  try { Drop-Database } catch { Write-Warning ("Drop failed: {0}" -f $_.Exception.Message) }
} else {
  Write-Host "> Keeping database '$DbName' (-NoDropDb specified)." -ForegroundColor Cyan
}

Write-Host "Done." -ForegroundColor Green
