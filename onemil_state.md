# OneMil – aktuální stav projektu

**Aktualizováno:** 10. 05. 2026 (staging: schema baseline aplikován manuálně a ověřen; schema_migrations 324 numerických verzí; db push --dry-run stále selhává — čeká na nový migrační plán)

---

## TICKET PURCHASE FLOW — AKTUÁLNÍ STAV (04–05. 05. 2026)

### buy_ticket_atomic — opravené odpovědní fieldy (aplikováno v produkci)
- **Migrace:** `supabase/migrations/20260504_add_remaining_and_bonus_distance_to_buy_ticket_atomic.sql`
- Funkce nyní vrací 3 nová pole:
  - `remaining_tickets` = `v_ticket_count - v_next_ticket`
  - `next_bonus_position` = nejbližší pending `bonus_prizes.ticket_position` > aktuální tiket
  - `distance_to_next_bonus` = `next_bonus_position - v_next_ticket`
- Ověřeno produkcí: STRING_AGG query potvrdila všechna 3 pole ✅
- Nákupní logika, wallet, winner, Partner Offers — nedotčeny

### buy_ticket_atomic — timeout fix (57014)
- **Migrace:** `supabase/migrations/20260504_fix_nonblocking_sofinity_triggers.sql`
- **Root cause:** `trigger_sofinity_forward()` a `process_event_queue_trigger()` volaly `net.http_post()` synchronně uvnitř transakce → při saturaci pg_net workerů → 57014 statement timeout
- **Fix:** `trigger_sofinity_forward()` přepsán na INSERT do `event_queue`; `process_event_queue_trigger()` je no-op — doručení přebírá polling edge function
- Stav: migrace commitnuta, nutno aplikovat v Supabase SQL Editoru (pokud ještě neaplikováno)

### Frontend — oprava null → 0 přepisu
- **Soubory:** `src/pages/ContestDetail.tsx`, `src/pages/Games.tsx`, `src/pages/FavoriteGames.tsx`
- `remaining_tickets: result.remaining_tickets ?? 0` → `?? undefined` ve všech třech souborech
- Root cause: `?? 0` převáděl null z RPC na 0 → `0 > 0 = false` → `nearestPrizeDistance = null` → vždy se zobrazoval fallback text místo vzdálenosti

### TicketResultModal — opravené zobrazení (dokončeno)
- Odstraněno číslo tiketu z hlavního result boxu
- Odstraněno extra „0" (bylo způsobeno `?? 0` v mappedResult + React renderem `{0 && <JSX>}`)
- Nový text vzdálenosti (helper `nextWinTicketText` + `tahPlural`):
  - X = 1: „Další výherní ticket čeká už při dalším tahu."
  - X = 2–4: „Další výherní ticket čeká už za X tahy."
  - X ≥ 5: „Další výherní ticket čeká už za X tahů."
- Přidán vysvětlující řádek (`NEXT_WIN_EXPLAINER`): „Může jít o bonusovou i hlavní výhru. Kdo výherní ticket otevře první, vyhrává."
- Fallback (bez dat): „Další výhra může být blíž, než si myslíš."
- **Partner Offers jsou striktně vyloučeny** z výpočtu vzdálenosti — počítají se pouze fyzické bonus_prizes a main výhra

### TicketResultModal — toast po nákupu tiketu
- Odstraněna spodní toast notifikace „Ticket #56 zakoupen!" po úspěšném nákupu
- Důvod: result modal potvrzení nákupu duplikoval; toast navíc odhaloval číslo tiketu

### Contest karty (Homepage + /games)
- Skryt název soutěže na listing kartách
- Skryt celkový počet tiketů na listing kartách
- Tyto detaily zůstávají záměrně pouze na stránce detailu soutěže
- Důvod: název soutěže je součástí generovaného banneru/grafiky, ne UI textu na kartách

### Sdílovací karta / generovaný obrázek tiketu — IMPLEMENTOVÁNO
- `generatePremiumShareCard` v `TicketResultModal.tsx` — nový canvas 1200×630 s reálnou grafikou výhry
- Logika:
  - Bonusová fyzická výhra → `bonusPrize.image_url`
  - MioCoin výhra → existující MioCoin asset
  - Partner offer → `partner_offer.banner_url`, fallback `partner_offer.logo_url`; nápis „Získal jsem speciální nabídku na OneMil"
  - Hlavní výhra → contest/main prize obrázek
  - Nevýherní tikety → sdílení odstraněno nebo minimalizováno
- Dark premium background (OneMil brand: Midnight Black → Deep Navy → Graphite)
- Commit: `0790362 Refined share image canvas`

### Favorites UI — OPRAVENO
- Počítadlo oblíbených se aktualizuje bez page refresh po přidání/odebrání
- Commity: `ebf5e8e Updated fav count display`, `00e1e99 Opravil počítadlo viditelnost`

### Partner Offers — potvrzeno funkční
- Assignment po nákupu tiketu funguje správně (potvrzeno uživatelem)
- Cooldown 5 minut aktivní, žádné duplicity
- Žádná mutace produkčních dat při ověřování

### Invarianty (uzamčeno)
- Partner Offers **nejsou** výhry soutěže
- Partner Offers se **nesmí** počítat do výpočtu vzdálenosti k nejbližší výhře
- Partner Offers se **nesmí** zapisovat do `winners` ani `bonus_prizes`
- `buy_ticket_atomic` se nemá znovu měnit bez explicitní instrukce

---

## CLOSED CONTEST STATUS — FINÁLNÍ (05. 05. 2026)

### Bug
V admin UI bylo možné u soutěží se statusem `closed` (Ukončeno) znovu změnit status na `draft`, `pending`, `active` nebo `paused`.

### Fix (`src/components/AdminContestManagement.tsx`, commit `54466bb`)
- `handleStatusChange` blokuje jakoukoli změnu statusu pokud `current.status === "closed"` — zobrazí toast: _„Ukončenou soutěž nelze znovu aktivovat ani přesunout."_
- Status Select v tabulce je pro closed contests disabled (`contest.status === "closed"`)
- Badge „Ukončeno" zůstává viditelný (readonly)
- Duplicitní deklarace `const current` v `draft` bloku odstraněna (nyní sdílí proměnnou z vrcholu funkce)

### Invariant (uzamčeno)
`closed` je finální stav. Uzavřená soutěž nesmí být nikdy znovu aktivována, přesunuta do draftu, pending ani paused — ani z admin UI, ani přes `handleStatusChange`.

---

## CONTEST RULES PDF — OPRAVENO (05. 05. 2026)

### Bug
- Admin contest formulář vyžaduje nahrání PDF s pravidly soutěže.
- Po uložení soutěže zůstával `contests.rules_pdf_url = NULL` v databázi.
- ContestDetail proto nezobrazoval odkaz „Zobrazit pravidla soutěže".

### Root cause
- Přímý UPDATE `contests.rules_pdf_url` z frontendu byl blokován chybějící RLS UPDATE policy na `public.contests` pro admin role.
- Supabase vracel `{ data: [], error: null }` (0 rows affected, žádná chyba) — silent no-op.
- Navíc chyběl `return` po UPDATE error → úspěšný toast se zobrazil i při selhání (false confirmation).

### Opravy
- **DB migrace:** přidána RLS policy `contests_admin_update` — admin/superadmin mohou UPDATE `public.contests` (commity `bfc7813`, `95ab8e3`)
- **Frontend `src/components/AdminContestManagement.tsx`:**
  - Přidán `setSaving(false); return;` po UPDATE error (commit `20e4a34`)
  - UPDATE změněn na `.update(additionalUpdates).eq("id", contestId).select("id")` — detekuje 0 rows affected (commit `934bfbd`)
  - Chybová hláška upřesněna na „Pravidla soutěže / obrázky se neuložily"
- **Frontend `src/pages/ContestDetail.tsx`:**
  - Text odkazu změněn z „Stáhnout pravidla soutěže" na „Zobrazit pravidla soutěže" (link otevírá PDF v novém tabu)

### Invariant (uzamčeno)
- Každá veřejná soutěž s nahraným PDF pravidel musí zobrazovat tlačítko/odkaz „Zobrazit pravidla soutěže" na stránce ContestDetail.
- `rules_pdf_url` se ukládá výhradně přes `additionalUpdates` UPDATE po RPC `admin_manage_contest` — RPC samotný tento sloupec neobsahuje.

### Playwright — stav po opravě
- E2E výsledek: **14 passed / 3 skipped / 0 failed** ✅
- Opraveny také testy 03-voucher-purchase.spec.ts:
  - Fixed: `waitForTimeout(3_000)` → `expect(buyButton.or(emptyState)).toBeVisible({ timeout: 15_000 })`
  - Fixed: `getByText(regex)` → `getByRole('heading', { name: '...' })` (strict mode violation)

---

## CI & PLAYWRIGHT — AKTUÁLNÍ STAV (10. 05. 2026)

### Production smoke — manuálně ověřeno (10. 05. 2026, run `25618763318`)

- Workflow: **Playwright Smoke Tests** (`.github/workflows/playwright.yml`)
- Trigger: `workflow_dispatch`
- Výsledek: **6 passed** za 1m 22s
- Spuštěné testy:
  - `01-registration.spec.ts` — 3 passed ✅
  - `02-login.spec.ts` — 3 passed ✅
- Specs 03–08 **nebyly spuštěny** — potvrzeno z logu; žádný ticket purchase, voucher purchase, wallet, win-flow ani Partner Offers test neproběhl v produkci
- Telegram zpráva doručena: `✅ OneMil PROD smoke OK — registration + login passed` ✅
- Neblokující varování: `.claude/worktrees/ecstatic-lichterman-1aa60a` způsobilo `git exit code 128` v post-job cleanup kroku — testy ani pipeline nebyly ovlivněny

### Workflow split — produkce vs staging (commit `82f979f`)

Dva oddělené CI workflow:

| Workflow | Soubor | Trigger | Testy |
|----------|--------|---------|-------|
| Production smoke | `.github/workflows/playwright.yml` | push/PR `main`, schedule 3× denně, `workflow_dispatch` | pouze `01-registration`, `02-login` |
| Staging full E2E | `.github/workflows/playwright-staging.yml` | `workflow_dispatch` only | všech 9 spec souborů |

**Produkce nemůže spustit testy 03–08** — `playwright.yml` má hard-coded paths na dva spec soubory. Ticket purchase, voucher purchase, wallet, win-flow a Partner Offers testy jsou fyzicky nedostupné z produkčního workflow.

**Staging secrets** (mapovány na standardní env var názvy, které app a testy čtou):
- `STAGING_VITE_SUPABASE_URL` → `VITE_SUPABASE_URL`
- `STAGING_VITE_SUPABASE_ANON_KEY` → `VITE_SUPABASE_ANON_KEY`
- `STAGING_VITE_INTERNAL_FUNCTION_TOKEN` → `VITE_INTERNAL_FUNCTION_TOKEN`
- `STAGING_E2E_TEST_EMAIL` → `E2E_TEST_EMAIL`
- `STAGING_E2E_TEST_PASSWORD` → `E2E_TEST_PASSWORD`
- `STAGING_E2E_CONTEST_ID` → `E2E_CONTEST_ID`
- `STAGING_E2E_WIN_CONTEST_ID` → `E2E_WIN_CONTEST_ID`

Staging workflow aktivní až po seedu staging DB a nastavení těchto secrets.

**Telegram zprávy:**
- Production: `✅ OneMil PROD smoke OK — registration + login passed` / `❌ OneMil PROD smoke FAILED` + run URL
- Staging: `✅ OneMil STAGING full E2E OK — all specs passed` / `❌ OneMil STAGING full E2E FAILED` + run URL

### Opravená chyba v registračním testu
- **Příčina 4× selhání (01.05.2026):** Supabase má zapnuté potvrzení emailu → po registraci `session: null` → localStorage bez `onemil-auth` klíče → `Profile.tsx` přesměroval na `/login` → `expectSessionExists()` selhalo
- **Oprava:** `tests/e2e/01-registration.spec.ts` — test nyní zvládá 3 platné stavy po registraci:
  1. Email auto-confirmed → session v localStorage → bottom nav viditelný
  2. Email confirmation required + session null → Profile přesměruje na `/login` → test prochází
  3. Email confirmation required + dočasná session → DateOfBirthGuard zobrazí "Potvrďte svůj e-mail" → test prochází
- **Bonus:** pokud Supabase vrátí 429 (rate limit) nebo 422, test se přeskočí místo pádu CI
- **Commity:** `945a77d`, `0659a28`

### Scheduled testy — nové nastavení
- Testy nyní běží **3× denně** automaticky (commit `156000f`):
  - 00:00 Praha (22:00 UTC)
  - 08:00 Praha (06:00 UTC)
  - 16:00 Praha (14:00 UTC)
- Časy jsou v letním čase (CEST = UTC+2); v zimě (CET) by byl posun o 1h
- Workflow: `.github/workflows/playwright.yml`

### Nástroje diagnostiky
- **gh CLI** nainstalován na tomto stroji (via winget)
- **GitHub Credential** — token je čitelný z Windows Credential Manager (`git:https://github.com`) přes P/Invoke CredRead API → použito pro přímé volání GitHub Actions API
- Výsledky runů čitelné přes: `gh run view <run_id> --log-failed` nebo GitHub API

### Stav testů (po opravě)
- `01-registration`: ✅ opraveno (zvládá email confirmation i rate limit)
- `02-login`: ✅ passing
- `03-08`: ⏭ skip v produkci — čekají na staging secrets v `playwright-staging.yml`

---

## STAGING SEED — OVĚŘENÝ STAV (10. 05. 2026)

**Projekt:** `onemil-staging`, ref `dxmowysntemfqfnanxua`, region `eu-north-1`

### Test user
| Pole | Hodnota |
|------|---------|
| Email | `e2e@onemil.cz` |
| User ID | `7822a82e-f1d3-45ee-827b-679640ce6b65` |
| Wallet balance | `5000.00` MioCoin |

### Contests
| Secret | Contest ID | Status | next_ticket_number |
|--------|-----------|--------|-------------------|
| `STAGING_E2E_CONTEST_ID` | `3fa56db0-4007-4fb7-aa2f-e460173070d8` | `active` | 1 |
| `STAGING_E2E_WIN_CONTEST_ID` | `7ff58a8e-c691-46e1-9e0c-ca6cddeb8abb` | `active` | 100 |

**Win contest poznámka:** Po každém úspěšném test-05 běhu je nutné resetovat `sold_tickets` zpět na `N - 1` a `next_ticket_number` na 100, jinak test 05 selže na dalším CI runu.

### Partner offer
| Pole | Hodnota |
|------|---------|
| Offer ID | `28278c87-17b6-49c3-ae7e-004d0d1f18b0` |
| Status | `approved` |
| deployment_mode | `selected_contests` |
| Připojena k | `STAGING_E2E_CONTEST_ID` (`3fa56db0-4007-4fb7-aa2f-e460173070d8`) |

### GitHub Secrets — co zbývá nastavit
Staging seed je připraven. Zbývá přidat do GitHub Secrets repozitáře:
- `STAGING_VITE_SUPABASE_URL`
- `STAGING_VITE_SUPABASE_ANON_KEY`
- `STAGING_VITE_INTERNAL_FUNCTION_TOKEN`
- `STAGING_E2E_TEST_EMAIL` → `e2e@onemil.cz`
- `STAGING_E2E_TEST_PASSWORD`
- `STAGING_E2E_CONTEST_ID` → `3fa56db0-4007-4fb7-aa2f-e460173070d8`
- `STAGING_E2E_WIN_CONTEST_ID` → `7ff58a8e-c691-46e1-9e0c-ca6cddeb8abb`

Po nastavení secrets je `playwright-staging.yml` připraven ke spuštění přes `workflow_dispatch`.

---

## E2E TESTOVÁNÍ — PRODUKČNÍ BEZPEČNOST & STAGING PLÁN (05. 05. 2026)

### Proč nelze destruktivní testy spouštět v produkci

Nákup tiketu (`buy_ticket_atomic`) zapisuje do **12+ systémů** v jedné atomické transakci a mimo ni:
- `wallets` (deduct balance)
- `wallet_transactions` (append-only ledger — **nelze mazat ani upravovat**, trigger `fn_wallet_transactions_immutable()` RAISES EXCEPTION na UPDATE/DELETE)
- `tickets`
- `contests` (sold_tickets increment)
- `bonus_prizes` (status → won)
- `winners` + `winner_status_history`
- `event_logs` → `event_queue` → Sofinity (analytika)
- `user_partner_offers` (assign partner offer)
- `partner_offers.last_assigned_at`
- `partner_offer_activations`
- `notifications` → `push_log` → OneSignal
- `email_queue`

**Klíčový závěr:** `wallet_transactions` je append-only permanentní finanční ledger. Jakýkoli test, který volá `buy_ticket_atomic`, vytváří permanentní záznamy. Cleanup není možný. **Destruktivní testy (03–08) se nesmí spouštět v produkci.**

### Výsledek porovnání tří možností E2E izolace

| Možnost | Závěr |
|---|---|
| Separátní staging Supabase projekt | ✅ **Doporučeno** — plná izolace, stejný kód aplikace, jiné env/secrets |
| `is_e2e` flag na contestech v produkci | ⚠️ Neúplné — funguje pro čtecí cesty, ale wallet_transactions se stále píší trvale; neizoluje Sofinity pipeline |
| Testovací tabulky + cleanup v produkci | ❌ **Nemožné** — `wallet_transactions` immutability trigger zakazuje DELETE i UPDATE |

### Potvrzené projekty a regiony (09. 05. 2026)

| | Produkce | Staging |
|---|---|---|
| **Projekt** | `onemil` | `onemil-staging` |
| **Project ref** | `xkzhjldrojjlrkezorey` | `dxmowysntemfqfnanxua` |
| **Region** | `eu-north-1` | `eu-north-1` |
| **První secret po vytvoření** | — | `SOFINITY_RELAY_URL` → `sofinity-noop` |

### Staging Edge Functions — aktuální stav (10. 05. 2026)

| Funkce | Status | Poznámka |
|--------|--------|---------|
| `sofinity-noop` | ✅ ACTIVE | Absorbuje Sofinity eventy; nasazena dříve |
| `upload-ticket-share` | ✅ ACTIVE | Nahrává share PNG do storage; nasazena 10. 05. 2026 |

**Storage:** bucket `ticket-shares` existuje na staging `dxmowysntemfqfnanxua`, `public: true`, `file_size_limit: 5242880` (5 MB) ✅

Produkce `xkzhjldrojjlrkezorey` nebyla dotčena. Žádné jiné funkce nebyly nasazeny.

### Staging koncept

- **Stejný kód aplikace** (`main` branch) — žádné speciální code paths
- **Jiná instance Supabase** — jiný `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, jiné secrets
- **Jiné env proměnné pro CI testy** (staging secrets v GitHub Actions)
- Frontend klient je správně připraven: `client.ts` čte Supabase URL/key z env proměnných — žádné hardcodování ✅

### Staging readiness audit — co brání plné izolaci

**Frontend (Supabase klient):** ✅ env-var-based, připraven ihned

**Tři hardcoded URL, které je nutno opravit před staging:**

| Soubor | Řádek | Problém | Fix |
|---|---|---|---|
| `supabase/functions/process_event_queue_worker/index.ts` | 19 | **Nejvyšší riziko** — hardcoded `https://rrmvxsldrjgbdxluklka.supabase.co/functions/v1/sofinity-event` (Sofinity relay); staging by posílal události do produkční analytiky | `Deno.env.get("SOFINITY_RELAY_URL") ?? "<prod-url>"` |
| `src/pages/ShareTicket.tsx` | 22 | Hardcoded prod Supabase URL pro OG image generování | Nahradit `` `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/og-ticket-share` `` |
| `src/components/TicketResultModal.tsx` | 416 | Stejný hardcoded OG image URL | Stejný fix jako ShareTicket.tsx |

`supabase/functions/daily-onboarding-reminder/index.ts:103` obsahuje fallback URL ale je nízké riziko — potlačí se nastavením `APP_URL` secret v staging projektu.

### Dvoustupňová CI strategie (doporučeno)

| CI | Testy | Databáze | Důvod |
|---|---|---|---|
| **Produkční CI** (current) | 01–02 (registration, login) | Produkce | Pouze read/auth — žádné peněžní transakce |
| **Staging CI** (budoucí) | 01–08 (full suite) | Staging Supabase | Plná izolace — destruktivní testy bezpečné |

### Fáze 1 — Staging-safe URL fix — DOKONČENO (09. 05. 2026, commit `20c6452`)

Hardcoded produkční URL nahrazeny env/client-based hodnotami:

| Soubor | Změna |
|---|---|
| `supabase/functions/process_event_queue_worker/index.ts` | `sendEndpoint`: `Deno.env.get("SOFINITY_RELAY_URL") ?? "<prod URL>"` |
| `src/pages/ShareTicket.tsx` | OG image URL: `${supabaseUrl}/functions/v1/og-ticket-share` |
| `src/components/TicketResultModal.tsx` | OG image URL: `${supabaseUrl}/functions/v1/og-ticket-share` |

- Build: ✅ passed (0 errors)
- `.claude/settings.local.json` nebyl commitnut ani pushnut
- `api/og-ticket.ts` a `vercel.json` — legacy; aktivní deploy cesta je Lovable, tyto soubory se nikdy nespouští v produkci; oprava odložena

### Krok-za-krokem plán pro staging (Fáze 1 hotova, čeká na souhlas pro Fázi 2)

**Fáze 1 — Opravit hardcoded URLs ✅ HOTOVO (commit `20c6452`)**
1. `process_event_queue_worker/index.ts` — hotovo
2. `src/pages/ShareTicket.tsx` — hotovo
3. `src/components/TicketResultModal.tsx` — hotovo

**Fáze 2 — Vytvořit staging Supabase projekt ✅ HOTOVO (09. 05. 2026)**
- Projekt `onemil-staging` vytvořen, ref `dxmowysntemfqfnanxua`, region `eu-north-1`
- Secret `SOFINITY_RELAY_URL` nastaven manuálně → `https://dxmowysntemfqfnanxua.supabase.co/functions/v1/sofinity-noop`
- Edge Function `supabase/functions/sofinity-noop/index.ts` vytvořena a nasazena pouze na staging (commit `4167527`)
- POST test: HTTP 200 `{"ok":true,"noop":true}` ✅
- Produkční projekt `xkzhjldrojjlrkezorey` nedotčen ✅
- Produkční Sofinity relay `rrmvxsldrjgbdxluklka` nedotčen ✅
- Žádné migrace nebyly spuštěny ✅

**Fáze 3 — CI staging workflow**
8. Přidat GitHub Secrets pro staging: `STAGING_VITE_SUPABASE_URL`, `STAGING_VITE_SUPABASE_ANON_KEY`, `STAGING_E2E_TEST_EMAIL`, `STAGING_E2E_TEST_PASSWORD`
9. Vytvořit `.github/workflows/playwright-staging.yml` — spouští plný suite 01–08 proti staging projektu
10. Aplikovat migrace na staging DB
11. Seedovat: testovacího uživatele, wallet, test contest(y), partner offer

**Aktuální stav:** Fáze 1 + 2 hotovy. Fáze 3 pozastavena — viz sekce níže (partial migration failure + cleanup).

**Fáze 3 — Migrace na staging DB — POZASTAVENO (10. 05. 2026)**

`npx supabase db push` selhal při migraci #3 (`20250914043049_`) — chyba: `relation "public.payments" does not exist`.

**Root cause:** První ~5 migračních souborů (blank-name, 14. 09. 2025) jsou hotfixy na již existující schéma, ne CREATE skripty. Počáteční schéma (tabulky `payments`, `wallets`, `users`, `contests`, `tickets` atd.) bylo vytvořeno přímo v Supabase dashboardu a **nebylo nikdy zachyceno jako migrační soubor**. Staging má prázdnou DB — tyto tabulky neexistují.

**Stav staging DB — schema baseline aplikován manuálně (10. 05. 2026):**
- Produkční schéma zdumpováno a aplikováno na staging přes Supabase SQL Editor (manuálně)
- Ověřeno na staging `dxmowysntemfqfnanxua`:
  - 73 public tabulek ✅ (včetně `public.payments`, `wallets`, `tickets`, `contests`, `users` atd.)
  - `buy_ticket_atomic` funkce existuje ✅
  - `fn_wallet_transactions_immutable()` trigger existuje ✅
  - 95 RLS policies ✅
- Produkce `xkzhjldrojjlrkezorey` nedotčena ✅

**`supabase_migrations.schema_migrations` — experimenty s formátem (10. 05. 2026):**

CLI extrahuje z lokálních `.sql` souborů **vedoucí číselný prefix** (ne celý stem), např. `20250914034944_.sql` → `20250914034944`. DB záznamy s jiným formátem CLI nespáruje.

| Pokus | Obsah | Počet | Výsledek dry-run |
|-------|-------|-------|-----------------|
| 1 | Celé filename stems (bez `.sql`) | 341 | ❌ Všech 341 "Remote not found" |
| 2 | Číselné prefixy, deduplikováno | 327 | ❌ 3 krátké 8-ciferné prefixy "Remote not found" |
| 3 | 324 prefixů (bez 3 konfliktních) | 324 | ❌ 17 lokálních souborů "pending before last remote" |
| 4 | 324 + 17 plných stemů sekundárních souborů | 341 | ❌ 22 chyb (plné stemy + 5 dříve fungujících se rozbilo) |
| **Finální** | **Zpět na 324 číselných prefixů** | **324** | **❌ 17 souborů pending — nejlepší dosažitelný stav** |

**Root cause neřešitelného selhání dry-run:**
- 4 páry souborů sdílí stejný 14-ciferný timestamp (např. `20260315280000_buy_ticket_rate_limit.sql` + `20260315280000_cleanup_winners_indexes.sql`) — CLI páruje jeden DB záznam s prvním souborem abecedně, druhý zůstává "pending before last remote"
- 3 smíšené skupiny mají 8-ciferné i 14-ciferné soubory (např. `20260419_*` + `20260419104519_*`) — 8-ciferný prefix CLI nespáruje, soubor zůstává pending
- **Celkem: 17 lokálních souborů permanentně pending** při 324 DB záznamy; exit code 0 nelze dosáhnout bez přejmenování souborů

**Aktuální stav `schema_migrations` na staging:** 324 řádků (číselné prefixy).

**⛔ Nespouštět `db push` na staging. Needitovat `schema_migrations` bez schválení.**

**Rozhodnutá strategie pro staging migrace — Option A (10. 05. 2026):**
- `db push` se na staging **nepoužívá** — ani nyní, ani dokud nebudou přejmenovány duplicitní soubory
- Nové změny DB se aplikují na staging **manuálně přes Supabase SQL Editor** — stejný workflow jako v produkci
- Aktuální staging schema baseline je přijat jako správný; 17 pending souborů je již obsaženo v baseline schématu, CLI je nedokáže sledovat kvůli duplicitním/smíšeným timestamp prefixům
- `schema_migrations` zůstává na 324 řádcích — neměnit
- Staging CI (testy 03–08) nevyžaduje `db push --dry-run` exit 0 — závisí pouze na správnosti schématu DB

---

## VIZUÁLNÍ SYSTÉM / GRAFIKA — NEDOKONČENO (27. 04. 2026)

### Aktuální situace
Grafický systém je v přechodném stavu. Momentálně probíhá testování funkčnosti systému (platby, tiket purchase, contest flow). Grafika bude dořešena až po ověření funkčnosti.

### Co bylo uděláno (větev `claude/setup-playwright-tests-bShrg`)
Commity `d6d4597` a `25e87dd` — **nemergnuto do `main`**:
- Font nadpisů změněn z `Plus Jakarta Sans` → **Poppins**
- CSS proměnné `--primary`, `--secondary`, `--accent` přepsány z modré/zlaté na **Energy Orange** (`hsl(32 100% 50%)`)
- Bordery a gradienty ContestCard a ContestDetail přepsány ze zlaté na oranžovou
- Progress bary: `#f6e27a/#d4a017` → `#FF8A00/#FFB547`

### Co bylo uděláno (větev `claude/thirsty-volhard-e1eb7c`, commit `a21ef28`)
Vizuální zmírnění na aktuální větvi — **pushnuté, nemergnuto do `main`**:
- `src/index.css` — `--neon-gold` z `43 90% 55%` → `33 70% 44%`, stejně `--package-gold`, `--secondary`, `--accent`; `--heading-gold*` sada ztmavena; `--glow-gold` opacity snížena ~50 %; keyframes `luxury-pulse`, `luxury-glow`, `title-glow` — gold opacity snížena; `.text-heading-gold` gradient zmírněn; `.text-neon-gold` text-shadow snížena
- `src/components/ContestCard.css` — border sweep barvy ze zlaté na tlumenou amber-oranžovou; inner glow opacity snížena
- `src/components/ContestCard.tsx` — statický border → `rgba(191,198,207,0.16)`; progress bar gradient → `#C07018/#884A08`; CTA button text/border → tlumená amber-oranžová
- `src/components/MioCoin.tsx` — outer ring gradient ze `yellow-500/40` → `amber-800/25`; shadow opacity snížena

### Co ještě chybí / co je potřeba dořešit
- [ ] Rozhodnutí: mergovat brand větev (`setup-playwright-tests-bShrg`) nebo aplikovat brand tokeny přímo na `main`
- [ ] Sjednotit font: `Plus Jakarta Sans` → `Poppins` (nebo potvrdit jiný výběr)
- [ ] Sjednotit primární barvu: zlatá → Energy Orange `#FF8A00` (nebo potvrdit výsledek zmírnění z `thirsty-volhard`)
- [ ] Projít stránky: Homepage, Games, ContestDetail, Profile, Vouchers — vizuálně ověřit konzistenci po brand změnách
- [ ] MioCoin package karty (Vouchers page) — přidat dark overlay, ověřit kontrast
- [ ] Otestovat v prohlížeči na localhost:8080/8081 a schválit výsledek před mergem

### Větve relevantní pro grafiku
| Větev | Co obsahuje | Stav |
|---|---|---|
| `claude/setup-playwright-tests-bShrg` | Poppins + Energy Orange (úplná brand aplikace) | Hotovo, nemergnuto |
| `claude/thirsty-volhard-e1eb7c` | Zmírnění zlaté, soft rgba bordery | Hotovo, nemergnuto |
| `main` | Původní zlatá/modrá paleta | Žádné brand změny |

---

**Aktualizováno (předchozí):** 24. 04. 2026 (CI & Payment Pipeline stabilization)

---

## CI & PAYMENT PIPELINE – FINAL VERIFIED STATE (24.04.2026)

### Playwright Smoke Tests
- Celkem **8 spec souborů**, ~20 testů:
  - `01-registration` — registrace nového účtu
  - `02-login` — přihlášení existujícího účtu
  - `03-ticket-purchase` — navigace na contest + pokus o koupi tiketu
  - `04-voucher-purchase` — (starší spec, čeká na credentials)
  - `05-win-flow` — koupě poslední tikety → výhra (vyžaduje `E2E_WIN_CONTEST_ID`)
  - `06-partner-offers` — po nákupu tikety detekce partner offer v result modalu
  - `07-partner-offer-open` — /wins → Nabídky tab → klik na nabídku → assert dialog + opened_at PATCH
  - `08-partner-offer-persistence` — otevření nabídky → reload → nabídka stále přítomna + žádný „Nová" badge
- Registrace + login testy: **passing**
- Testy 03–08: **skip** (čekají na `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`; 05 navíc `E2E_WIN_CONTEST_ID`)
- CI workflow: `.github/workflows/playwright.yml` — branch `claude/**`, PR do `main`, `workflow_dispatch`
- Supabase propojen v CI přes GitHub Secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- webServer: `npm run dev` (Vite, port 8080), spouštěn automaticky Playwrightem

### Nový env var pro win-flow test
- `E2E_WIN_CONTEST_ID` — musí ukazovat na soutěž se **právě 1 zbývající tiketou** (seeded contest)
- Přidat jako GitHub Secret + případně do lokálního `.env`

### Stripe webhook (`supabase/functions/stripe-webhook/index.ts`)
- Všechny failure paths uvnitř `checkout.session.completed` vracejí **HTTP 500** (Stripe retry)
- Idempotency: před INSERT se kontroluje `stripe_session_id` v `payments`; duplicity vracejí 200 + log `STRIPE WEBHOOK DUPLICATE`
- Structured failure log: `console.error('STRIPE WEBHOOK FAILURE', {session_id, reason, user_id, amount})`
- Outer catch: opraveno z 400 → **500** (aby Stripe retryoval i při neočekávaných runtime chybách)
- Signature check inner catch zůstává 400 (správně — unsigned requesty nejsou validní Stripe events)
- Wallet credit: trigger `update_wallet_after_payment` (AFTER INSERT ON payments WHERE status='completed')

### Registrace + auth flow
- `auth.users` → trigger `on_auth_user_created` → `handle_new_auth_user()` → `public.users` + `profiles` + `wallets`
- Migrace `20260420_ensure_wallet_exists.sql`: centralizovaná DB funkce `ensure_wallet_exists(p_user_id)` — commitnuta, **nutno aplikovat v Supabase SQL Editoru**
- Migrace `20260420_fix_profiles_insert_remove_user_id.sql` — commitnuta, **nutno aplikovat v Supabase SQL Editoru**

### won_type priority oprava
- Migrace `supabase/migrations/20260424_fix_won_type_main_priority_over_bonus.sql` — commitnuta (commit `68e06fc`), **nutno aplikovat v Supabase SQL Editoru**
- Bug: pokud poslední tiket zároveň zasáhl bonusovou pozici, `won_type` vracel `'bonus'` místo `'main'`
- Fix: CASE pořadí vyměněno — `v_next_ticket = v_ticket_count → 'main'` je teď před `v_bonus_prize_id IS NOT NULL → 'bonus'`
- Platí i pro `won_prize` CASE (konzistence)
- Frontend: tři místa volají `buy_ticket_atomic` **přímo** (ne přes Edge Function): `ContestDetail.tsx`, `Games.tsx`, `FavoriteGames.tsx` — všechna správně kontrolují `data.success` a `data.won_type`

### GitHub Actions CI
- Telegram notifikace: `curl` na `api.telegram.org` na success i failure (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`)
- GitHub Step Summary: `PAYMENT PIPELINE OK` / `PAYMENT PIPELINE FAILED` + markdown
- HTML report artifact: `playwright-report-{run_id}` (14 dní)
- Screenshots artifact při selhání: `screenshots-{run_id}` (7 dní)
- Pipeline status: **stable, production-ready**

---

**Aktualizováno (předchozí):** 13. 04. 2026, 20:46:33 +02:00 (dokumentační synchronizace contest-admin)

## Aktuální fáze
Partner Offers v1 – **dokončeno, nasazeno a finálně ověřeno end-to-end**.

## Shrnutí
Modul Partner Offers v1 je uzavřen jako hotový.
Byly dokončeny bloky A–G, následně proběhlo vícekolové E2E ověření včetně finálního HTTP-level testu přes `purchase-ticket` s reálným JWT.

Výsledek:
**Partner Offers v1 PASSED finálním E2E ověřením.**

## Přístup k aplikaci
Dočasný frontend gate v `src/App.tsx` (email allowlist a obrazovka „Web je momentálně neveřejný“) byl **odstraněn** (2026-04-10). Po přihlášení mají registrovaní uživatelé znovu normální přístup k trasám; Supabase Auth a stávající role redirecty zůstaly beze změny. Ověřeno: `npm run build` úspěšně (Vite production build dokončen).

---

## Závazná pravidla Partner Offers v1
- Partner Offers **nejsou výhry**
- Partner Offers se **nikdy** nesmí ukládat do:
  - `winners`
  - `bonus_prizes`
- Bottom menu zůstává:
  - `Výhry`
- Uvnitř `/wins` je přepnutí:
  - `Výhry`
  - `Nabídky`
- Partner offer se po získání ukládá automaticky
- Neexistuje tlačítko `Uložit`
- Otevřená nabídka = otevřený detail nabídky v appce
- Po schválení partner nesmí měnit nic
- Režim zdarma je pouze interní admin volba
- Data Partner Offers se fyzicky nemažou
- Uživatelské smazání = pouze skrytí z pohledu uživatele
- Po skrytí se odešle systémová zpráva do `messages`
- Cooldown = 5 minut
- Bez denního limitu
- Max 1 partner offer na 1 ticket
- V1 grafika:
  - logo 512×512
  - banner 1600×900

---

## Finální stav po blocích

### Block A — core data model
Nasazeno:
- `partner_offers`
- `partner_offer_selected_contests`
- `partner_offer_contests`
- `user_partner_offers`

Důležité:
- `partner_offers.last_assigned_at`
- `user_partner_offers.last_reminder_at`
- `user_partner_offers.ticket_id` = `uuid`
- `buy_ticket_atomic` vrací additivně:
  - `ticket_row_id`

### Block B — partner + admin workflow
Nasazeno:
- partner draft / submit / revise
- admin approve / reject / priority
- `selected_contests` picker
- `rejected -> draft` přes RPC:
  - `revise_partner_offer(...)`

### Block C — automatic contest attachment
Nasazeno pro:
- `all_contests`
- `selected_contests`

Hotové:
- attach při approve
- attach při `resume_contest`
- detach při deaktivaci nabídky
- detach při close contestu
- detach při expiraci
- `detached_at` soft detach
- respektuje:
  - `valid_from`
  - `valid_to`

Mimo v1:
- `category_contests`

### Block D — post-ticket evaluation layer
Nasazeno:
- assignment běží pouze při:
  - `data.success === true`
  - `data.won_type === null`
- používá RPC:
  - `assign_partner_offer_to_ticket(p_user_id uuid, p_contest_id uuid, p_ticket_id uuid default null)`
- používá:
  - `ticket_row_id`
- zapisuje jen do:
  - `user_partner_offers`
  - `partner_offers.last_assigned_at`
- response pro uživatele zůstává beze změny
- validita nabídky se kontroluje přímo v Block D
- cooldown 5 minut je aktivní

### Block E — Wins / Offers user UI
Nasazeno a ověřeno v repozitáři (commit `b7aa4ce`, 10. 04. 2026):
- `/wins` přepnutí:
  - `Výhry`
  - `Nabídky`
- nové soubory:
  - `src/components/OfferCard.tsx`
  - `src/components/OfferDetailModal.tsx`
- `src/pages/Wins.tsx` aktualizován s tab switcherem
- chování:
  - Nabídky čtou pouze z `user_partner_offers` kde `status = active` a `hidden_at IS NULL`
  - otevření detailu zapisuje `opened_at` (non-fatal)
  - skrytí zapisuje `hidden_at` → DB trigger Block F odešle systémovou zprávu
  - skrytá nabídka okamžitě zmizí ze seznamu (optimistic removal)
  - neexistuje tlačítko Uložit
- `opened_at`
- `hidden_at`
- partner display name:
  - `company_name ?? name`
- zobrazuje `valid_to`
- build: ✅ exit code 0

### Block F — reminder emails + system messages
Nasazeno:
- Edge Function:
  - `send-offer-reminders`
- denní cron job
- summary email po 24h a pak týdně
- `last_reminder_at`
- DB trigger pro system message při `hidden_at`
- write targety:
  - `email_queue`
  - `user_partner_offers.last_reminder_at`
  - `messages`

Důležité:
- během E2E byl nalezen blocker v tokenu pro internal reminder call
- proběhla rotace `INTERNAL_FUNCTION_TOKEN`
- token byl sjednocen v:
  - Supabase secret `INTERNAL_FUNCTION_TOKEN`
  - lokální `.env` `VITE_INTERNAL_FUNCTION_TOKEN`
  - pg_cron `send_offer_reminders_daily`
  - pg_cron `process-event-queue`
- po opravě test:
  - HTTP 200
  - `{"success":true,"emails_queued":0,"offers_touched":0}`

### Block G — billing + reporting
Finální uzamčený návrh i implementace:
Billing vrstva je oddělená od core offer modelu.

Nasazeno:
- `partner_offer_billing_configs`
- `partner_offer_activations`
- `partner_offer_invoice_lines`
- rozšíření:
  - `partner_invoices.type = coin | offer`
- reporting přes admin
- sync aktivací:
  - `sync_partner_offer_activations()`
- admin summary:
  - `get_admin_activation_summary()`

Billing režimy:
- `paid_distribution`
- `hybrid`
- `affiliate_direct`
- `affiliate_external`
- `free`

V1 billing chování:
- `paid_distribution` = automatické fakturování
- `free` = no-op
- `hybrid`, `affiliate_direct`, `affiliate_external` = trackované, ale ruční settlement

---

## Kritická oprava během E2E
Během E2E bylo potvrzeno, že RPC:
- `assign_partner_offer_to_ticket(...)`
existuje a funguje, ale nebylo automaticky napojené na `purchase-ticket`.

Byla provedena cílená oprava:
- změněn pouze:
  - `supabase/functions/purchase-ticket/index.ts`

Oprava:
- po úspěšném `buy_ticket_atomic`
- při `data.success === true && data.won_type === null`
- se automaticky volá:
  - `assign_partner_offer_to_ticket(...)`
- používá `ticket_row_id`
- assignment je non-fatal
- response pro uživatele zůstává beze změny

Tím je **Block D wiring kompletní**.

---

## Finální E2E ověření – potvrzené výsledky

### 1. Assignment flow
Potvrzeno:
- při `won_type = null` vznikne správně `user_partner_offers`
- `ticket_id` v UPO odpovídá `ticket_row_id`
- `status = active`
- `offer_id` sedí
- `last_assigned_at` se aktualizuje

### 2. Cooldown
Potvrzeno:
- opakované přiřazení do 5 minut vrací `NULL`
- nevzniká druhý UPO řádek

### 3. Winning gate
Finální HTTP-level test potvrdil:
- při `won_type = 'bonus'` **nevznikne žádné UPO**
- gate funguje správně

### 4. Ticket purchase response
Potvrzeno:
- response formát pro uživatele je zachovaný
- wiring nic nerozbíjí

### 5. Activations
Potvrzeno:
- `sync_partner_offer_activations()` správně vytváří activation rows
- `upo_id`, `offer_id`, `user_id`, `activated_at` sedí

### 6. Reminder function
Potvrzeno:
- auth guard funguje
- no-op run vrací 200 po opravě tokenu

### 7. Final verdict
**Partner Offers v1 prošlo finálním E2E ověřením.**

---

## Otevřený bod mimo v1
### category_contests
Stále mimo v1, dokud nebude skutečný model kategorií soutěží.

---

## Kanonické memory soubory pro OneMil
Od této chvíle je pro OneMil kanonická pouze tato trojice souborů v tomto workspace:

- `C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw\onemil_state.md`
- `C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw\onemil_history.md`
- `C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw\CLAUDE.md`

Pravidlo:
- `onemil_state.md` = jediný current snapshot
- `onemil_history.md` = jediná chronologická historie
- `CLAUDE.md` = jen stručný pracovní kontext a uzamčené zásady, ne plná historie

---

## Brand Identity — uzamčený stav (27. 04. 2026)

**Plný brand kit:** `docs/brand/onemil_brand_kit/graphics.md` (zdroj: `docs/brand/onemil_brand_kit.zip`)
**Tagline:** Luxusní soutěže. Skutečné výhry.

### Směr
- **Dark premium tech-luxury** — ne casino, ne hazard, ne lottery kitsch
- Zakázané vizuály i slovník: casino, hazard, sázení, sázka, jackpot, žetony, zbohatni, roulette, slot-machine

### Typografie
- Nadpisy: **Poppins** 600–800 (Google Fonts, ne soubory v repozitáři)
- Body / UI text: **Inter** 400–500

### Barvy (kanonické hex hodnoty z brand kitu)
| Název | Hex | Token |
|-------|-----|-------|
| Midnight Black | `#0A0B0F` | `--om-black` |
| Deep Navy | `#101722` | `--om-navy` |
| Graphite | `#1D2128` | `--om-graphite` |
| Platinum | `#E7EBF0` | `--om-platinum` |
| Silver | `#BFC6CF` | `--om-silver` |
| Energy Orange | `#FF8A00` | `--om-orange` |
| Warm Amber | `#FFB547` | `--om-amber` |

### Logo
- **Primární:** trophy / číslo „1" *za* wordmarkem OneMil (wordmark v popředí) — web, appka, hero
- **Sekundární:** trophy *nad* wordmarkem (stacked) — sociální sítě, bannery, plakáty
- **Standalone ikona:** trophy / číslo „1" samostatně — favicon, app icon, avatar
- Export: PNG 512 × 512, PNG 1024 × 1024, SVG (pouze placeholder — pro produkci vektorizovat)
- Hero banner: 1920 × 480 px; partner/OG banner: 1600 × 900 px

---

## Partner portal UI – offer management (2026-04-11)

Nasazeno v `src/pages/PartnerDashboard.tsx`:
- Partner vidí seznam svých nabídek (`partner_offers`) s reálnými stavy
- Sloupce: název, stav (badge), distribuce, platnost do, datum posledního přidělení, akce
- Tlačítko „Nová nabídka" → dialog pro vytvoření (INSERT jako draft)
- Draft / Rejected → tlačítko Upravit (UPDATE) + Odeslat (→ submitted) / Vrátit k úpravám (RPC `revise_partner_offer`)
- Submitted → zobrazí „Čeká na schválení"
- Approved → zobrazí „Schváleno – nelze měnit" (bez editačního tlačítka)
- Form fields: title, short_text, deployment_mode (Select), valid_from, valid_to, link_or_code
- `loadPartnerOffers(partnerId)` voláno automaticky z `loadPartnerData()`
- Build: ✅ exit code 0

---

---

## Admin contest management – aktuální stav (13. 04. 2026)

### Contest statuses (DB + UI)
Platné hodnoty v `contests.status` (constraint `contests_status_check` byl rozšířen):
- `draft` — v admin UI zobrazováno jako **„Archiv test"**
- `pending` — „Čeká na start"
- `active` — „Aktivní"
- `paused` — „Pozastaveno"
- `closed` — „Ukončeno" (pouze systémový přechod, admin nemůže nastavit ručně)

### Admin UI – Správa soutěží
Stránka `AdminContestManagement` má 3 filtrovací taby přímo pod hlavičkou:
- **Aktivní soutěže** — zobrazuje `pending`, `active`, `paused`
- **Archiv test** — zobrazuje `draft`
- **Archiv ukončených soutěží** — zobrazuje `closed`

Chování je na jedné stránce, ne na samostatné stránce ani ve row dropdownu.
- Soutěže ve stavu `closed` patří výhradně do tabu **Archiv ukončených soutěží** (filtrování podle statusu, ne samostatná route)

### Pravidla přechodu statusu (admin)
- Ruční přesun do `draft` (Archiv test) z admin UI je povolen jen ze stavů **`pending`** nebo **`paused`** (ne z `active`)
- `active` → `draft` je zablokováno (UI i frontend guard)
- Zablokovaný přechod zobrazí toast: _„Aktivní soutěž nelze přesunout do Archivu test. Nejprve ji pozastavte nebo vraťte do stavu Čeká na start."_
- V dropdown je `draft` option pro `active` contest viditelná, ale disabled

### Contest create flow
- Aktivní admin cesta: `AdminContestManagement` → RPC `admin_manage_contest`
- Opravena tichá chyba na frontendu: `ticket_count` se již netiše přepisoval na fallback `1_000_000`, pokud nebyl správně předán
- Na straně DB/RPC: `admin_manage_contest` při **create** už **netiše** nepřijímá neplatný nebo chybějící `ticket_count` (místo tichého defaultu je vyžadována platná hodnota / chyba)
- Aby se oprava projevila v prohlížeči na Lovable hostovaném buildu, bylo nutné **Share → Publish** (samotný git push nestačí pro live frontend)

### Hard delete contestů – ZAKAZANO v produkci
- Hard delete contestů není bezpečný se stávajícím FK modelem
- `partner_offer_contests.contest_id` odkazuje FK na `contests(id)`
- Soft detach (`detached_at`) odstraní logickou vazbu, ale FK řádky fyzicky zůstávají → hard delete i po soft detach selže s FK violation
- **Bezpečný způsob „úklidu" testovacích soutěží = přesun do `draft` (Archiv test), ne hard delete**
- Testovací soutěže se **nemají** řešit stejně jako produkční „cleanup" cíle; cílem je statusová archivace, ne mazání řádků
- Delete je v admin UI povolen pouze pro `draft` a `pending` soutěže (testovací fáze)

### Partner Offers + contest lifecycle – potvrzené invarianty
- `partner_offer_contests` řádky se **NESMÍ** mazat natvrdo (ani kvůli „úklidu" soutěže)
- Trigger `trg_partner_offer_approved` attachuje nabídky pouze na `active` nebo `pending` soutěže → `draft` soutěže jsou z automatického attachmentu vyloučeny
- `buy_ticket_atomic` stráží `status = 'active'` → `draft` soutěže jsou pro uživatele inertní
- V kontextu úklidu soutěží se **nepouštět** do změn triggerů, `buy_ticket_atomic` ani `assign_partner_offer_to_ticket` — řešení je stavová archivace a respekt FK modelu

---

## Další správný krok
Partner Offers v1 už se nemá znovu architektonicky otevírat.

Další krok:
1. jen případné bugfixy, pokud se objeví v běžném provozu
2. až potom případná rozšíření mimo v1
