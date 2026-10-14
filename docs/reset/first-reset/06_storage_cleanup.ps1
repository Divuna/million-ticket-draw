# =====================================================================================
# Úklid souborů ve Storage po prvním resetu — produkce xkzhjldrojjlrkezorey
# =====================================================================================
# Spouští Pavel. Smaže soubory testovacích dat přes Storage API (SQL je smazat nesmí —
# storage.protect_delete). Buckety zůstávají, mažou se jen soubory v nich.
# Bucket `assets` se NIKDY nemaže (obrázek MIO: settings.miocoin_image_url + MioCoin.tsx).
#
#   powershell -ExecutionPolicy Bypass -File docs\reset\first-reset\06_storage_cleanup.ps1 -ListFile <seznam>
#
# Seznam = jeden řádek `bucket/cesta` na soubor, vytvořený read-only dotazem
#   select bucket_id || '/' || name from storage.objects where bucket_id <> 'assets';
# Klíč: Supabase Dashboard -> Project Settings -> API Keys -> secret / service_role.
# Vstup je skrytý, klíč se nikam neukládá ani nevypisuje a po skončení se smaže z paměti.
# =====================================================================================

param(
  [Parameter(Mandatory = $true)][string]$ListFile,
  [string]$ProjectUrl = 'https://xkzhjldrojjlrkezorey.supabase.co',
  [int]$BatchSize = 100
)

$ErrorActionPreference = 'Stop'
$allowedBuckets = @('contest-images','ticket-shares','voucher-images','banner-images','contest-banners',
  'contest-rules','partner-invoices','partner-logos','partner-offer-assets','avatars',
  'affiliate-bank-exports','affiliate-payout-docs')

if ($ProjectUrl -notmatch 'xkzhjldrojjlrkezorey') { throw 'URL nepatří produkci — STOP.' }
$paths = Get-Content -Encoding UTF8 $ListFile | Where-Object { $_.Trim() -ne '' }
$byBucket = @{}
foreach ($p in $paths) {
  $i = $p.IndexOf('/')
  if ($i -lt 1) { throw "Neplatný řádek: $p" }
  $b = $p.Substring(0, $i); $name = $p.Substring($i + 1)
  if ($b -eq 'assets') { throw 'Seznam obsahuje bucket assets — STOP.' }
  if ($allowedBuckets -notcontains $b) { throw "Neznámý bucket $b — STOP." }
  if (-not $byBucket.ContainsKey($b)) { $byBucket[$b] = New-Object System.Collections.Generic.List[string] }
  $byBucket[$b].Add($name)
}
Write-Host "K smazání: $($paths.Count) souborů"
$byBucket.GetEnumerator() | Sort-Object { $_.Value.Count } -Descending |
  ForEach-Object { Write-Host ("  {0,-26} {1}" -f $_.Key, $_.Value.Count) }
$confirm = Read-Host 'Pokračovat? Napiš ANO'
if ($confirm -cne 'ANO') { Write-Host 'Zrušeno, nic se nesmazalo.'; return }

$secure = Read-Host 'Vlož service role / secret klíč produkce (vstup je skrytý)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
Add-Type -AssemblyName System.Net.Http
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$client = New-Object System.Net.Http.HttpClient
$deleted = 0; $failed = 0
try {
  $key = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  $client.DefaultRequestHeaders.Add('apikey', $key)
  $client.DefaultRequestHeaders.Add('Authorization', "Bearer $key")
  Remove-Variable key
  foreach ($b in $byBucket.Keys) {
    $names = $byBucket[$b]
    for ($o = 0; $o -lt $names.Count; $o += $BatchSize) {
      $chunk = $names.GetRange($o, [Math]::Min($BatchSize, $names.Count - $o))
      $body = @{ prefixes = @($chunk) } | ConvertTo-Json -Compress
      $req = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Delete, "$ProjectUrl/storage/v1/object/$b")
      $req.Content = New-Object System.Net.Http.StringContent($body, [Text.Encoding]::UTF8, 'application/json')
      $resp = $client.SendAsync($req).GetAwaiter().GetResult()
      $text = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      if (-not $resp.IsSuccessStatusCode) {
        $failed += $chunk.Count
        Write-Host "CHYBA $b ($([int]$resp.StatusCode)): $($text.Substring(0, [Math]::Min(200, $text.Length)))"
        if ([int]$resp.StatusCode -in 401, 403) { throw 'Klíč nebyl přijat — STOP.' }
        continue
      }
      # PS 5.1: ConvertFrom-Json vrací pole jako jeden objekt — @(...) by vždy dalo 1.
      $arr = $text | ConvertFrom-Json
      $n = if ($null -eq $arr) { 0 } else { $arr.Count }
      $deleted += $n
      Write-Host ("{0,-26} {1,5}/{2}  (smazáno v dávce {3})" -f $b, [Math]::Min($o + $BatchSize, $names.Count), $names.Count, $n)
    }
  }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  $client.Dispose()
}
Write-Host "Hotovo. Smazáno: $deleted, chyby: $failed (z $($paths.Count))."
