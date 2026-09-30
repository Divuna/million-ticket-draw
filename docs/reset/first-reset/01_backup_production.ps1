# =====================================================================================
# Úplná záloha produkční databáze OneMil (xkzhjldrojjlrkezorey) před prvním resetem
# =====================================================================================
# Spouští Pavel ve svém terminálu (PowerShell). Heslo se nikam neukládá ani neloguje:
# connection string se zadává skrytě a po dokončení se z paměti smaže.
#
#   powershell -ExecutionPolicy Bypass -File docs\reset\first-reset\01_backup_production.ps1
#
# Connection string: Supabase Dashboard -> Connect -> Session pooler (port 5432), s doplněným
# heslem databáze. Přímé připojení db.<ref>.supabase.co je jen IPv6.
#
# Výstup (složka backups/ je v .gitignore, NIKDY necommitovat):
#   <backupDir>\onemil-production-pre-first-reset-<čas>.dump          záloha (pg_dump -Fc)
#   <backupDir>\onemil-production-pre-first-reset-<čas>.dump.log      průběh pg_dump
#   <backupDir>\onemil-production-pre-first-reset-<čas>.dump.toc.txt  pg_restore -l
#   <backupDir>\onemil-production-pre-first-reset-<čas>.dump.verify.txt  souhrn ověření
# Restore se NEPROVÁDÍ.
# =====================================================================================

param(
  [string]$BackupDir = "C:\Users\divis\Desktop\Onemil - Projekt\million-ticket-draw\backups",
  [string]$PgBin     = "C:\Program Files\PostgreSQL\17\bin"
)

$ErrorActionPreference = 'Stop'
$pgDump    = Join-Path $PgBin 'pg_dump.exe'
$pgRestore = Join-Path $PgBin 'pg_restore.exe'
foreach ($exe in @($pgDump, $pgRestore)) {
  if (-not (Test-Path $exe)) { throw "Chybí $exe" }
}
& $pgDump --version

if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$file  = Join-Path $BackupDir "onemil-production-pre-first-reset-$stamp.dump"
$log   = "$file.log"
$toc   = "$file.toc.txt"
$sum   = "$file.verify.txt"

$secure = Read-Host 'Vlož Session pooler connection string produkce (vstup je skrytý)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $conn = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  if ($conn -notmatch 'xkzhjldrojjlrkezorey') { throw 'Connection string nepatří produkci xkzhjldrojjlrkezorey — STOP.' }
  if ($conn -match 'dxmowysntemfqfnanxua') { throw 'Connection string ukazuje na staging — STOP.' }

  $env:PGCONNECT_TIMEOUT = '20'
  $env:PGSSLMODE = 'require'
  $started = Get-Date
  Write-Host "pg_dump -> $file (může trvat několik minut)…"
  & $pgDump --format=custom --no-password --verbose --file "$file" --dbname "$conn" 2> "$log"
  $dumpExit = $LASTEXITCODE
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Variable conn -ErrorAction SilentlyContinue
  Remove-Item Env:PGSSLMODE, Env:PGCONNECT_TIMEOUT -ErrorAction SilentlyContinue
}
if ($dumpExit -ne 0) { throw "pg_dump skončil s kódem $dumpExit — viz $log" }

# ---------------- Ověření (bez připojení k databázi) ----------------
& $pgRestore -l "$file" > "$toc"
$restoreExit = $LASTEXITCODE
if ($restoreExit -ne 0) { throw "pg_restore -l skončil s kódem $restoreExit" }

$tocLines   = Get-Content "$toc"
$entries    = ($tocLines | Where-Object { $_ -notmatch '^\s*;' -and $_.Trim() -ne '' }).Count
$tableData  = ($tocLines | Where-Object { $_ -match ' TABLE DATA ' }).Count
$tables     = ($tocLines | Where-Object { $_ -match ' TABLE (public|auth) ' }).Count
$required = @(
  ' TABLE DATA auth users ',
  ' TABLE DATA public users ',
  ' TABLE DATA public wallets ',
  ' TABLE DATA public payments ',
  ' TABLE DATA public contests ',
  ' TABLE DATA public tickets ',
  ' TABLE DATA public partners ',
  ' TABLE DATA public sales_leads ',
  ' TABLE DATA public settings ',
  ' TABLE DATA public content_pages ',
  ' TABLE public wallet_lots ',
  ' FUNCTION public buy_ticket_atomic',
  ' POLICY public '
)
$missing = @()
foreach ($r in $required) {
  if (-not ($tocLines | Where-Object { $_ -like "*$r*" })) { $missing += $r.Trim() }
}
$warnings = (Select-String -Path "$log" -Pattern 'warning|error' -CaseSensitive:$false).Count
$item = Get-Item "$file"
$hash = (Get-FileHash "$file" -Algorithm SHA256).Hash

$report = @"
Záloha produkce OneMil před prvním resetem
Soubor:            $($item.FullName)
Velikost:          $($item.Length) B ($([math]::Round($item.Length / 1MB, 1)) MB)
Vytvořeno:         $($started.ToString('yyyy-MM-dd HH:mm:ss zzz'))  (dokončeno $((Get-Date).ToString('HH:mm:ss')))
SHA-256:           $hash
pg_dump:           exit $dumpExit, varování/chyby v logu: $warnings
pg_restore -l:     exit $restoreExit, TOC položek: $entries, TABLE DATA: $tableData, tabulek public+auth: $tables
Povinné položky:   $(if ($missing.Count -eq 0) { 'VŠE NALEZENO' } else { 'CHYBÍ: ' + ($missing -join ', ') })
"@
$report | Out-File -FilePath "$sum" -Encoding utf8
Write-Host $report
if ($missing.Count -gt 0) { throw 'Záloha neobsahuje všechny povinné položky — NEPOUŽÍVAT pro reset.' }
Write-Host 'Záloha ověřena. Restore se neprovádí.'
