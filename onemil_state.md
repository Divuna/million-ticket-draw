# OneMil – aktuální stav projektu

> **Autoritativní aktuální stav. Aktualizováno 16. 8. 2026.**
> Historický vývoj je v `onemil_history.md` a v Git historii. Pokud starší dokumentace odporuje tomuto souboru, pro současný provoz platí tento soubor a skutečný stav ověřený v GitHubu/Supabase.

## 0a1. Snippet widgetu v partnerském dashboardu — HOTOVO NA VĚTVI, **NENASAZENO** (17. 8. 2026)

Partner se schváleným Shoptet napojením vidí v `/partner/dashboard` sekci **„Zobrazení MioCoinů
v e-shopu“**: instrukci (Vzhled a obsah → Editor HTML kódu), hotový `<script>` tag s vlastním
`partners.id`, tlačítko „Kopírovat kód“ a informaci, že se údaje zobrazí podle aktuálního
nastavení v OneMil. **Partner si své partner ID nikde nedohledává.**

- Nové: `src/lib/shoptetWidgetSnippet.ts` (`buildShoptetWidgetSnippet`, `getShoptetWidgetSrc`),
  sekce v `src/pages/PartnerDashboard.tsx`, spec `tests/e2e/132-partner-shoptet-widget-snippet.spec.ts`.
- `src/lib/publicAppUrl.ts`: `import.meta.env?.` (optional chaining) — modul je tím importovatelný
  i v Playwright runneru; chování ve Vite beze změny.
- **Bez DB migrace, bez Edge Function, bez SQL.** Odměny, widget, platby ani Shoptet import
  nezměněny. Druhé ruční schválení Shoptet napojení adminem zůstává; dashboard stav jen čte.

**Ověřeno v prohlížeči proti stagingu** (dočasný partner + přihlášení, obojí smazáno):
sekce se vykreslila, snippet obsahoval skutečné `partners.id` a **`https://onemil.cz`** i při
`VITE_APP_URL=http://localhost:5173`; tlačítko zkopírovalo přesně zobrazený kód
(„Kód byl zkopírován do schránky“); po přepnutí napojení na `submitted` sekce **zmizela**.
Zápis do schránky v automatizovaném prohlížeči blokuje oprávnění (`NotAllowedError`) — proto byl
úspěšný průchod ověřen se stubnutým `writeText`; chybová větev zobrazuje českou hlášku.

Testy: 136 passed (specy 124–132). `npm run build` exit 0.
`npx tsc -p tsconfig.app.json --noEmit` = **18 chyb = nezměněná baseline**, žádná v dotčených
souborech. **Nasazeno nikam — do produkce až Lovable Publishem.**

---

## 0. MioCoin — pravidlo 1 desetinného místa — PŘIPRAVENO NA VĚTVI, **NENASAZENO** (16. 8. 2026)

**Obchodní pravidlo potvrzeno Pavlem** (`ONEMIL_BUSINESS_CONTEXT.md` §8.1, technický invariant
v `CLAUDE.md`): MioCoiny mají max. 1 desetinné místo, minimální partnerská odměna je 0,5 MC,
ručně zadaná hodnota s více než 1 desetinným místem se **odmítne**, automatický výpočet se
zaokrouhlí **právě jednou** na výsledku celé objednávky.

**Stav: implementace je hotová na větvi `claude/miocoin-decimal-unify`.
Migrace 1–5 jsou APLIKOVÁNY NA STAGING `dxmowysntemfqfnanxua` a celý tok — partnerská odměna
i payment → MioCoin → peněženka — je tam E2E OVĚŘEN.
Nic nebylo mergnuto do `main`. PRODUKCE `xkzhjldrojjlrkezorey` NENASAZENA a nezměněna.**

### STAGING OVĚŘENO / PRODUKCE NENASAZENA (16. 8. 2026)

**Aplikováno na staging (migrace 1–4):**
`20260817100000` (coin sloupce → numeric + 8 CHECK guardů + `miocoin_min_partner_reward_mc()`) ·
`20260817110000` (engine `round(v_total_mc,1)`, `issuable`, `mc_display`) ·
`20260817120000` (issuance + `format_miocoin_cz`) ·
`20260817130000` (drop legacy bypassu).
Edge Function `partner-reward-preview` nasazena jako **staging v2** (`verify_jwt=false` beze změny).

**Blokující staging data před migrací:** 19 partnerských řádků mělo `reward_mc = 0` (1× `E2E Affiliate
Test Partner`, 18× `E2E Spec56 Partner <ts>`). Všechny měly současně `reward_base_czk = 0` a **nulové
reference** (0 reward kódů, aktivací, faktur, API klíčů, produktových pravidel, nabídek). **Nic se
nemazalo** — jen `reward_mc 0 → 0.5`; protože `reward_base_czk` zůstal 0, engine pro ně dál vrací
`invalid_partner_conversion_settings`, takže se efektivní chování nezměnilo. Pravidlo nebylo oslabeno.

**Ověřený staging E2E výsledek (fixture `E2E Decimal MioCoin Test`, produkt `DECIMAL-06`, 0,6 MC):**

| krok | výsledek |
|---|---|
| engine 0,6 MC | `coins = 0.6`, `issuable = true` |
| 99 Kč @ 100 Kč = 5 MC | raw `4.95` → **`5.0`** |
| 97 Kč | raw `4.85` → **`4.9`** |
| 96,80 Kč | raw `4.84` → **`4.8`** |
| jedno zaokrouhlení na součtu | raw `1.32` → **`1.3`** (po položkách by dalo 1.2) |
| preview EF (živý staging endpoint) | `{"coins":0.6}`, per-item `0.6`, neflooruje |
| widget výpis | `Získáte 0,6 MioCoinu` |
| widget detail | `Za tento produkt získáte 0,6 MioCoinu` |
| widget košík | `Dárek od nás: 0,6 MioCoinu do soutěží OneMil`, sourozenec **před** `.next-step`, mimo CTA |
| reward code | `coins = 0.6`, `pending → issued` beze ztráty |
| peněženka | `4940.00 → 4940.60` = přesně **+0,6** |
| `wallet_transactions.amount` | `0.6` |
| `partner_coin_activations.coins` | `0.6` |
| faktura | řádky `0.6 + 1.2 + 2.5`, `coins_total = 4.3`, `amount_net = 4.30 Kč` |
| ISDOC payload | `0.6 / 1.2 / 2.5`, `coins_total 4.3` — bez ztráty desetinné části |
| legacy `activate_partner_coins_from_order` | **neexistuje** (0) |

### STAGING PLATEBNÍ DRIFT SROVNÁN + MIGRACE 5 OVĚŘENA (16. 8. 2026)

**Příčina driftu (dohledáno v repu, ne odhad):** hardened `update_wallet_after_payment`
z `20260315200000_wallet_hardening.sql` zapisovala do sloupce `wallets.balance_vouchers`, který
v schématu neexistuje → každá dokončená platba skončila chybou a Stripe webhook vracel 500
(incident PAY03, 30. 06. 2026). Funkce byla tehdy **přímo v databázi přepsána zpět na krátký stub,
mimo jakoukoli migraci**. Produkce byla opravena migrací `20260802120000_restore_wallet_payment_ledger.sql`
a zpevněna `20260803090000_harden_stripe_refund_flow.sql`; **staging ani jednu z nich nikdy nedostal.**
Ani jedna z těchto dvou migrací není zapsaná v `supabase_migrations.schema_migrations` v žádném
z projektů — obě byly aplikovány ručně přes SQL Editor, což odpovídá pracovnímu postupu projektu.

**Zdroj baseline definic:** výhradně existující soubory v repu
`supabase/migrations/20260802120000_restore_wallet_payment_ledger.sql` a
`supabase/migrations/20260803090000_harden_stripe_refund_flow.sql`. **Žádná nová logika nevznikla.**
Šlo o dorovnání historického staging driftu, proto **nevznikla nová produkční migrace**.

**Dorovnáno na stagingu:** `update_wallet_after_payment` (stub → plná verze),
`prepare_stripe_refund` (chyběla), `reverse_failed_stripe_refund` (chyběla),
sloupce `payments.stripe_refund_id` / `stripe_refund_status` / `refund_updated_at`,
indexy `uniq_payments_stripe_refund_id`, `uniq_wallet_tx_refund_debit_per_payment`,
`uniq_wallet_tx_refund_reversal_per_payment`.

**Baseline ověřena hashem proti produkci** (`prosrc` bez komentářů a bílých znaků) — všechny čtyři
funkce se shodují:

| funkce | staging | produkce | shoda |
|---|---|---|---|
| `update_wallet_after_payment` | `5cfd1ad5…` | `5cfd1ad5…` | ✅ (navíc byte-přesně, md5 `894bd1b1…`) |
| `prepare_stripe_refund` | `66a0b51e…` | `66a0b51e…` | ✅ (byte-přesně, md5 `350fe06b…`) |
| `reverse_failed_stripe_refund` | `d7d5acd7…` | `d7d5acd7…` | ✅ (kód shodný; repo verze má o 476 znaků delší komentáře) |
| `create_referral_reward_from_payment` | `59ca0879…` | `59ca0879…` | ✅ (lišila se jen formátováním) |

Shodují se i sloupce, tři unikátní indexy a všechny čtyři triggery na `payments`.

**Teprve poté aplikována migrace 5** `20260817140000_payment_credit_miocoin_one_decimal.sql`.

### Ověřený staging výsledek payment → MioCoin → peněženka

| test | výsledek |
|---|---|
| A — platba 999,99 MC | peněženka `4944.30 → 5944.30` = **+1000,0**, ledger `1000.0`, `payment_amount` 999.99 zachován v metadatech |
| B — refundace téže platby | odečteno přesně **`-1000.0`**, peněženka zpět na `4944.30`, **žádný zlomkový zbytek** |
| C — referral 525 MC × 5 % | raw 26,25 → **`26.3`** (staré `ROUND(…,2)` dávalo `26.25`), sazba 0,05 beze změny |
| D — reálné balíčky | 50 → 50 · 310 → 310 · 525 → 525 · 1280 → 1280, **beze změny** |
| E — opakovaný webhook/trigger | přesně **1** řádek `payment_credit`, žádné druhé připsání |
| F — reverze selhané refundace | obnoveno přesně **`1000.0`** (= odečtená částka), 1 řádek `refund_reversal`, platba zpět na `completed` |

Před opravou dávala tatáž platba 999,99 zůstatek `5944.29`. Všechny testy proběhly v transakcích
s rollbackem; na stagingu nezůstal žádný testovací `payments`, `wallet_transactions`, `referrals`
ani `referral_rewards` řádek a **žádný zůstatek peněženky se dvěma desetinnými místy** (0).

### PDF Edge Function — NASAZENA NA STAGING A OVĚŘENA SKUTEČNÝM PDF (17. 8. 2026)

`generate-partner-invoice-pdf` nasazena na staging **v39 → v40**, `verify_jwt=false` beze změny.
Diff proti baseline obsahuje **výhradně** podporu desetinných MioCoinů: nový `formatCoins()`,
jeho použití v souhrnu / řádcích faktury / kontrolním přehledu / součtu, a oprava
`totalCoins += Number(act.coins || 0)` (dřív se numeric stringy z PostgREST **zřetězily**).

**Skutečné PDF vygenerováno a ověřeno**, ne jen kontrola zdrojáku. Volání proběhlo přes existující
`public.request_partner_invoice_pdf()` (pg_net + Vault `internal_function_token`), takže se
nesahalo na žádný secret a nezměnil se autorizační model funkce.

| kontrola | výsledek |
|---|---|
| HTTP status | **200** |
| Content-Type odpovědi EF | `application/json` (EF vrací metadata, PDF ukládá do Storage — její kontrakt) |
| `activation_overview_total_coins` | `4.3` |
| soubor ve Storage | `application/pdf`, **27 999 B**, hlavička `%PDF-1.7`, ukončeno `%%EOF` — platné, neprázdné |
| řádky faktury (Coiny) | **`0,6` · `1,2` · `2,5`** |
| kontrolní přehled aktivací (MioCoiny) | **`0,6` · `1,2` · `2,5`** |
| `Celkem:` v přehledu aktivací | **`4,3`** (nikoli `"00.61.22.5"`) |
| `Celkem coinů:` v souhrnu | **`4,3`** |
| `Cena bez DPH` | **`4,30 CZK`** |
| `DPH 21 %` / `Cena s DPH` | `0,90 CZK` / `5,20 CZK` |

Nevzniklo `0`, `1`, `4`, `4,30 MC` ani technický string. MioCoin množství drží 1 desetinné místo,
peníze 2 — obojí zároveň na jedné faktuře.

**Vizuální kontrola proběhla skutečně:** PDF bylo staženo ze staging Storage (Supabase CLI,
explicitní `--project-ref dxmowysntemfqfnanxua`), vyrenderováno do PNG a prohlédnuto. Text se
nepřekrývá, tabulky nejsou rozbité, české desetinné čárky i diakritika (`Kontrolní přehled aktivací
MioCoinů`, `Položky faktury`, `Odběratel`) se vykreslují správně, součet je viditelný, QR kód je
vykreslený.

### Zaokrouhlení peněz na partnerské faktuře — OPRAVENO (17. 8. 2026, staging)

**Root cause:** tři živé funkce vytvářející coin faktury peníze vůbec nezaokrouhlovaly.
Projevilo se to jen ve dvou sloupcích, protože `amount_ex_vat`, `vat_amount` a `amount_inc_vat`
jsou `numeric(14,2)` (typ zaokrouhlí sám), zatímco **`amount_net` a `amount_gross` jsou
neomezené `numeric`** a uložily surový součin (`4.30000` / `5.203000000`).

Nejhorší byla `create_partner_invoices_for_period`: psala výrazy přímo do INSERTu a **gross
odvozovala vlastním vzorcem** `coins * price * (1 + vat_rate)` místo z `net + DPH`. Samotné
zaokrouhlení tří nezávislých výrazů by nestačilo — u „půlhaléřového“ netto (`0.125`, `0.075`,
`1.125`) vyjde `round(coins*price*1.21, 2)` **o haléř níž** než `net + DPH`, tj. faktura by
nesouhlasila v součtu. Proto se gross počítá ze **zaokrouhlených částí**.

**Migrace `20260817150000_partner_invoice_money_rounding.sql`** (aplikováno pouze na staging)
opravuje `create_partner_invoices_for_last_week`, `create_partner_invoices_for_period`
a `generate_partner_invoice` na:

```
amount_net   = round(coins_total * price_per_coin, 2)
vat_amount   = round(amount_net * vat_rate, 2)     -- z už zaokrouhleného netto
amount_gross = round(amount_net + vat_amount, 2)   -- nikdy vlastním vzorcem
amount_ex_vat = amount_net ·  amount_inc_vat = amount_gross
```

`create_partner_offer_invoices_for_period` **záměrně nezměněna** — audit potvrdil, že je už
správně: její `net_amount` je `numeric(12,2)`, a pro netto přesné na 2 desetinná místa platí
identita `round(net*1.21, 2) = net + round(net*0.21, 2)`.

**Nezměněno:** `vat_rate`, `price_per_coin`, cena MioCoinu, období, číslování faktur, status
logika, řádky faktury, affiliate provize, signatury funkcí ani jejich EXECUTE granty.
**Žádná historická data se neupravovala** — migrace neobsahuje jediný `UPDATE` ani backfill.

**Staging test (skutečná fakturační cesta):** aktivace 0,6 + 1,2 + 2,5 MC = **4,3 MC**,
`price_per_coin = 1 Kč`, `vat_rate = 0,21`:

| sloupec | hodnota |
|---|---|
| `coins_total` | `4.3` |
| `amount_net` | **`4.30`** |
| `amount_ex_vat` | **`4.30`** |
| `vat_amount` | **`0.90`** |
| `amount_gross` | **`5.20`** |
| `amount_inc_vat` | **`5.20`** |
| `amount_gross = amount_net + vat_amount` | **true** |

Skutečné PDF (HTTP 200, 28 197 B, `%PDF-1.7`) ukazuje `Celkem coinů: 4,3`,
`Cena bez DPH: 4,30 CZK`, `DPH 21 %: 0,90 CZK`, `Cena s DPH: 5,20 CZK` a řádky `0,6 / 1,2 / 2,5`.

Ověřeno i na dalších částkách se třetím desetinným místem (`12,7 × 0,99`, `100,5 × 1,15`,
`33,3 × 3,33`, `250,4 × 1,07`, `1000,9 × 0,55`, `4,9 × 9,99`): vždy platí
`gross = net + DPH` a žádná CZK hodnota nemá víc než 2 desetinná místa.

### Fakturační funkce jsou interní (service_role only) — OPRAVENO na stagingu (17. 8. 2026)

**Oprava dřívějšího předpokladu:** produkce **nikdy nebyla plně zamčená**. Repo migrace
`20260718090000_lock_partner_invoice_weekly_function.sql` zamyká **jedinou** funkci
(`create_partner_invoices_for_last_week()`). Read-only kontrola produkce potvrdila:

| funkce | anon | authenticated | service_role |
|---|---|---|---|
| `create_partner_invoices_for_last_week()` | NE | NE | ANO |
| `create_partner_invoices_for_period(date,date)` | **ANO** | **ANO** | ANO |
| `generate_partner_invoice(uuid,date,date)` | **ANO** | **ANO** | ANO |
| `run_monthly_partner_invoicing(date,date)` | **ANO** | **ANO** | ANO |

Na stagingu byly otevřené všechny čtyři. Tyto funkce zakládají `partner_invoices`, přidělují
čísla faktur a přepínají `partner_coin_activations.invoiced` — tedy fakturují partnerovi.
Kdokoli s veřejným anon klíčem je mohl volat přes PostgREST.

**Audit callerů (repo + DB) — žádný browser/user caller neexistuje:**

- `create_partner_invoices_for_last_week()` — cron job 17 `weekly_partner_invoices` →
  `run_partner_invoice_weekly_automation()` (SECURITY DEFINER, Vault token) →
  Edge Function `partner-invoice-auto-send` (klient se `SUPABASE_SERVICE_ROLE_KEY`) → funkce.
- `create_partner_invoices_for_period(date,date)` — jen `tests/e2e/43-partner-invoices.spec.ts`
  přes `E2E_SUPABASE_SERVICE_ROLE_KEY`.
- `generate_partner_invoice(uuid,date,date)` — jen `run_monthly_partner_invoicing(date,date)`.
- `run_monthly_partner_invoicing(date,date)` — **žádný caller** (v `src/` jen generovaný
  `types.ts`).

V `src/` nevolá tyto funkce nic — frontend, admin i partner portál faktury pouze čtou z tabulek.

**Migrace `20260817160000_lock_partner_invoice_creation_functions.sql`** (aplikováno na staging
**i na produkci** — viz níže) zamyká všechny čtyři: `REVOKE ALL ... FROM PUBLIC, anon, authenticated` +
`GRANT EXECUTE ... TO service_role`. `run_monthly_partner_invoicing` je zahrnutá, protože je
SECURITY INVOKER a jen obaluje `generate_partner_invoice` — ponechat ji otevřenou by z díry
udělalo jen matoucí runtime chybu. Starší migrace `20260718090000` **nebyla přepsána**;
nová je idempotentní (`to_regprocedure` guard), takže na už zamčené DB projde.

**Nezměněno:** těla funkcí, výpočty, fakturační data, RLS, status logika, číslování faktur.
Žádný `UPDATE`, `DELETE` ani backfill.

**Skutečné ověření na stagingu** (ne jen ACL tabulka; vše v transakci s rollbackem, argumenty
zvolené tak, aby ani při průchodu nevznikla faktura):

| funkce | anon | authenticated | service_role |
|---|---|---|---|
| `create_partner_invoices_for_last_week()` | `42501` | `42501` | **proběhlo** (0 draftů) |
| `create_partner_invoices_for_period(date,date)` | `42501` | `42501` | **proběhlo** (no-op) |
| `generate_partner_invoice(uuid,date,date)` | `42501` | `42501` | **proběhlo** — došlo až do těla (`P0001 Partner not found`) |
| `run_monthly_partner_invoicing(date,date)` | `42501` | `42501` | **proběhlo** (no-op) |

ACL po migraci u všech čtyř: `postgres=X/postgres | service_role=X/postgres`.

**Produkce `xkzhjldrojjlrkezorey` — APLIKOVÁNO** (17. 08. 2026, po výslovném schválení Pavla).
Read-only postcheck 17. 08. 2026 potvrdil u všech čtyř funkcí `anon=false`,
`authenticated=false`, `service_role=true`, ACL `postgres=X/postgres | service_role=X/postgres`.
Fakturační data se nezměnila — migrace mění výhradně oprávnění.

> Dřívější zápisy na této větvi tvrdily, že jde o staging-only migraci. To už neplatí a bylo
> opraveno; produkce byla před touto migrací zamčená jen částečně (pouze weekly funkce přes
> `20260718090000`), zbylé tři byly volatelné `anon` i `authenticated`.

**PRODUKCE touto migrací NENÍ změněna** — tam jsou `create_partner_invoices_for_period`,
`generate_partner_invoice` a `run_monthly_partner_invoicing` **stále otevřené pro anon
i authenticated**.

### Ověřený produkční bug (read-only audit `xkzhjldrojjlrkezorey`, 16. 8. 2026)

`public.compute_partner_reward` vrací `floor(v_total_mc)::integer`, a celý partnerský coin
řetězec je v produkci `integer`:

| sloupec | produkční typ |
|---|---|
| `partner_reward_codes.coins` | `integer` |
| `partner_coin_activations.coins` | `integer` |
| `partner_invoice_lines.coins` | `integer` |
| `partner_invoices.coins_activated` | `integer` |
| `partner_invoices.coins_total` | `numeric` ✅ |
| `wallets.balance_coins` / `bonus_balance_coins` | `numeric(10,2)` ✅ |
| `wallet_transactions.amount` | `numeric` ✅ |

BOHEMIA INFINITY má `reward_mode='selected_products'` a jediné aktivní produktové pravidlo
(produkt `64`, `fixed_mc = 1.1`). Jakákoli odměna pod 2 MC se dnes zaokrouhlí dolů, sub-1 MC
odměna spadne na 0 → widget nic nezobrazí a reward code nemůže vzniknout.

### Co je připraveno v repozitáři (neaplikováno)

- `supabase/migrations/20260817100000_miocoin_one_decimal_columns.sql` — 4 coin sloupce
  `integer → numeric`, CHECK `= round(x,1)`, CHECK min 0,5 + 1 desetinné místo na
  `partners.reward_mc`, `partner_product_reward_rules.fixed_mc`/`ratio_mc`,
  `shoptet_connection_requests.reward_mc`, helper `miocoin_min_partner_reward_mc()`.
- `supabase/migrations/20260817110000_compute_partner_reward_one_decimal.sql` — engine vrací
  `round(v_total_mc, 1)` jako `numeric`, `issuable`/`min_reward_mc`, per-položkový `mc_display`.
- `supabase/migrations/20260817120000_partner_reward_issuance_one_decimal.sql` —
  `create_partner_order_reward` (numeric coins + práh 0,5),
  `generate_partner_reward_code` (`integer → numeric` + stejná validace),
  `update_partner_order_reward_status` (zákaznický e-mail přes `format_miocoin_cz`),
  nový `public.format_miocoin_cz(numeric)`.
- `supabase/migrations/20260817130000_drop_legacy_partner_coin_bypass.sql` — drop legacy
  druhého reward enginu (viz níže).
- `supabase/migrations/20260817140000_payment_credit_miocoin_one_decimal.sql` — normalizace
  MioCoin veličin odvozených z `payments.amount` (viz níže). **Aplikováno na staging.**
- `supabase/migrations/20260817150000_partner_invoice_money_rounding.sql` — CZK částky
  partnerských faktur na 2 desetinná místa (viz níže). **Aplikováno na staging.**
- `supabase/migrations/20260817160000_lock_partner_invoice_creation_functions.sql` — fakturační
  funkce jen pro `service_role` (viz níže). **Aplikováno na staging i na produkci.**
- `supabase/migrations/20260817170000_build_isdoc_payload_real_invoice_fields.sql` — ISDOC payload
  vrací skutečná fakturační pole (viz níže). **Aplikováno na staging.**
- Frontend/EF: `src/lib/miocoin.ts` (sdílený formátovač + validátor), `public/shoptet-widget.js`
  (české desetinné čárky a skloňování), `partner-reward-preview` (odstraněn `Math.floor`),
  `generate-partner-invoice-pdf` (`formatCoins`, oprava sčítání numeric stringů),
  `PartnerDashboard` / `AdminInvoices` / `AdminPartnersPortal` / `RedeemMioCoinCard`.
- Testy: nový `tests/e2e/130-miocoin-one-decimal.spec.ts`, nový
  `tests/e2e/131-isdoc-partner-invoice.spec.ts`, upravený spec 125.

### Read-only audit existujících dat

Žádná partnerská MioCoin hodnota v produkci nemá dnes více než 1 desetinné místo, takže migrace
nemůže poškodit historická data (12 partnerů, 1 produktové pravidlo, 13 reward kódů,
4 aktivace, 1 fakturační řádek, 6 faktur — vše v pořádku).

### Legacy druhý reward engine — ODSTRANĚN (migrace připravena, nenasazeno)

`public.activate_partner_coins_from_order(uuid, uuid, text, numeric)` počítala odměnu sama
(`ROUND((amount / reward_base_czk) * reward_mc, 1)`) a zapisovala rovnou do
`partner_coin_activations` — druhý reward engine mimo `compute_partner_reward`.

**Migrace `20260817130000_drop_legacy_partner_coin_bypass.sql` obě funkce dropuje** —
`api_activate_partner_coins(text, uuid, text, integer)` (tenký wrapper) i samotný bypass.
Nepřesměrovává se: přesměrování na engine by udrželo naživu paralelní vydávací cestu, která
stejně obchází vydání kódu, práh 0,5 MC i logiku reward módů, tedy druhý způsob, jak partnerovi
fakturovat. Migrace obsahuje guard, který ji přeruší, kdyby se objevil nový volající.

**Audit závislostí (read-only produkce):** SQL volající pouze `api_activate_partner_coins`
(ten sám nemá volajícího) · triggery 0 · views 0 · RLS policy 0 · column defaults 0 · pg_cron 0 ·
repo 0 (jen generovaný `types.ts`) · řádků vzniklých touto cestou **0** (všechny 4 aktivace mají
`code`, tedy pocházejí z `log_partner_coin_activation_from_reward`).

**Vedlejší bezpečnostní přínos:** obě funkce měly `EXECUTE` pro `PUBLIC`/`anon`/`authenticated`
a wrapper byl `SECURITY DEFINER` — kdokoli s partnerským API klíčem mohl obcházet RLS a zakládat
fakturovatelné aktivace. Drop to zavírá.

### Platba → MioCoin → peněženka — BUDOUCÍ ZDROJ OPRAVEN (migrace připravena, nenasazeno)

**`payments.amount` je počet MioCoinů, ne CZK.** `stripe-webhook` počítá
`priceCzk = amount_total / 100` (celé Kč, jinak platbu odmítne) →
`coinsToCredit = miocoinsForCzkPrice(priceCzk)` (50→50, 300→310, 500→525, 1200→1280, jinak 1:1)
→ `payments.insert({ amount: coinsToCredit })`. **CZK cena se do `payments` neukládá vůbec**,
zůstává ve Stripe; `numeric(18,2)` je jen historický pozůstatek. Všech 136 reálných plateb
(`stripe`/`stripe_test`) je celé číslo; jediné dva nekonformní řádky jsou `method='test'`
a `method='test_crud'`, oba `999.99` — testovací data.

Mezi `payments` a `wallets` ale hodnotu nic nenormalizovalo, takže jakýkoli jiný zapisovatel
`payments` mohl vložit dvoudesetinnou MC hodnotu rovnou do `wallets.balance_coins` — přesně tak
vznikl řádek 999,99 MC. **Migrace `20260817140000_payment_credit_miocoin_one_decimal.sql`**
normalizuje všechny tři MioCoin veličiny odvozené z `payments.amount`:

1. `update_wallet_after_payment` — kredit `round(NEW.amount, 1)`; do `balance_coins` i do
   `wallet_transactions.amount` jde normalizovaná hodnota, syrová částka zůstává jen v metadatech.
2. `prepare_stripe_refund` — odečet `round(v_payment.amount, 1)`, **musí být symetrický**
   s kreditem, jinak by refundace nechala v peněžence zlomkový zbytek.
3. `create_referral_reward_from_payment` — `ROUND(amount * 0,05, 2)` → `ROUND(..., 1)`.
   `referral_rewards.reward_mc` je MioCoin veličina, která se do peněženky skutečně dostane
   (`try_credit_wallet_mc`), a balíček 500 Kč (525 MC) dával `26,25 MC` — **reálné porušení
   pravidla mimo testovací data.** Provizní sazba 0,05 se nemění.

**Peníze nejsou dotčeny:** `payments.amount` si drží `numeric(18,2)` a **nedostává CHECK**
(na dvou testovacích řádcích by selhal a testovací data se před spuštěním resetují).
Fakturační částky, DPH a `price_per_coin` zůstávají na 2 desetinných místech.

**Pro každou reálnou platbu platí `round(x, 1) = x`, takže se chování živých dat nemění.**

### ⚠️ OPEN ISSUE — 2 wallet řádky se 2 desetinnými místy (testovací data)

`wallets.balance_coins` má **1 řádek `10117.91`** a `wallet_transactions.amount` má
**1 řádek `999.99`** (2026-03-16, `method='test'`); `payments` má 2 řádky `999.99`
(`test`, `test_crud`) a `referral_rewards` 1 řádek s 2 desetinnými místy.
**Nic se nemigrovalo, nezaokrouhlovalo ani nemazalo** — opravený je pouze budoucí zdroj.
Tato data budou před ostrým spuštěním resetována. Peněženkové sloupce proto záměrně nedostaly
CHECK na 1 desetinné místo.

### ISDOC export — VYŘEŠENO, ověřeno na stagingu proti oficiálnímu XSD (17. 08. 2026)

Dřívější OPEN ISSUE („ISDOC plete množství a částku“) je uzavřený — viz sekce 0d níže.

---

## 0d. ISDOC 6.0.1 partnerská faktura — OPRAVENO A **NASAZENO NA PRODUKCI** (17. 08. 2026)

**Nasazeno na staging `dxmowysntemfqfnanxua` (EF v15) i na produkci `xkzhjldrojjlrkezorey`
(EF v179), po výslovném schválení Pavla.** Obě prostředí mají shodný `ezbr_sha256`
`97eec29e…`, tedy bit po bitu tentýž kód.

### Co bylo špatně

Původní `generate-isdoc` (staging v14) nebyl použitelný účetní doklad:

| chyba | dopad |
|---|---|
| `<InvoicedQuantity>` natvrdo `1`, počet MioCoinů v `<LineExtensionAmount>` | 4,3 MC se četlo jako „4,30 Kč za 1 kus“ — množství vydávané za peníze |
| dodavatel natvrdo „OneMil s.r.o., Na příkopě 1, Praha“ | **neexistující právnická osoba**; OneMil je značka `iCONIC POINT s.r.o.` |
| číslo faktury `INV-<rok>-<8 znaků uuid>` | vymyšlené — `partner_invoices.invoice_number` (`OMA-20260001`) se ignorovalo |
| `IssueDate`/`TaxPointDate` = dnešek, splatnost = dnešek + 14 | doklad se měnil podle dne exportu, ne podle faktury |
| `<Percent>0.21</Percent>` | ISDOC chce sazbu v procentech (`21`), ne zlomek |
| chybějící povinné elementy (`UnitPrice`, `UnitPriceTaxInclusive`, `LineExtensionTaxAmount`, `ClassifiedTaxCategory`, …), `Item/Name` (v `ItemType` neexistuje), `currencyID` atributy | **soubor neprošel validací proti XSD** |
| **žádná vnitřní autorizace**, spoléhalo se jen na `verify_jwt` | kterýkoli přihlášený uživatel mohl exportovat cizí partnerskou fakturu |

### Oprava

- **`supabase/migrations/20260817170000_build_isdoc_payload_real_invoice_fields.sql`**
  (aplikováno na staging) — čistě aditivní: payload nově vrací `invoice_number`,
  `variable_symbol`, `issue_date`, `due_date`, `taxable_date`, `price_per_coin`,
  `coins_activated` a per-řádek `unit_price_czk`. Money klíče zůstávají **holé odkazy na
  sloupce** `partner_invoices` — funkce nic nepočítá a nemá žádný zápis.
- **`supabase/functions/generate-isdoc/index.ts`** přepsán (staging **v15**,
  `verify_jwt: false`, autorizace uvnitř). Prvky i jejich **pořadí** odpovídají `xs:sequence`
  z oficiálního XSD.

### Ověření skutečným souborem (ne unit testem stringu)

Faktura vytvořena **reálnou fakturační cestou**: 3 odměny 0,6 + 1,2 + 2,5 MC z
`compute_partner_reward` → `redeem_miocoin_code` zákazníkem → `create_partner_invoices_for_period`
(1,00 Kč/MC, 21 %). DB: `coins_total 4.3` · `amount_net 4.30` · `vat_amount 0.90` ·
`amount_gross 5.20`. `.isdoc` vygenerován **nasazenou** staging funkcí, stažen ze Storage a:

- **XSD 6.0.1: VALID** (`xmllint`, oficiální `isdoc.cz/6.0.1/xsd/isdoc-invoice-6.0.1.xsd`).
  Validátor ověřen negativními kontrolami nad **týmž souborem** — přehození `UnitPrice`,
  odebrání povinného elementu, vrácení `currencyID`, cizí element i nečíselná částka
  vždy INVALID.
- **Schematron NESPUŠTĚN** — oficiální `.sch` se nikde nepublikuje: `isdoc.cz/6.0.1/…sch`
  ve variantách `/`, `/xsd/`, `/sch/`, http i https vrací **HTTP 404**, zatímco `.xsd` na
  témže hostu vrací 200. Pravidla, která by Schematron kontroloval, jsou proto ověřena
  přímo ve spec 131.
- Součty: `4.30 + 0.90 = 5.20` přesně v setinách; `TaxSubTotal`, `LegalMonetaryTotal`
  i `PayableAmount` sedí na řádek; `4.3 ks × 1.00 Kč = 4.30 Kč`.

**Autorizace ověřena živě** proti nasazené funkci — 5 případů:
bez auth → `401 missing_authorization` · špatný `x-internal-token` → `401` ·
anon klíč jako bearer → `401 invalid_authorization_token` ·
**skutečný přihlášený běžný uživatel → `403 access_denied_superadmin_only`** ·
superadmin → `200`. Interní token (Vault, přes `pg_net`) → `200`.

### Bankovní údaje

`COMPANY_CONTEXT.md` zakazuje ukládat bankovní spojení do repozitáře. `PaymentMeans` je
v ISDOC volitelný (`minOccurs="0"`), a jeho vyplnění by vyžadovalo celou skupinu `BankAccount`.
**Vymyslet účet kvůli schématu je horší než vynechat volitelný blok**, takže se `PaymentMeans`
negeneruje; datum splatnosti nese `Note`. Spec 131 hlídá, že se do souboru ani do zdroje
nedostane IBAN, `BankAccount` ani vzor `účet/kód banky`.

### Úklid

Testovací partner, 3 reward kódy, 3 aktivace, faktura, 2 řádky `partner_invoice_exports`,
2 objekty ve Storage a probe uživatel **smazány** (postcheck 0 u všech). Odeslané e-maily: **0**.
Peněženkový ledger **nebyl obcházen** — `wallet_transactions` je immutable triggerem a kredit
4,3 MC byl skutečnou redemption, takže zůstává.

### Produkční rollout (17. 08. 2026, výslovné schválení Pavla)

**⚠️ Produkce byla na tom hůř než staging.** `generate-isdoc` v178 měla `verify_jwt=false`
**a žádnou vnitřní autorizaci** — byla tedy zcela veřejná. Ověřeno probem PŘED nasazením:
POST bez jakékoli auth hlavičky prošel až do business logiky (`500 Invoice not found`), takže
se skutečným `invoice_id` by komukoli na internetu vygenerovala cizí partnerskou fakturu.

| krok | výsledek |
|---|---|
| migrace `20260817170000` | `{"success": true}` |
| EF deploy | **v179 ACTIVE**, `verify_jwt=false`, `ezbr_sha256` shodný se staging v15 |
| tentýž probe po nasazení | **`401 missing_authorization`** — díra uzavřena |
| špatný `x-internal-token` / nesmyslný bearer | `401` / `401 invalid_authorization_token` |

**Pozitivní ověření skutečnou produkční fakturou `OMA-20260003`** (BOHEMIA INFINITY,
3 MC, `3.00 / 0.63 / 3.63`): soubor vygenerován nasazenou produkční funkcí přes interní
token, stažen ze Storage a **XSD 6.0.1: VALID**. Obsahuje skutečné `OMA-20260003`, VS
`20260003`, `IssueDate 2026-07-06` a `TaxPointDate 2026-07-05` — **různá data**, což
prokazuje čtení skutečného `taxable_date`; stará verze psala do obou dnešek. Řádek:
`3 ks × 1.00 Kč = 3.00`, DPH `0.63`, celkem `3.63`, dodavatel `iCONIC POINT s.r.o.`
(IČO 17795851), odběratel `BOHEMIA INFINITY s.r.o.`

**Ověřovací artefakt uklizen** — storage objekt i řádek `partner_invoice_exports` smazány.
Postcheck: 6 faktur, 14 exportů, 0 isdoc exportů (přesně výchozí stav), `OMA-20260003`
nezměněna. Žádná fakturační data se nezměnila; migrace mění jen tělo read-only funkce.

**Rollback:** předchozí zdroj EF uložen jako
`ROLLBACK-prod-v178-generate-isdoc.ts` (scratchpad); `build_isdoc_payload` lze vrátit na
tvar vracející jen období/totaly/řádky. Rollback EF by ale **znovu otevřel veřejný endpoint**
— při jakémkoli návratu je nutné zachovat `authorizeRequest`.

**Frontend:** volání v `AdminInvoices.tsx` zůstává zakomentované; ISDOC tlačítko se nezapínalo.
Pokud se v budoucnu zapne, musí volat s JWT superadmina (funkce má fallback větev).

---

## 0a. Partnerské produktové MioCoin odměny + Shoptet widget — HOTOVO A ŽIVĚ OVĚŘENO (16. 8. 2026)

**Celá funkce je dokončená a běží v produkci.** Backend je LIVE na `xkzhjldrojjlrkezorey`
(výslovné schválení Pavla), staging `dxmowysntemfqfnanxua` má totéž, a **Lovable Publish už
proběhl — frontend i widget jsou nasazené a na reálném Shoptetu funkční.**

Ověřeno 16. 8. 2026 přímo proti produkci: `https://onemil.cz/shoptet-widget.js` vrací 200 a je
**byte-identický s `main` (`f31d3937`)** (až na CRLF) — obsahuje finální text „Dárek od nás“,
outline ikonu dárku i logiku produktových karet; `https://onemil.cz/miocoin-icon.png` vrací 200
(5 725 B). Chování ověřeno na živém Shoptetu `809915.myshoptet.com`, desktop i mobil.

**Produkční main: `f31d3937`.**

### Co widget zobrazuje (vše ověřeno na reálném e-shopu)

1. **Produktové karty** ve výpisu kategorie / homepage — odměna je vidět **před rozkliknutím**.
2. **Detail produktu** — badge u názvu produktu.
3. **Košík a checkout** — informace o odměně za nákup.

### Finální vzhled v košíku/checkoutu (neměnit bez nového schválení)

```
[outline ikona dárku]  Dárek od nás: [MioCoin ikona] X MioCoinů do soutěží OneMil
```

- Jednoduchá **outline** ikona dárku (inline SVG, `fill="none"`, tenký tmavý tah, 26 px).
  Nekopíruje žádný Shoptet asset; inline SVG šetří request i druhý publikovaný soubor.
- **Originální** MioCoin ikona `public/miocoin-icon.png` (17 px) těsně před částkou.
  Nevytvářet nové MioCoin logo ani symbol.
- Zvýrazněný je **pouze počet MioCoinů** (`#BD6400`), tělo textu je tmavé (`#2E2E2E`).
- **Žádný box, rámeček ani gradient**, průhledné pozadí — žádný zásah do grafiky e-shopu.
- Umístění: **pod souhrnem ceny, nad tlačítkem POKRAČOVAT**.
- **Widget nikdy nesmí být uvnitř CTA** (`button`, `a`, `[role=button]`, `.btn`,
  `.next-step-forward`, `.next-step-back`). Hlídá spec 129 plus runtime guard v `render()`,
  který uzel odstraní, kdyby ho neznámá šablona přesto dostala dovnitř tlačítka.

### Klíčové widget commity

| commit | co přinesl |
|---|---|
| `cc44b02f` | MioCoin ikona + odměny na produktových kartách |
| `9ab78321` | checkout widget přesunut **mimo** CTA (dřív se vykresloval uvnitř tlačítka POKRAČOVAT) |
| `f31d3937` | finální vzhled „Dárek od nás“ |

### Produkční nasazení (16. 8. 2026)

**Migrace (v tomto pořadí):** `20260816100000` → `20260816110000` → `20260816120000`.
**Edge Functions:** `partner-reward-preview` (nová, `verify_jwt=false`), `import-shoptet-orders`,
`partner-activate`.

**Baseline před zásahem a po úklidu je identický:** 13 reward codes / 181 coins /
checksum `d0d4d588857649f771c203dd21069101`; wallets `138474.41`; 4 aktivace; 138 plateb.
Ověřovací data (throwaway partner) byla po testech odstraněna, žádné reziduum.

**Parita engine vs. původní vzorec ověřena na všech 8 reálných partnerech** (včetně BOHEMIA 100/5
a partnera s 99/10, i na necelé částce 317,50 Kč) — `floor(total/base*mc)` == engine, beze změny.

**Nález při dry-runu BOHEMIA (zlepšení, ne regrese):** reálný export BOHEMIA má 15 CSV řádků, ale
jen **5 objednávek** (DEMO000001–05, 3 položky na objednávku) — export je tedy už teď položkový.
Původní kód považoval každý řádek za samostatnou objednávku a volal RPC 15×; zachránil ho jen
idempotenční guard. Nový kód správně seskupí na 5. Výsledek obou běhů shodný: 0 created, 0 failed.

**Živý cron ověřen po nasazení:** běh 16. 8. 2026 09:15 UTC (job 26, `*/15 * * * *`) —
`trigger=cron, mode=live, status=ok`, 15 řádků → **5 objednávek**, 0 invalid, 0 created,
5 status_updated, 0 failed. Automatická produkční cesta funguje s novým importérem.
Baseline po tomto běhu stále 13 / 181 / `d0d4d588857649f771c203dd21069101`.

Cíl: partner může měnit globální konverzi za provozu, odměňovat celý e-shop / jen vybrané produkty /
celý e-shop s výjimkami, a zákazník vidí v Shoptetu (produkt + povinně košík) přesně tolik MioCoinů,
kolik mu OneMil po objednávce skutečně vydá.

### Checklist fází

- [x] **datový model** — `20260816100000_partner_product_reward_rules.sql`
- [x] **shared reward engine** — `20260816110000_compute_partner_reward_engine.sql`
- [x] **create_partner_order_reward integration** — `20260816120000_create_partner_order_reward_items.sql`
- [x] **Shoptet item CSV parser** — `import-shoptet-orders/csv.ts` + spec 124 (9 zelených)
- [x] **partner product UI** — režim + pravidla v `PartnerDashboard` (rozšíření stávající sekce konverze)
- [x] **Partner Order API items** — `partner-activate` přijímá volitelné `items[]`
- [x] **widget preview endpoint** — EF `partner-reward-preview` (produkce i staging ACTIVE, verify_jwt=false)
- [x] **Shoptet widget snippet** — `public/shoptet-widget.js` (badge u produktu + povinný košík)
- [x] **E2E** — specy 123–129, 51 zelených
- [x] **production validation** — 3 migrace + 3 Edge Functions nasazeny a ověřeny na produkci (16. 8. 2026, schválení Pavla)
- [x] **frontend Lovable Publish** — proběhl; produkce servíruje widget shodný s `f31d3937`
- [x] **widget na produktových kartách / detailu / v košíku** — ověřeno na `809915.myshoptet.com`

**Funkce je uzavřená.** Otevřený zůstává jen jeden nález — viz „Otevřený problém: idempotence“ níže.

### KRITICKÝ INVARIANT (neměnit)

Existuje **jediný** výpočet odměny: `public.compute_partner_reward(uuid, numeric, jsonb)`.
Volají ho `create_partner_order_reward` (skutečné vydání MC) i widget preview endpoint
`partner-reward-preview` (zobrazení zákazníkovi). **Widget nesmí počítat MioCoiny sám** a nikde
nesmí vzniknout druhý výpočet — ani v TypeScriptu, ani ve widget JS, ani v jiné RPC. Jinak se to,
co zákazník vidí v košíku, rozejde s tím, co skutečně dostane. Widget smí pouze sestavit vstup
(SKU, množství, cena po slevě, `order_total_czk`) a zobrazit vrácené číslo.

### ⚠️ OTEVŘENÝ PROBLÉM: idempotence je vázaná na partnera, ne na e-shop (nález 16. 8. 2026)

**Nic z toho zatím není opravené — jde o zaznamenaný požadavek, ne o provedenou změnu.**

Ochrana proti duplicitě objednávky dnes používá dvojici **`partner_id + external_order_id`**
(unikátní index `idx_partner_reward_codes_order_api_idempotency` + advisory lock v
`create_partner_order_reward`).

**Co se stalo:** nový Shoptet e-shop **téhož partnera** začal číslovat objednávky od začátku a
znovu použil číslo `2026000001`. OneMil ji podle dvojice `partner_id + external_order_id`
vyhodnotil jako **už existující objednávku**, vrátil `duplicate: true` a **novou MioCoin odměnu
nevytvořil**.

**Potvrzený produktový požadavek:** jedna partnerská firma může provozovat a připojit **více
samostatných e-shopů**. Čísla objednávek jsou proto unikátní jen v rámci jednoho e-shopu, ne
v rámci firmy.

**Cílový datový model** musí rozlišovat tři úrovně:

```
partner / firma  →  konkrétní e-shopové napojení  →  objednávka
```

Idempotence má být svázaná s **konkrétním e-shopovým napojením + `external_order_id`**, nikoli
s `partner_id + external_order_id`.

**Dotčená místa, až se to bude řešit** (dnes nezměněná): unikátní index na
`partner_reward_codes`, advisory lock a duplicate-check v `create_partner_order_reward`,
`shoptet_connection_requests` (dnes 1 napojení na partnera), `import-shoptet-orders`
(dispatch podle `partner_id`), `partner_seen_products` a `partner_product_reward_rules`
(dnes klíčované jen `partner_id`).

Změna se dotkne financí a existujících odměn, takže vyžaduje samostatný návrh, migraci
a výslovné schválení Pavla. **Neopravovat mimochodem.**

### Potvrzená pravidla zakódovaná v engine

- Množství násobí odměnu (SKU = 10 MC, 2 ks → 20 MC).
- Poměrová odměna používá **skutečnou cenu po slevě** (`unit_price_czk` z importu).
- **Zaokrouhlení právě jednou** na součtu celé objednávky, nikdy po položkách.
  Ověřeno: 3× 33 Kč při 100/5 → raw 4,95 → **4 MC** (po položkách by vyšlo 3).
- Párování produktu **výhradně podle kódu/SKU**, case-insensitive + trim; název je jen zobrazovací.
- `whole_shop` ignoruje položky úplně → bit-for-bit původní chování.
- `selected_products` **bez položek odmítne** (`items_required_for_reward_mode`) — tichý fallback na
  celou objednávku by vyplatil pravý opak toho, co partner nastavil.
- `whole_shop_with_exceptions` bez položek bezpečně degraduje na globální sazbu z ceny objednávky.

### Ověření kritického invariantu (16. 8. 2026, staging, uklizeno)

Skutečný end-to-end důkaz, že widget neklame zákazníka — stejný košík poslán do
veřejného preview endpointu i do reálné vydávací cesty:

| krok | widget preview | skutečně vydáno |
|---|---|---|
| ABC123 ×2 (pravidlo 10 MC) + XYZ999 300 Kč (globální 100/5) | **35 MC** | **35 MC** |
| po změně pravidla 10→25 MC a konverze 100/5→100/10 | **80 MC** | **80 MC** |

Starší kód z prvního kroku zůstal na 35 MC se snapshotem `5.0000` — změna nastavení
se zpětně nepromítla.

**Bezpečnost veřejného endpointu ověřena:** GET → 405, neplatné UUID → 400, neznámý
partner → 404, neschválený partner → `enabled:false`. Odpověď neobsahuje export URL,
Vault secret, API klíč ani zákaznická data (leak check prázdný). Endpoint jen čte
(`STABLE`, žádné zápisy, žádné vydávání kódů).

### ⚠️ Nález: `npx tsc --noEmit` je no-op (16. 8. 2026)

Kořenový `tsconfig.json` je solution-style (`"files": []` + `references`), takže
`npx tsc --noEmit` **nekontroluje vůbec nic** — ověřeno tím, že ani
`export const x: number = "není číslo"` v `src/` nevyvolá chybu.

**Správný příkaz je `npx tsc -p tsconfig.app.json --noEmit`.** Ten na `origin/main`
(a54cd022) hlásí **18 předexistujících chyb** (mj. `AddSalesLeadDialog.tsx`,
`LeadCrmPanel.tsx`), které dosud nikdo neviděl. Tato větev přidává **0 nových chyb**
(18 před i po, žádná v dotčených souborech).

Historické zápisy „tsc --noEmit 0 chyb" v dokumentaci jsou proto bezcenné.
Oprava příkazu + 18 chyb je mimo rozsah této větve.

### Staging ověřeno (16. 8. 2026, throwaway partner, uklizeno)

Legacy 5-arg volání RPC dál funguje beze změny (Edge Functions se nemusely měnit); item cesta,
idempotence (`partner_id + external_order_id`, duplicitní volání vrátí stejný kód i coins),
audit snapshot v `metadata` (`reward_mode`, `reward_computed_from`, `reward_items`, `reward_raw_total_mc`),
plnění `partner_seen_products` pro produktový picker.

**Změna konverze za provozu ověřena:** po přepnutí 100/5 → 100/10 a pravidla 10 → 20 MC dostala nová
objednávka 40 MC, zatímco starší kódy zůstaly na 20 a 25 MC s původním snapshotem `5.0000`.
Existující reward codes se **nikdy zpětně nepřepočítávají**.

## 0b. Paperclip marketingový tým OneMil (ověřeno 13. 8. 2026)

Živý Paperclip stav marketingového týmu:

- Hierarchie: Pavel → Provozní ředitel OneMil → Martin – vedoucí marketingu OneMil → Content & Community Planner OneMil / Performance Analyst OneMil.
- **Martin – vedoucí marketingu OneMil** (`be26a7d0-bb12-4720-b535-a1c656f355ae`): `idle`, model `gpt-5.5`, reportsTo Provozní ředitel OneMil, `canCreateAgents=false`, `canCreateSkills=false`, `heartbeat.enabled=false`, budget `0 Kč`. Řídí oba marketingové specialisty a připravuje jeden konsolidovaný marketingový výstup pro Provozního ředitele. OneMil Brand Kit / Brand Manual je závazný zdroj.
- **Content & Community Planner OneMil** (`2c257400-e694-4286-be4a-b015d23221f9`): `idle`, model `gpt-5.5`, reportsTo Martin – vedoucí marketingu OneMil, `canCreateAgents=false`, `canCreateSkills=false`, `heartbeat.enabled=false`, budget `0 Kč`. Připravuje content plány, copy, captiony, CTA, scénáře krátkých videí/Reels/TikTok, kreativní briefy a community návrhy.
- **Performance Analyst OneMil** (`16844c6f-8960-43a8-a71c-f599e33c3ee2`): `idle`, model `gpt-5.5`, reportsTo Martin – vedoucí marketingu OneMil, `canCreateAgents=false`, `canCreateSkills=false`, `heartbeat.enabled=false`, budget `0 Kč`. Řeší KPI, reporting a vyhodnocení výkonu obsahu; dokud nemá skutečná data, nemá zbytečně běhat pravidelně.
- Marketingoví agenti jsou přesně 3, žádná duplicita. Nemají social secrets, publishing práva, ads práva ani možnost utrácet. `ICO-53` už není v permanentních agent instructions; jednorázové úkoly patří do Paperclip issues.
- Magin a Synchronizátor zůstali nedotčeni: jejich modely, permissions, heartbeat, secrets a rutiny nebyly změněny. Žádná nová marketingová rutina nebyla aktivována. Board approval nebyl potřeba, protože nevznikal nový agent.

## 0. Denní e-mailové dávky a propojení pro externího agenta (ověřeno 11. 8. 2026)

Read-only ověřeno přímo na produkci `xkzhjldrojjlrkezorey`:

- **Automatika je zapnutá** (`enabled = true`), pásmo `Europe/Prague`, okno `08:30–16:30`.
- **Denní limit je 90.** Starší dokumentace uvádějící 20 je neplatná; 20 je hodnota stagingu.
- **Worker běží každých 5 minut.** pg_cron job 30 `sales_lead_email_batch_worker_every_5_min`
  (`*/5 * * * *`, aktivní) volá `run_sales_lead_email_batch_worker_cron()`, ta si vezme token a URL
  z Vaultu, ověří, že URL míří na produkční projekt, a zavolá Edge Function
  `process-sales-lead-email-batch` (ACTIVE v10). Za 24 h 288 běhů, všechny `succeeded`.
- **Kapacita okna je těsná.** Worker zpracuje nejvýš jednu položku na běh → v okně 08:30–16:30
  je ~96 slotů. Při cílových 90 e-mailech denně to je ~94 % kapacity, prakticky bez rezervy.
  Sledovat od 17. 8. 2026 (70 e-mailů) výš.
- **Edge Function `sales-lead-daily-batch-agent` je nasazená na produkci** (v1 ACTIVE,
  `verify_jwt=false`, autorizace vlastním secretem `SALES_LEAD_BATCH_AGENT_SECRET`).
  Produkční secret je jiná hodnota než stagingový.
- RPC `sales_lead_email_batch_agent_run(date, integer)`: `SECURITY DEFINER`, `search_path = ''`,
  EXECUTE **pouze `service_role`** (`anon = false`, `authenticated = false`).
- **Bezpečnostní kontroly na produkci prošly** (bez vytvoření dávky): bez secretu → 401,
  špatný secret → 401, GET → 405, nepovolené pole `lead_group` → 400 `unexpected_field`,
  neplatné datum → 400 `invalid_target_date`.
- Po nasazení **nevznikla žádná nová dávka, neodešel žádný e-mail** a pozastavená dávka z 6. 8.
  zůstala pozastavená. Checksum stavů dávek byl před i po nasazení `b42bb7f7…`.
- **Agent Magin je vytvořený a naplánovaný** (Paperclip 2026.722.0, firma `iCONIC POINT s.r.o.`).
  Agent id `3ef09c71-d9a0-43f3-8ce8-c5e9938dae64`, adaptér `codex_local`, search OFF,
  `canCreateAgents=false`, `canCreateSkills=false`, `budgetMonthlyCents=0` (firemní výchozí),
  nadřízený `Provozní ředitel OneMil`. Routine `Denní dávka prvních obchodních e-mailů`
  (`a3ac40b2-7d58-4207-9c5d-1ffc52ee8c8c`, `active`, `catchUpPolicy=skip_missed`,
  `concurrencyPolicy=skip_if_active`) s cron triggerem `30 7 * * 1-5`, `timezone=Europe/Prague`.
  **První ostrý běh 12. 8. 2026 v 7:30 Praha** (`nextRunAt = 2026-08-12T05:30:00Z`), počet 40.
- **Credential je hotový.** `SALES_LEAD_BATCH_AGENT_SECRET` je bezpečně uložený v Paperclip
  credential store (`local_encrypted`, `paperclip_managed`, stav `active`) a **stejná nová hodnota
  je nastavená v produkčním Supabase**. Hodnota vznikla jen v paměti a **není nikde zveřejněná ani
  uložená** — v dokumentaci, gitu, promptu, instrukcích agenta, issue ani logu; Paperclip API ji
  nevrací. Shodu obou uložených hodnot **definitivně potvrdí až první ostrý běh 12. 8. 2026**,
  protože každé úspěšné volání funkce zakládá dávku, a proto se novou hodnotou vědomě nevolalo.
- **Paperclip nepodporuje vlastní profilový obrázek agenta.** Pole `icon` je pevný výčet 41
  vestavěných ikon; `iconAssetId` ani `avatarAssetId` neexistuje (nahrávání obrázků je jen pro
  logo firmy). Magin má proto vestavěnou ikonu `mail` a schválená postavička je uložená jako
  cesta v jeho `metadata.approvedAvatarPath`.
- Schválený profilový obrázek Magina je na cestě
  `C:\Users\divis\Downloads\ChatGPT Image 11. 8. 2026 11_37_39.png` (3D postavička s headsetem).
  **Obrázek MioCoinu se pro Magina nesmí použít**, ani když se automaticky přiloží do konverzace.

## 0c. Paperclip — finální ověřený stav k 11. 8. 2026

Zdroj pravdy pro Paperclip je `PAPERCLIP_SETUP_CONTEXT.md`; tohle je jen shrnutí.

- **Synchronizátor Paperclip OneMil je funkční end-to-end.** Ingest vrátil **HTTP 200**, úkol
  `ICO-41` skončil `done` a ve stagingu vznikl snapshot
  **`7be66d9c-e984-42d3-9d1e-1e5e4001260a`** (`captured_at 17:26:45`, 43 kB).
- **API Access na `PAPERCLIP_BRIDGE_SECRET` funguje** — načtení přes run-bound agent JWT je
  doložené v access-events.
- **Synchronizátor odesílá přes Node fetch, nikdy PowerShell ani `curl.exe`.** Ve Windows sandboxu
  oba selhávají (`curl` vrací `000`, PowerShell hlásí „Nadřízené připojení bylo uzavřeno"),
  přestože síť funguje.
- **Payload kontrakt je `snake_case`** — `source_instance`, **`captured_at`**, `payload`.
  `capturedAt` v camelCase vrací `HTTP 400`.
- **Magin má funkční API Access na `SALES_LEAD_BATCH_AGENT_SECRET`**
  (`access.SALES_LEAD_BATCH_AGENT_SECRET` vázaný na jeho agent id).
- **Magin má funkční API Access na STAGING lead-supply adapter**
  (`access.SALES_LEAD_MAGIN_SUPPLY_AGENT_SECRET` vázaný na jeho agent id). Hodnota secretu není
  v dokumentaci, gitu, promptu, issue ani logu.
- **Maginova rutina používá Node fetch a přesný kontrakt** `sales-lead-daily-batch-agent`:
  `{"schema_version":1,"target_date":"YYYY-MM-DD","requested_count":<počet>}` — jakýkoli klíč navíc
  vrací `400 unexpected_field`; `target_date` je pražské datum.
- **Magin před denní dávkou zajišťuje i zásobu leadů**, ale pouze přes existující OneMil lead-supply
  adapter a existující OneMil discovery systém. Schvaluje jen backendově ověřené návrhy `navrzeny`,
  které adapter dovolí schválit; pokud zásoba nestačí a neběží aktivní discovery job, spustí přes
  adapter discovery job. Segment je pevně `e-shopy` a Magin ho nesmí měnit.
- **Magin je připravený na první ostrý běh 12. 8. 2026 v 7:30 Europe/Prague** (40 e-mailů).
  Skutečným během ověřen **není** a nemůže být — každé úspěšné volání zakládá reálnou dávku.
- **Průzkumník obchodních leadů OneMil byl z Paperclipu odstraněn** 11. 8. 2026. Jeho zastaralý
  paralelní lead-research úkol `ICO-17` byl zrušen/skryt a pending potvrzení odmítnuta.
- **Provozní ředitel OneMil má funkční nouzové upozornění přes Telegram bota `@OneMilDirectorBot`.**
  Používá ho pouze pro chyby, blokace a důležité eskalace podřízených agentů; neposílá běžné statusy,
  marketing ani zprávy leadům. Bot token a `chat_id` jsou uložené pouze v Paperclip `local_encrypted`
  secrets a oba mají **API Access → Bound to latest** pouze pro Provozního ředitele. Testovací zpráva
  byla úspěšně doručena.

## 1. Obchod / Leady – první automatické e-maily jsou produkčně funkční

Automatické dávkové odesílání prvního obchodního e-mailu je na produkci **hotové a ověřené end-to-end**.

Aktuální produkční stav `xkzhjldrojjlrkezorey`:
- `sales_lead_email_automation_settings.enabled = true`.
- Časové pásmo `Europe/Prague`.
- Odesílací okno `08:30–16:30`.
- Automatické/dávkové první e-maily mají globální limit **20 `batch_initial` za den**.
- Ruční první e-maily (`manual_initial`) jsou **bez tohoto limitu** a nesnižují automatickou kapacitu 20.
- Worker cron je aktivní a zpracovává naplánované dávky po jednotlivých položkách.
- Produkčně jsou evidovány úspěšné `batch_initial` deliveries ve stavu `committed`; skutečný test z 9. 8. 2026 proběhl úspěšně.

### Potvrzený produkční E2E test 9. 8. 2026

Dávka `31251e38-e770-455e-aa49-769f614ed7d6` byla naplánovaná pro `eshop@onemil.cz` na 14:54 Praha. Worker ji zpracoval při nejbližším běhu v 14:55.

Výsledek:
- batch `completed`,
- item `sent`,
- `attempt_count = 1`,
- delivery `batch_initial / committed`,
- provider zprávu přijal,
- `provider_accepted_at` i `committed_at` jsou zapsané,
- žádný duplicitní pokus.

Tím je reálně potvrzen celý tok: **příprava → ruční aktivace dávky → cron worker → provider → commit → dokončená dávka**.

## 2. Příprava a aktivace dávky

Aktuální pravidlo:

1. Admin vybere leady, šablonu a datum.
2. `sales_lead_email_batch_prepare_paused(...)` **vždy připraví novou dávku jako `paused`**, a to i když je globální automatika zapnutá.
3. Samotná příprava nikdy nesmí odeslat e-mail.
4. Dávka začne být způsobilá pro worker teprve po výslovném kliknutí **„Spustit dávku“**.
5. Aktivace používá admin RPC `sales_lead_email_batch_activate_admin(...)`.
6. Přímá klientská cesta `sales_lead_email_batch_create(...)` je pro `authenticated` odebraná; klient používá bezpečný wrapper.

Oprava tohoto toku je v PR #334, merge commit `8f1dfa0e7ad9525d6c54dfae42b83255d5873f16`. Migrace `20260809170000_sales_lead_prepare_paused_when_automation_on.sql` je aplikovaná na stagingu i produkci.

## 3. Přepínač automatiky v administraci

Frontend obsahuje stavový panel:
- `Automatika zapnutá` / `Automatika vypnutá`,
- tlačítko pro zapnutí/vypnutí vidí pouze superadmin,
- používá existující `sales_lead_email_automation_set_enabled(boolean)`,
- stav se po změně znovu načte z DB,
- přepínač sám nevytváří, neaktivuje ani neodesílá dávku.

PR #333 je mergnutý. Produkční frontend byl publikován a ovládání je viditelné v administraci.

**Důležité:** backend RPC pro změnu `enabled` je záměrně **superadmin-only**. Nerozšiřovat na běžného admina bez samostatného schválení.

## 4. Denní limit dávkového odesílání

Produkční `sales_lead_email_batch_claim_next()` obsahuje skutečný claim-time limit:
- max. **20 dávkových e-mailů denně**,
- limit je napříč všemi dávkami daného dne,
- rozhoduje `Europe/Prague`,
- po dosažení limitu vrací `noop / daily_limit_reached`, položka zůstává `pending` a nic se neodešle.

Do spotřeby se počítá dávkový tok:
- item `processing`,
- delivery `batch_initial` ve stavu `sending`, `provider_accepted`, `committed`, `uncertain`.

Do limitu se nezapočítává:
- `prepared`,
- `provider_rejected`,
- `manual_initial`.

Ruční odesílání prvního e-mailu zůstává bez limitu.

Produkční migrace byly aplikovány v pořadí:
1. `20260809120000_sales_lead_daily_send_cap.sql`
2. `20260809140000_sales_lead_daily_cap_batch_only.sql`

Race ochrana zůstává přes `FOR UPDATE`; kill-switch se kontroluje před denním limitem i před claimem položky.

## 5. Bezpečnost prvního e-mailu

Před skutečným dávkovým odesláním se znovu kontroluje zejména:
- automatika je zapnutá,
- dávka je `scheduled`,
- položka je ve svém dni a časovém okně,
- lead stále existuje a je v povoleném stavu,
- `do_not_contact` / suppression,
- lead už není partner,
- e-mail se od vytvoření snapshotu nezměnil,
- e-mail je ověřený,
- první e-mail už nebyl odeslán ani bezpečně claimnut,
- lead není v jiné aktivní dávce,
- duplicitní ochrany.

Delivery tok je dvoufázový a idempotentní. Stavy zahrnují `prepared`, `sending`, `provider_accepted`, `committed`, `provider_rejected`, `uncertain`. `uncertain` se automaticky neopakuje. Pokud provider přijal zprávu a DB commit se nedokončil, další běh provádí pouze `commit_only` a provider se znovu nevolá.

## 6. CTA reakce a inbound odpovědi

První obchodní e-mail používá dvě reakce:
- **Mám zájem**,
- **Nemám zájem**.

`Mám zájem` zapisuje reakci, prioritu a posune lead do odpovědního toku. `Nemám zájem` nastaví `do_not_contact`, `nekontaktovat` a suppression, takže další obchodní e-mail nesmí odejít.

Administrace má přehled `Kontaktovat` a `Nekontaktovat` včetně nepřečtených reakcí.

Běžné odpovědi e-mailem jsou přijímány přes Resend Receiving a `sales-lead-inbound`, párují se k leadu a zapisují `reply_received`. Nepřiřazené zprávy se uchovávají v `sales_lead_unassigned_emails`.

## 7. Stav existujících dávek po testech

K poslední kontrole 9. 8. 2026:
- produkce neměla žádnou čekající `scheduled` dávku po dokončení E2E testu,
- existuje jedna stará `paused` dávka s 19 historickými pending položkami; sama se nikdy neaktivuje,
- dřívější testovací dávka `a3b9fda8-a6f9-4bbe-8442-8aec7e555e45` byla cíleně zrušena (`cancelled`, její položka `cancelled`, `pending=0`),
- nová testovací dávka `31251e38-e770-455e-aa49-769f614ed7d6` byla úspěšně dokončena.

Starou paused dávku neměnit/aktivovat bez výslovného rozhodnutí.

## 8. Discovery nových firem

Discovery infrastruktura je postavená, ale kandidátní vyhledávání je aktuálně blokované OpenAI účtem pro staging:
- diagnostika ukázala `openai_http_status = 429`,
- nejde o neplatný klíč (není 401), ale o kvótu/limit/kredit,
- DuckDuckGo fallback z candidate discovery byl odstraněn, protože z Edge runtime vracel anti-bot odpověď a jako pojistka nebyl použitelný,
- OpenAI je nyní jediný candidate source.

**Klíče nyní nerotovat.** Uživatel chce rotaci secretů/klíčů řešit souhrnně až před produkčním spuštěním. Po doplnění/obnovení OpenAI kvóty je potřeba pouze znovu ověřit discovery job a návazný tok; nestavět nový discovery systém.

Paperclip tok pro doplňování zásoby leadů je nyní soustředěný do Magina. Magin nevytváří vlastní
vyhledávání ani databázi; používá jen úzký STAGING adapter `sales-lead-magin-supply-agent`, který
deleguje na existující OneMil mechanismy. Schvalování návrhů jde přes existující schvalovací cestu
po backendové kontrole bezpečně ověřeného veřejného firemního e-mailu; zakládání discovery jobu jde
přes existující OneMil discovery systém a pouze pro segment `e-shopy`. Stávající denní e-mailová
rutina `sales-lead-daily-batch-agent` zůstává beze změny.

## 9. Co ještě chybí k úplnému dokončení automatického obchodního e-mailového procesu

První automatické oslovení je hotové. Zbývají navazující části:

1. **Automatický follow-up** – dnes existuje ruční follow-up cesta, ale není automatické pravidlo/fronta typu „po N dnech bez odpovědi pošli další e-mail“.
2. **Žádná odpověď** – po posledním follow-upu není automatické pravidlo, které lead uzavře/přesune, takže může zůstat `osloveno` dlouhodobě.
3. **Admin řešení `failed / uncertain`** – bezpečnostní stav existuje, ale chybí jasné UI/workflow, kde člověk rozhodne, co s takovou položkou udělat.
4. **Discovery po obnovení OpenAI kvóty** – ověřit, že automatické hledání firem opět vrací kandidáty a navazuje na ověření firemního webu/e-mailu.
5. **Finální celý obchodní E2E** – po dokončení follow-up části otestovat: discovery → ověření kontaktu → první e-mail → reakce / bez odpovědi → follow-up → finální stav leadu.

### Doporučené pořadí další práce

**Nejbližší další modul: automatické follow-upy.**

Před jeho implementací nový chat musí nejdřív read-only ověřit existující:
- `send-sales-lead-follow-up`,
- dostupné typy šablon a jejich aktuální produkční data,
- stavy leadu `osloveno` / `follow_up` / `odpovedel` / `nekontaktovat`,
- `next_action_at` a existující plánované CRM aktivity,
- suppression/do-not-contact ochrany,
- aby se nevytvářel druhý paralelní systém.

## 10. Známý testovací dluh mimo funkční provoz

P0 Smoke E2E měl historicky červené admin specy 29/31/32 kvůli chybějícímu `E2E_SUPERADMIN_*` seedu v `playwright-staging-p0.yml`. Tento problém je testovací infrastruktura, ne chyba dávkového e-mailového systému. Pozdější Smoke pro PR #334 byl zelený.

## 11. Další důležité aktuální části projektu

- Stripe sandbox tok dobití a refundace je otestovaný a funkční; ochrana proti refundaci již utracených MioCoinů je nasazená.
- Android Capacitor aplikace je v `main`, Application ID `cz.onemil.app`; nativní aplikace skrývá Stripe dobíjení podle store pravidel.
- CSP je aktivní; P2 iframe ochrana a P3 `Cross-Origin-Resource-Policy` jsou vědomě odložené, Cloudflare se nyní nezavádí.
- SPF/DKIM/DMARC stav OneMil byl opraven a apex `onemil.cz` má mít právě jeden SPF; SES/Resend patří na `send.onemil.cz`.
- Live Stripe webhook refundních událostí byl dříve evidován jako samostatný otevřený rollout; před změnou vždy ověřit skutečný aktuální Stripe stav, nic nepředpokládat.
- Shoptet samoobslužné napojení zůstává samostatná oblast; při další práci vždy nejdřív ověřit aktuální GitHub stav.

## 12. Pravidlo pro nový chat / nového agenta

Nový chat nesmí znovu stavět již hotový e-mailový systém. Má vycházet z toho, že **produkční první automatické e-maily jsou hotové a reálně fungují**.

Při pokračování:
1. načíst tento `onemil_state.md`, `onemil_history.md`, `CLAUDE.md` a relevantní `docs/SALES_LEADS_ADMIN_SPEC.md`,
2. ověřit aktuální runtime stav přes GitHub/Supabase,
3. pokračovat pouze v otevřených bodech z §9,
4. vždy řešit jeden krok,
5. nevytvářet paralelní e-mailový/discovery systém,
6. destruktivní produkční změny, peníze, RLS a produkční migrace vyžadují výslovné schválení.

> Doplněno z historického auditu (14. 8. 2026): následující 4 sekce z 17.–18. 07. 2026 chyběly v aktuálním stavu, ale nejsou v rozporu s ničím výše — jde o nejstarší dochovaný záznam v tomto souboru.

## PARTNERSKÉ FAKTURY — CRON AUTH FIX (email-queue + offer-reminders) LIVE (18. 07. 2026)

**PR #241 (`fix/cron-internal-token-auth`) je nasazený a ověřený na produkci `xkzhjldrojjlrkezorey`.** Opravuje opakované HTTP 401 dvou nedělně/denně/10min plánovaných automatů, jejichž kořenová příčina byl drift Edge secretu `INTERNAL_FUNCTION_TOKEN` proti Vault secretu `internal_function_token` (cron posílá Vault hodnotu, funkce porovnávaly jen s Edge hodnotou).

- **Migrace `20260718120000_fix_cron_internal_token_vault_auth.sql` aplikována na produkci.** Přidána `verify_internal_function_token(text)` (SECURITY DEFINER, ověřuje token proti Vaultu, EXECUTE jen `service_role`; vzor `verify_shoptet_cron_token`) a Vault dispatcher `run_process_email_queue_cron()`. Cron `process_email_queue_every_10_min` (jobid 16) přepojen na `SELECT public.run_process_email_queue_cron();` — schedule `*/10 * * * *` zachován, žádný nový/duplicitní cron, token není v textu cronu ani v repu.
- **Edge Functions na produkci:** `process-email-queue` **v154** a `send-offer-reminders` **v61** (obě ACTIVE, `verify_jwt=false`) nově přijmou `x-internal-token` ověřený proti Vaultu (stávající env-token / service-role / admin-JWT cesty zachovány). Do `config.toml` doplněn chybějící `[functions.send-offer-reminders] verify_jwt = false`.
- **Ověřeno na produkci:** job 16 v 12:40 UTC vrátil **HTTP 200** `{"success":true,"processed":1,"sent":1,"failed":0}`; fronta `email_queue` pending **2 → 1** (odeslán referral e-mail; zbylý 1 je „faktura …připravena“ bez přílohy, kterou fronta záměrně vynechává pre-existujícím filtrem — mimo tuto opravu). `send-offer-reminders` (denní 08:00 UTC) vrátí 200 při dalším plánovaném běhu; nespouštěno ručně (42 čekajících připomínek). Pravidla připomínek (první po 24 h, další po 7 dnech, pak vždy po 7 dnech, stop po otevření/skrytí) jsou v DB funkci `get_due_offer_reminder_rows()` — beze změny.
- **Pravidlo (neměnit):** funkce ani cron token nehardcodovat; token držet ve Vaultu (`internal_function_token`) a ověřovat přes `verify_internal_function_token`. Cron 16 nepřidávat druhý; schedule `*/10` neměnit.

## SOFINITY `process_event_queue_worker` — NEPOUŽÍVANÁ INTEGRACE, CRON PONECHÁN (18. 07. 2026, jen prošetřeno)

`process_event_queue_worker` **zůstává nezměněný**; jeho cron `process-event-queue` (jobid 23, `* * * * *`) je **stále aktivní a každou minutu vrací HTTP 401** `Unauthorized worker call` (stejný token drift). Read-only audit: `event_queue` má 2577 pending, 20 MB (0,8 % DB), jen 2 nové události za 7 dní (backlog neroste), **0 FK potomků**, jediní konzumenti jsou worker + `sofinity-chat-callback` → čistě (aktivně nepoužívaná) Sofinity integrace bez reálného dopadu na soutěže/peněženky/platby/faktury. **Otevřený bod (neprovedeno):** cron 23 lze bezpečně vypnout (`SELECT cron.unschedule('process-event-queue');`) pro odstranění log šumu; data nemazat, funkci ani token neopravovat. Cron 23 nebyl bez výslovného pokynu měněn.

## PARTNERSKÉ FAKTURY — AUTO-VYSTAVENÍ PŘEPÍNAČ: PRODUKČNÍ BACKEND ROLLOUT (18. 07. 2026)

**PR #240 backend je nasazený na produkci `xkzhjldrojjlrkezorey`.** Superadmin přepínač automatického vystavení + odeslání partnerských faktur.

- **Nastavení:** klíč `settings.partner_invoice_auto_send_enabled`, **výchozí `false` (VYPNUTO)**. Čtení i zápis řídí RLS `settings` (jen superadmin). Přepínač je v `/admin/partners-portal` v záložce Faktury (jen superadmin) — aktivace UI vyžaduje ruční Lovable Publish.
- **Omezení oprávnění:** `is_partner_invoice_auto_send_enabled()` má EXECUTE jen `service_role` (revoke authenticated/anon); `claim_partner_invoice_for_auto_send`, `release_partner_invoice_auto_send_claim`, `run_partner_invoice_weekly_automation` a `create_partner_invoices_for_last_week` — EXECUTE jen `service_role` (anon/authenticated = false).
- **Edge Functions na produkci:** `send-partner-invoice-email` **v149**, `partner-invoice-auto-send` **v2** (obě ACTIVE, `verify_jwt=false`).
- **Cron:** `weekly_partner_invoices` (jobid 17, `0 2 * * 0` zachováno) přepojen na `SELECT public.run_partner_invoice_weekly_automation();` (jediný job).
- **Chování:** VYPNUTO → nedělní automat vytvoří jen `draft` (bez PDF, bez e-mailu). ZAPNUTO → po vytvoření PDF + právě jeden e-mail + stav `issued` **až po úspěchu** (chyba → zůstává `draft`). DB-side dedup: sdílená atomická rezervace `auto_email_sent_at` (ruční „Odeslat e-mailem“ i automat sdílí stejný claim → nikdy dva e-maily); `create_partner_invoices_for_last_week()` vrací ID faktur vytvořených v aktuálním běhu → zpracují se jen ty, staré drafty zůstávají k ručnímu schválení; poslední PDF export se reusuje (žádné duplicitní PDF); `draft → issued` ověřuje přesně 1 změněný řádek. Ruční „Znovu odeslat“ zůstává samostatná superadmin akce. Migrace byla aplikována na produkci dříve; flag zůstává `false`.

## BEZPEČNOSTNÍ OPRAVY ZÁKAZNICKÝCH FLOW (17. 07. 2026)

- **PR #239 — `wallets` přímý INSERT jen s nulovým zůstatkem: LIVE na produkci.** RLS INSERT policy `Users can insert own wallet` nově vyžaduje `auth.uid() = user_id AND balance_coins = 0 AND bonus_balance_coins = 0`; přímý klientský INSERT tak nemůže vytvořit peněženku s nenulovým zůstatkem. Migrace aplikována na produkci (merge `25199f9ca7`); vytváření peněženek jde dál přes `ensure_wallet_exists` (0/0), admin/superadmin a nákupní RPC nedotčeny.
- **PR #237 — soukromí výherců + vlastní tikety: DB část LIVE na produkci.** Na produkci: `get_latest_winners(integer)` odebrán anon/authenticated EXECUTE; nový `get_latest_winners_public(integer)` (anon-callable, sanitizovaný — bez interních UUID, e-mailu, telefonu, poznámek a avatarové cesty s UUID); `tickets`/`winners` mají partner/own-row RLS. Frontend (přepnutí na `get_latest_winners_public`) vyžaduje ruční Lovable Publish; do publishe volá live bundle ještě starou funkci → veřejný feed výherců je do publishe prázdný (viz onemil_history).
- **PR #236 (`buy_ticket_atomic` vždy `auth.uid()` + zápis `wallet_transactions`) a PR #238 (`user_vouchers` INSERT jen pro oblíbené):** mergnuté do `main`, **ověřené na stagingu**; produkční apply migrací v tomto dokumentačním auditu nepotvrzen (zaznamenat jako otevřené před produkčním nasazením).

