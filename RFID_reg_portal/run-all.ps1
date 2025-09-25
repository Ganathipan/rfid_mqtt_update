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

# --- DB lifecycle ---
Ensure-Database
Init-Database

# --- launch three persistent terminals using cmd /k (window stays open even on error) ---
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
Write-Host "All three windows launched. Press ENTER here to stop them..." -ForegroundColor Yellow
[void](Read-Host)

# --- shutdown & cleanup ---
foreach ($p in @($backendProc,$frontendProc,$dbProc)) {
  if ($p -and -not $p.HasExited) {
    try { Stop-Process -Id $p.Id -Force } catch {}
  }
}

if (-not $NoDropDb) {
  try { Drop-Database } catch { Write-Warning ("Drop failed: {0}" -f $_.Exception.Message) }
} else {
  Write-Host "> Keeping database '$DbName' (-NoDropDb specified)." -ForegroundColor Cyan
}

Write-Host "Done." -ForegroundColor Green
