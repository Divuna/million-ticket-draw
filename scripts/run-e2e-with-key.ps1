# Run E2E contest test with SUPABASE_SERVICE_ROLE_KEY
# Usage: .\scripts\run-e2e-with-key.ps1
# Ensure SUPABASE_SERVICE_ROLE_KEY is set in your environment or .env

$key = $env:SUPABASE_SERVICE_ROLE_KEY
if (-not $key) {
  # Try loading from .env
  $envPath = Join-Path $PSScriptRoot "..\.env"
  if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
      if ($_ -match '^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*["'']?([^"''\s#]+)') {
        $key = $Matches[1].Trim()
      }
    }
  }
}
if (-not $key) {
  Write-Host "ERROR: Set SUPABASE_SERVICE_ROLE_KEY in .env or environment" -ForegroundColor Red
  Write-Host "  Add to .env: SUPABASE_SERVICE_ROLE_KEY=eyJ..." -ForegroundColor Yellow
  exit 1
}
$env:SUPABASE_SERVICE_ROLE_KEY = $key
npm run e2e:contest
