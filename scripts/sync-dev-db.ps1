param(
  [switch]$InstallDependencies
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot "packages/backend"
$envFile = Join-Path $backendDir ".env"

if (!(Test-Path $backendDir)) {
  throw "Backend directory not found: $backendDir"
}

if (!(Test-Path $envFile)) {
  throw "Missing packages/backend/.env. Copy config/.env.example to packages/backend/.env and adjust DATABASE_URL first."
}

Push-Location $backendDir
try {
  if ($InstallDependencies -or !(Test-Path (Join-Path $backendDir "node_modules"))) {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
  }

  $deployOutput = (& cmd /c "npx prisma migrate deploy 2>&1") -join "`n"
  $deployExit = $LASTEXITCODE
  if ($deployExit -ne 0) {
    if ($deployOutput -match "P3009" -and $deployOutput -match "20260715190000_baseline_schema") {
      Write-Host "Detected failed baseline compatibility migration. Marking it rolled back before retry..."
      npx prisma migrate resolve --rolled-back 20260715190000_baseline_schema
      if ($LASTEXITCODE -ne 0) { throw "Failed to resolve 20260715190000_baseline_schema" }

      $deployOutput = (& cmd /c "npx prisma migrate deploy 2>&1") -join "`n"
      $deployExit = $LASTEXITCODE
    }
  }
  Write-Host $deployOutput
  if ($deployExit -ne 0) { throw "prisma migrate deploy failed" }

  npx prisma generate
  if ($LASTEXITCODE -ne 0) { throw "prisma generate failed" }

  Write-Host "Database schema and Prisma Client are synchronized."
} finally {
  Pop-Location
}
