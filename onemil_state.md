# OneMil – aktuální stav projektu

**Aktualizováno:** 15. 05. 2026 (PR #20 mergnut do main @ 0f5f864 — Affiliate public pages E2E regression guard)

---

## PAPERCLIP / AI TEAM CONTEXT

**Aktualizováno:** 12. 05. 2026

Detailní pravidla, schvalovací model a technické poznámky jsou v souboru:
**`PAPERCLIP_SETUP_CONTEXT.md`**

### Aktuální stav Paperclip (12. 05. 2026)

- **Server:** běží lokálně na `http://127.0.0.1:3100` (verze 2026.428.0)
- **Spuštění:** `npx paperclipai onboard --yes` z `C:\Users\divis\Desktop\Onemil - Projekt\million-ticket-draw`
- **PowerShell okno musí zůstat otevřené** po dobu běhu serveru

**Firma v Paperclip:**
- iCONIC POINT s.r.o. (prefix: ICO)

**Projekt v Paperclip:**
- OneMil

**Aktivní agenti:**

| Agent | Adaptér | Role |
|-------|---------|------|
| Provozní ředitel OneMil | claude_local nebo codex_local | Manažer, AI koordinátor, deleguje práci |
| Průzkumník obchodních leadů OneMil | codex_local | Lead researcher, hledá a třídí firmy |

**Pavel Diviš zůstává owner a final decision maker. Nic se neprovádí bez jeho schválení.**

### Klíčová pravidla agentů

- Provozní ředitel je **manažer, ne exekutor**. Specializovanou práci deleguje příslušnému agentovi.
- Provozní ředitel **nečte onemil_history.md automaticky** — pouze na výslovnou žádost Pavla.
- Provozní ředitel neřeší osobně: rozsáhlý výzkum, lead scouting, velké tabulky, marketingový průzkum, právní analýzu, technické práce ani repetitivní zpracování — pokud Pavel neřekne **„zpracuj osobně"**.
- Pro lead výzkum deleguje vždy na Průzkumníka obchodních leadů OneMil.
- Pokud vhodný agent neexistuje → navrhne nového agenta a čeká na schválení Pavla.
- Výstup se **zveřejňuje přímo do komentáře Paperclip issue**, ne jen interně.
- Reporty, CSV a Markdown soubory se ukládají do: `C:\Users\divis\Desktop\OneMil Paperclip Outputs`

### Technické poznámky

- Claude Code adaptér funkční; může být limitován kredity Pro účtu.
- Codex local adaptér funkční na Windows.
- Pro Codex local na Windows: Extra args → `--skip-git-repo-check`
- Model: **Default** nebo **gpt-5.3-codex** (o4-mini nebyl podporován s aktuálním nastavením).
- Provozní ředitel: Enable search **OFF**, Can assign tasks **ON**, Can create agents **OFF**, Heartbeat **OFF**.
- Průzkumník: Enable search **ON**, Can assign tasks **OFF**, Can create agents **OFF**, Heartbeat **OFF**.

### Issues vytvořené při nastavování (ICO projekt)

| Issue | Obsah |
|-------|-------|
| ICO-15 | Lead scouting — 10 českých e-shopů/značek |
| ICO-16 | Shortlist top 3 firem z existujících leadů |
| ICO-17 | Ověření veřejných B2B kontaktů — Dedoles, Slevomat, Rohlik.cz |
| ICO-18 | Dedoles one-pager draft → `dedoles_one_pager_ICO-18_2026-05-12.md` |
| ICO-19 | Návrh ideálního AI týmu pro OneMil → `onemil_ai_team_ICO-19_2026-05-12.md` |

### Další krok

Pokračovat v budování lead databáze. Průzkumník rozšiřuje seznam; Provozní ředitel koordinuje priority a předkládá shortlisty Pavlovi ke schválení před jakýmkoli outreachem.

---

## BUSINESS / PRODUCT CONTEXT

Aktuální obchodní a produktový kontext OneMil je v souboru:
**`ONEMIL_BUSINESS_CONTEXT.md`**

Tento soubor je hlavní zdroj pravdy pro pochopení toho, co OneMil je, jak funguje B2B odměnový model, partneři, MioCoiny, kupony, vouchery, soutěže, influenceři, agentury a sociální kampaně.

---

## FIREMNÍ KONTEXT

Aktuální firemní identita, kontakty, e-mailový podpis a fakturační údaje jsou v souboru:
**`COMPANY_CONTEXT.md`** — zdroj pravdy pro všechny asistenty a nástroje.

---

## STORE POLICY / LAUNCH COPY — UZAMČENO (13. 05. 2026)

### Stav
- PR #2 **Store policy copy cleanup: 18+ and ticket order model** byl mergnut do `main` (merge commit `c132be9ff60e15884d84f38d486c53dcb7f94666`).
- PR obsahoval pouze:
  - `src/pages/ContestDetail.tsx`
  - `src/pages/Games.tsx`
  - `src/pages/OnboardingDateOfBirth.tsx`
  - `src/pages/PrivacyPolicy.tsx`
  - `src/pages/TermsConditions.tsx`
  - `src/pages/Vouchers.tsx`
- Před mergem prošlo PR smoke E2E a Playwright Staging Full E2E na větvi `feature/store-policy-18plus-ticket-order-copy`.
- Po mergi do `main` prošel production smoke workflow `25795875077` a Playwright Staging Full E2E workflow `25795953772`.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

### Veřejná launch pravidla
- Launch age rule je **18+**.
- Veřejný text nesmí popisovat soutěže jako loterii, losování ani náhodný generátor.
- Správný veřejný model: **tikety se otevírají postupně v pořadí 1, 2, 3... a výherní pozice jsou předem určeny v pravidlech dané soutěže**.
- MioCoin je **interní kredit OneMil**.
- MioCoin **nelze vybrat ani vyplatit jako peníze**.
- MioCoin **nelze převádět mimo OneMil**.
- MioCoin lze použít pouze uvnitř OneMil.
- Dobročinné / charitativní kampaně musí vždy uvádět konkrétního příjemce, účel a výši podpory pro danou kampaň.

### Invariant
Tyto změny jsou copy/legal/store-review cleanup. Neměnily contest engine, wallet, DB, Supabase, Stripe, Sofinity, OneSignal, Partner Offers, `tickets`, `winners`, `bonus_prizes` ani `buy_ticket_atomic`.

---

## LAUNCH STRATEGY — WEB/PWA FIRST (13. 05. 2026)

### Strategické rozhodnutí
- OneMil bude spuštěn nejdříve jako **Web/PWA**.
- Podání do **Apple App Store** a **Google Play** se odkládá.
- Důvod: OneMil nebude v této fázi platit Apple/Google poplatky 15–30 % z nákupů MioCoinů.
- Stripe zůstává platebním providerem pro **Web/PWA MioCoin top-up**.
- Budoucí nativní iOS/Android aplikace lze znovu zvážit pouze po schválení platební/store strategie.

### Důsledky pro aktuální roadmapu
- Priorita store-readiness se přesouvá z nativních store submission kroků na Web/PWA readiness.
- Stripe web flow zůstává platný pro nákup MioCoinů mimo Apple/Google store billing.
- Native app store práce se neimplementuje, dokud nebude schváleno, zda má být:
  - consumption-only app bez nákupu MioCoinů,
  - native billing přes Apple/Google,
  - nebo jiný právně a obchodně schválený model.
- Toto rozhodnutí nemění contest engine, wallet, DB, Supabase, Stripe webhook, Sofinity, OneSignal, Partner Offers, `tickets`, `winners`, `bonus_prizes` ani `buy_ticket_atomic`.

### PWA readiness audit — aktuální nález
- `index.html` má základní mobile viewport a title `OneMil`.
- Produkční `public/` obsahuje pouze `favicon.ico`, `robots.txt`, `sitemap.xml`, `OneSignalSDKWorker.js`, `placeholder.svg`, `mockup-detail.html` a `sounds/`.
- V aktivním `public/` není nalezený web app manifest.
- V `index.html` není odkaz na manifest, `apple-touch-icon`, `theme-color` ani PWA splash metadata.
- Brand kit obsahuje připravené PWA/icon podklady v `docs/brand/onemil_brand_kit/.../03_icons/favicon_app/` a ukázkový `manifest.webmanifest`, ale nejsou zapojené do aktivního web buildu.
- Aktivní service worker pro offline/PWA cache nebyl nalezen. Existuje pouze OneSignal worker `public/OneSignalSDKWorker.js` pro push notifikace.
- Add-to-home-screen chování není explicitně implementované ani zdokumentované v kódu.
- Stripe Checkout je na Web/PWA dostupný přes existující `create-stripe-checkout` flow v `Homepage.tsx` a `Profile.tsx`.

### Nejbližší PWA blocker
Aktivní Web/PWA build zatím nemá zapojený manifest, app icons, `theme-color`, Apple touch icon, splash metadata ani offline/service worker strategii. Před veřejným Web/PWA launch je potřeba připravit samostatný PWA setup PR.

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

## CI & PLAYWRIGHT — AKTUÁLNÍ STAV (15. 05. 2026)

### PR #17 — Messages composer fix — MERGNUT (15. 05. 2026)

- **Branch:** `fix/messages-composer-above-bottom-nav` → `main`
- **Merge commit:** `42a06f6`
- **Změněný soubor:** `src/pages/Messages.tsx` — 1 řádek
- **Fix:** Odstraněna třída `min-h-screen` z vnějšího wrapperu Messages stránky. `index.css` již definuje `.messages-mobile-fixed-shell` s `height: calc(100dvh - 5.75rem - env(safe-area-inset-bottom, 0px))` na mobilu — výška viewportu minus spodní navigace. Tailwindový `min-h-screen` (`min-height: 100vh`) tuto hodnotu přebíjel, čímž vstupní pole skončilo za spodní navigací na iPhone/PWA.
- **Výsledek:** Psací pole je celé viditelné těsně nad spodní navigací; zprávy scrollují ve svém kontejneru; spodní lišta zůstává fixní.
- **Bob, odesílání zpráv, routy, DB, Supabase, Stripe, wallet, soutěže, tikety, výhry, Partner Offers, `buy_ticket_atomic` — nedotčeny.**
- **PR smoke:** run `25887802417` ✅ 5 passed (1m10s)
- **Pre-merge Staging Full E2E:** run `25887887248` ✅ 17 passed, 3 skipped, 0 failed (2m6s)
- **Post-merge production smoke:** run `25888181338` ✅ 5 passed (18.8s) — Telegram OK
- **Post-merge Staging Full E2E na main:** run `25888244060` ✅ 17 passed, 3 skipped, 0 failed (2m21s) — Telegram OK
- Nebyl proveden deploy, migrace ani zásah do produkčních dat ✅

### PR #14 čistý test-only — Voucher purchase E2E (spec 10) — MERGNUT (14. 05. 2026)

- **Branch:** `test/e2e-voucher-purchase-balance-clean` → `main`
- **Merge commit:** `4cba4b0`
- **Přidané soubory (pouze 4):**
  - `tests/e2e/10-voucher-purchase-balance.spec.ts` — nový Staging Full E2E test
  - `.github/workflows/playwright-staging.yml` — přidány 3 seed/reset kroky
  - `onemil_state.md` — dokumentace
  - `onemil_history.md` — dokumentace
- **Test ověřuje:** login → /contest/:id balance read → /vouchers buy E2E Spec10 Voucher → Zakoupené tab "Uplatnit voucher" → balance decrease o přesně voucherPrice MC
- **Guard:** test.skip pokud `E2E_CONTEST_ID` není nastaven (produkční CI ho nemá)
- **Collision prevention:** E2E Spec10 Voucher seeded s `created_at: "2020-01-01"` (last in list); spec03 používá `.first()` (newest = E2E Spec03 Voucher) — žádná kolize
- **App code nedotčen** — `useUserVouchers.ts` fix je již na main (PR #13)
- **PR #11 uzavřeno bez merge** (bylo smíšené)
- **Pre-merge Staging Full E2E:** run `25882844526` ✅ **16 passed, 3 skipped, 0 failed** (2m0s)
- **Post-merge production smoke:** run `25883126324` ✅ **5 passed (21.7s)** — Telegram OK
- **Post-merge Staging Full E2E na main:** run `25883434451` ✅ **16 passed, 3 skipped, 0 failed** (2m12s) — spec10 prošel 16.5s, Telegram OK
- **Žádná migrace není součástí PR #14** — RLS fix byl proveden manuálně (viz sekce níže)

### Staging user_vouchers RLS — MANUÁLNĚ OPRAVENO (14. 05. 2026)

**Nález:** Stagingový baseline dump vynechal tři RLS policies na tabulce `user_vouchers`. Produkce (`xkzhjldrojjlrkezorey`) měla všechny 4 správné policies. Staging (`dxmowysntemfqfnanxua`) měl pouze `admin_all_voucher_access_secure` (ALL).

**Chybějící policies na stagingu:**
- `user_owns_voucher` (SELECT, `user_id = auth.uid()`) — **kritická** — bez ní `fetchUserVouchers()` vracelo `[]` pro všechny běžné uživatele (PostgREST vrací prázdné pole, ne chybu); tab Zakoupené byl vždy prázdný
- `user_vouchers_insert_own` (INSERT) — chybělo pro přidávání oblíbených přes frontend
- `user_vouchers_delete_own` (DELETE) — chybělo pro odebírání oblíbených přes frontend

**Fix:** Tři policies přidány manuálně na staging přes Supabase MCP. Produkce nedotčena.

**Žádná migrace nebyla commitnuta** v PR #14. Tato oprava je staging infrastrukturní maintenance — není to app kód ani produkční schémová změna.

### PR #13 — useUserVouchers PostgREST embedded join fix — MERGNUT (14. 05. 2026)

- **Branch:** `fix/user-vouchers-fetch` → `main`
- **Merge commit:** `f9719101cf98d6063aaf009f7b50acd2e833c33c`
- **Změněný soubor:** `src/hooks/useUserVouchers.ts` pouze
- **Fix:** dva explicitní dotazy místo `voucher:vouchers!user_vouchers_voucher_id_fkey(...)` — PostgREST embedded join vracel HTTP 400 na stagingu (FK constraint name neshoda), tiše zachycený → `setVouchers([])` → prázdný tab Zakoupené
- **PR smoke:** run `25878064722` ✅ success
- **Post-merge production smoke:** run `25878209886` ✅ success
- **Post-merge Staging Full E2E na main:** run `25878303521` ✅ 15 passed, 3 skipped
- **PR #11 uzavřeno bez merge** (smíšené změny — app kód + testy + CSS)
- Nebyl proveden deploy, migrace ani zásah do produkčních dat ✅

---

### Staging full E2E — ZELENÝ (10. 05. 2026, run `25625184545`)

- Workflow: **Playwright Staging Full E2E** (`.github/workflows/playwright-staging.yml`)
- Trigger: `workflow_dispatch`
- Výsledek: ✅ **ALL PASSED** — 13 passed, 4 skipped (expected), 0 failed, 2m 33s
- Všech 9 spec souborů (`01–08`, plus `03-ticket-purchase` je ve dvou souborech): prošly nebo byly přeskočeny dle očekávání
- Auto-seed win contestu funguje: `STAGING_SUPABASE_SERVICE_ROLE_KEY` → PostgREST INSERT → nový contest s `created_at: "2020-01-01T00:00:00Z"` → ID předáno jako step output
- Wallet reset funguje: PostgREST PATCH nastaví `balance_coins: 5000, bonus_balance_coins: 0` před každým spuštěním testů (commit `50ba68c`)
- Telegram success notifikace doručena: `✅ OneMil STAGING full E2E OK — all specs passed`
- Produkce nedotčena
- **Pipeline je bezpečná k plánování každých 8 hodin** — čeká na schválení

**Commity (stabilizace + wallet reset + signup fix):**
| Commit | Popis |
|--------|-------|
| `3c4aecf` | `ci: keep auto win contest out of games first position` — seed contest dostane `created_at: 2020-01-01` |
| `324a747` | `test: stabilize destructive win flow e2e` — toast scoped na `[data-sonner-toast]`; `retries: 0` |
| `6ee26df` | `test: scope result dialog locator to avoid cookie banner conflict` — `getByRole('dialog', { name: /Výhra/i })` |
| `e70fd5c` | `test: robust wait for offer cards or empty state in partner offer open spec` — `Promise.race` wait |
| `50ba68c` | `ci: reset staging e2e wallet before full run` — wallet reset na 5 000 MioCoin před testy |
| `631f915` | `test: use valid email domain for staging signup` — `@example.com` → `@onemil.cz`; HTTP 400 není skip |

**Signup test — aktuální stav:**
- Email doména: `e2e+${Date.now()}@onemil.cz`
- HTTP 400 se neskipuje — reálný staging signup zůstává testován
- Ověřeno: run `25627706906` ALL PASSED 2m 45s

**Schedule (commit `37cfd6c`):**
| Workflow | Časy (Praha CEST) | Cron |
|----------|-------------------|------|
| Production smoke | 00:00 / 08:00 / 16:00 | `0 22 * * *` / `0 6 * * *` / `0 14 * * *` |
| Staging full E2E | 04:00 / 12:00 / 20:00 | `0 2 * * *` / `0 10 * * *` / `0 18 * * *` |

- Žádný překryv mezi production smoke a staging full E2E
- `workflow_dispatch` zůstává dostupný pro manuální spuštění

**Pravidla (nezměnit):**
- Destruktivní testy (03–08) **nesmí běžet v produkci** — `playwright.yml` je hard-coded pouze na `01-registration` + `02-login`
- Každý run dostane nový win contest a resetovaný wallet; stav se nekumuluje mezi běhy

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

---

## PWA metadata a ikony (13. 05. 2026)

PR #3 byl sloučen do `main` jako bezpečná PWA metadata změna.

Aktuální stav:
- Přidán `public/manifest.webmanifest`.
- Do `index.html` přidán manifest link, `theme-color` a `apple-touch-icon`.
- Do `public/` byly z brand kitu zapojeny pouze schválené trophy ikony:
  - `public/apple-touch-icon.png`
  - `public/android-chrome-192x192.png`
  - `public/android-chrome-512x512.png`
- `src/assets/logo-onemil.png` nebyl použit jako PWA ikona.
- Nebyl přidán service worker.
- Nebylo přidáno offline cachování.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

Ověření:
- PR #3 smoke E2E prošel.
- PR #3 Playwright Staging Full E2E prošel na větvi `codex/pwa-icon-metadata`.
- Po merge do `main` smoke E2E prošel: GitHub Actions run `25807224457`.
- Po merge do `main` Playwright Staging Full E2E prošel: GitHub Actions run `25807653323`.

---

## iPhone/PWA spodní navigace (13. 05. 2026)

PR #4 byl sloučen do `main` jako bezpečný UI/CSS fix pro mobilní PWA navigaci.

Aktuální stav:
- Spodní navigace v mobilním/PWA zobrazení zůstává vizuálně fixovaná dole při scrollování.
- Přidána podpora iPhone safe area přes `viewport-fit=cover` a `env(safe-area-inset-bottom)`.
- Obsah stránky má na mobilu spodní odsazení, aby nebyl schovaný za spodní navigací.
- Ikony, české labely, routy a business logika nebyly měněny.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

Ověření:
- PR #4 smoke E2E prošel.
- PR #4 Playwright Staging Full E2E prošel na větvi `fix/ios-pwa-bottom-navigation`.
- Po merge do `main` smoke E2E prošel: GitHub Actions run `25811447264`.
- Po merge do `main` Playwright Staging Full E2E prošel: GitHub Actions run `25811641231`.

---

## Launch wording cleanup (13. 05. 2026)

PR #5 `Clean launch wording risks` byl sloučen do `main` po ověření smoke + staging E2E.

Aktuální stav:
- Merge commit: `acc43c90d313cbe2bd01adf333d74d3f424905fa`.
- Z public/admin/Bob-visible textů byla odstraněna riziková wording stopa kolem `losy`, `losování`, `jackpot` a `Megajackpot`.
- Texty jsou sjednocené na bezpečnější launch formulace: tikety, otevření tiketů, soutěžní mechanismus, předem určené výherní pozice, hlavní výhra.
- Nebyla změněna business logika.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

Ověření:
- PR #5 smoke E2E prošel.
- PR #5 Playwright Staging Full E2E prošel na větvi `fix/launch-copy-risk-wording-cleanup`.
- Po merge do `main` smoke E2E prošel: GitHub Actions run `25816716804`.
- Po merge do `main` Playwright Staging Full E2E prošel: GitHub Actions run `25816763438`.

---

## Produkční DB launch verification (13. 05. 2026)

Ověření produkční databáze proběhlo pouze read-only přes `SELECT`.

Výsledek:
- `handle_new_auth_user` původní FAIL byl false positive.
- `public.profiles` insert používá pouze `id`, `full_name`, `date_of_birth`, `avatar_url`.
- `handle_new_auth_user` nevkládá `user_id` do `public.profiles`.
- `trigger_sofinity_forward` nevolá `net.http_post` přímo.
- Produkce aktuálně používá legacy Sofinity forwarding path:
  `event_logs / trigger_sofinity_forward -> event_forward_log -> call_event_forward_log_listener -> event_queue -> process_event_queue_worker -> Sofinity`.
- Tato legacy mezivrstva není Web/PWA launch blocker.

Technický dluh po launchi:
- Zvážit zjednodušení legacy cesty `event_forward_log -> event_queue`, ale pouze po samostatném schválení.

Invariant:
- Nebyla změněna data ani schema.
- Nebyly spuštěny migrace.
- Nebyl proveden deploy.
- Nebyly měněny Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, Sofinity, OneSignal ani `buy_ticket_atomic`.

---

## Produkční contest cleanup před Web/PWA launchem (13. 05. 2026)

Produkční launch blocker `active contests missing rules_pdf_url` byl vyřešen.

Co bylo provedeno:
- 7 testovacích soutěží bylo přesunuto ze stavu `active` do `draft` / Archiv test.
- 3 reálné soutěže bez PDF pravidel byly dočasně přesunuty ze stavu `active` do `draft` / Archiv test:
  - BMW S 1000 RR
  - Corvette
  - MY26 CORVETTE C8 Stingray 6.2L V8 - Coupe

Finální ověření:
- PASS: žádné aktivní soutěže nemají chybějící `rules_pdf_url`.

Invariant:
- Žádná soutěž nebyla smazána.
- Nebyly spuštěny migrace.
- Nebyl proveden deploy.
- Nebyl měněn app kód.
- Nebyly měněny Stripe, wallet, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## Stripe Test Mode verification (13. 05. 2026)

Stripe je aktuálně správně v Test mode.

Ověření:
- Testovací top-up pro `e2e@onemil.cz` byl vizuálně dokončen v OneMil a zobrazen ve Stripe.
- Supabase ověření potvrdilo:
  - wallet pro `e2e@onemil.cz` existuje,
  - `balance_coins = 100507.00`,
  - `bonus_balance_coins = 11.00`,
  - latest payment `status = completed`,
  - latest payment `method = stripe`,
  - `stripe_session_id` začíná `cs_test_`,
  - latest payment amount v DB je `1280.00`.

Poznámka před public launchem:
- Amount `1280.00` je potřeba porovnat s vybraným UI balíčkem/bonusem před veřejným spuštěním.

Invariant:
- Nebyla provedena žádná live platba.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyl měněn app kód.
- Nebyly měněny Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## Admin revenue reporting fix (14. 05. 2026)

PR #6 `Separate admin revenue from credited MioCoins` byl sloučen do `main`.

Co bylo opraveno:
- Admin reporting už nezobrazuje `payments.amount` jako Kč tržbu.
- `payments.amount` zůstává evidováno jako připsané MioCoiny.
- `Tržba Kč` je ve frontendu odvozena ze známé mapy MioCoin balíčků:
  - 50 MC -> 50 Kč
  - 310 MC -> 300 Kč
  - 525 MC -> 500 Kč
  - 1280 MC -> 1200 Kč
- Připsané MioCoiny jsou v adminu zobrazeny samostatně.
- Neznámé částky mimo známé balíčky se v Kč tržbě zobrazují jako `neznámé`.

Ověření:
- PR #6 smoke E2E prošel.
- PR #6 Playwright Staging Full E2E prošel na větvi `fix/admin-revenue-miocoin-reporting`.
- Po merge do `main` smoke E2E prošel: GitHub Actions run `25845908864`.
- Po merge do `main` Playwright Staging Full E2E prošel: GitHub Actions run `25845971759`.

Invariant:
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla měněna databázová funkce `get_admin_summary_dashboard`.
- Nebyla měněna Supabase data, Stripe, webhook, wallet, contests, tickets, winners, Partner Offers, Sofinity, OneSignal ani `buy_ticket_atomic`.

---

## get_admin_summary_dashboard follow-up audit (14. 05. 2026)

Po PR #6 hlavní admin reporting správně odděluje `Tržba Kč` a `Připsané MioCoiny`.

Read-only follow-up audit ověřil:
- DB funkce `get_admin_summary_dashboard` stále ve legacy `payments_summary` formátuje `payments.amount` jako Kč.
- `payments.amount` přitom zůstává připsaný počet MioCoinů, ne zaplacená Kč částka.
- Funkce je v živém kódu používána pouze v `AdminValidationWorkflows` / admin validation tabu.
- Hlavní admin revenue reporting po PR #6 na tuto legacy hodnotu nespoléhá.
- Toto není Web/PWA launch blocker.

Technický dluh po launchi:
- Buď přestat ve frontend validačním tabu zobrazovat raw `payments_summary`,
- nebo později upravit DB funkci přes samostatně schválenou migraci.

Invariant:
- Během auditu nebyly změněny soubory, app kód, data ani schema.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.

---

## MioCoin top-up package verification (14. 05. 2026)

MioCoin top-up package mapping bylo ověřeno read-only.

Potvrzené mapování:
- 50 Kč -> 50 MioCoinů
- 300 Kč -> 310 MioCoinů
- 500 Kč -> 525 MioCoinů
- 1200 Kč -> 1280 MioCoinů

Ověřené plochy:
- Homepage top-up balíčky
- Profile top-up balíčky
- PaymentSuccess analytické mapování
- `paymentReporting` admin reporting helper
- `create-stripe-checkout` serverové mapování ceny na MioCoiny
- `stripe-webhook` mapování zaplacené Kč částky na připsané MioCoiny
- Admin reporting po PR #6

Výsledek:
- Homepage, Profile, PaymentSuccess, `paymentReporting`, `create-stripe-checkout`, `stripe-webhook` a admin reporting mapping jsou sladěné.
- Nebyla nalezena žádná neshoda.
- Toto není Web/PWA launch blocker.

Invariant:
- Během auditu nebyly změněny soubory, app kód, data ani schema.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, payments, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## Production contest status cleanup (14. 05. 2026)

Produkční contest status cleanup byl dokončen před veřejným Web/PWA launchem.

Zaznamenaný stav:
- Poslední aktivní testovací soutěž `bmw` byla přesunuta ze stavu `active` do `draft`.
- Finální produkční stav soutěží:
  - `active = 0`
  - `closed = 19`
  - `draft = 76`

Výklad:
- Žádné soutěže nebyly smazány.
- Tento stav je správný, protože OneMil ještě není oficiálně veřejně spuštěný.
- Public launch bude vyžadovat vytvoření nebo aktivaci pouze reálných soutěží s dokončenými PDF pravidly.

Invariant:
- Nebyl měněn app kód.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- V rámci tohoto dokumentačního záznamu nebyla dotčena Supabase data, Stripe, wallet, payments, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## Affiliate program wording merge (14. 05. 2026)

PR #7 `Rename influencer UI to Affiliate program` byl sloučen do `main`.

Změna:
- Viditelné UI/admin označení `Influencer` bylo přejmenováno na `Affiliate program` / `Affiliate partner`.
- `/influencer` routes zůstávají beze změny kvůli bezpečnosti a kompatibilitě.
- Interní DB názvy `influencer_*` zůstávají beze změny.
- Nebyly změněny provize, tracking, login/routing, DB ani business logika.

Ověření:
- Smoke E2E prošel na PR #7.
- Playwright Staging Full E2E prošel na větvi `fix/affiliate-program-wording`.
- Po merge do `main` prošel Smoke E2E: run `25859772102`.
- Po merge do `main` prošel Playwright Staging Full E2E: run `25859844919`.

Invariant:
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, commissions, tracking, routes, login behavior ani `buy_ticket_atomic`.

---

## Visible referral / Influencer wording cleanup (14. 05. 2026)

PR #9 `Clean visible referral and influencer wording` byl sloučen do `main`.

Změna:
- Viditelné UI/admin wording `referral` bylo nahrazeno českým wordingem `doporučení` / `doporučovací`.
- Viditelné admin wording `Influencer` bylo nahrazeno wordingem `Affiliate partner`.
- `/influencer` routes zůstávají beze změny.
- Interní DB/table/function názvy `influencer_*` a interní `referral_*` názvy zůstávají beze změny kvůli kompatibilitě.
- Nebyly změněny routes, DB, tracking, provize, login/routing, Stripe, wallet, contest, ticket, winner, Partner Offers ani `buy_ticket_atomic`.

Ověření:
- Smoke E2E prošel na PR #9.
- Playwright Staging Full E2E prošel na větvi `fix/visible-referral-affiliate-wording`.
- Po merge do `main` prošel Smoke E2E: run `25862999591`.
- Po merge do `main` prošel Playwright Staging Full E2E: run `25863074687`.

Invariant:
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, commissions, tracking, routes, login behavior ani `buy_ticket_atomic`.

---

## Footer Affiliate wording fix (14. 05. 2026)

PR #8 `Update footer Affiliate wording` byl sloučen do `main`.

Změna:
- Zbývající viditelné footer texty `Pro influencery`, `Registrace influencera` a `Přihlášení influencera` byly nahrazeny wordingem `Affiliate program` / `Affiliate partner`.
- Existující URL/routes zůstaly beze změny.
- Nebyly změněny DB, logika, provize, tracking ani login/routing.

Ověření:
- Smoke E2E prošel na PR #8.
- Playwright Staging Full E2E prošel na větvi `fix/footer-affiliate-wording`.
- Po merge do `main` prošel Smoke E2E: run `25861584394`.
- Po merge do `main` prošel Playwright Staging Full E2E: run `25861663913`.

Invariant:
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, commissions, tracking, routes, login behavior ani `buy_ticket_atomic`.

---

## E2E COVERAGE — WALLET BALANCE (14. 05. 2026)

### PR #10 — Add wallet balance E2E coverage — mergnut do `main`

- Zdrojová větev: `test/e2e-wallet-balance`; cílová větev: `main`.
- Merge commit: `6e32ec7e6df079eb1594e7335ec735c41a2bab47`.
- Přidán nový spec soubor: `tests/e2e/09-wallet-balance.spec.ts`

### Co test ověřuje

- Peněženka (wallet balance) se sníží přesně o hodnotu `ticket_price` MC po nákupu jednoho tiketu.
- Balance je čitelná z `/contest/:id` UI před nákupem.
- Snížení se odráží ve stejném UI bez reload stránky (ověřeno pomocí interceptu `loadUserBalance()` GET `/rest/v1/wallets`).
- Test čeká na `TicketResultModal` (dialog scoped přes `[role="dialog"]:has(button[aria-label="Zavřít"])`) a zavírá ho Escape.

### Ochranné guards

- Test se přeskočí, pokud `E2E_TEST_EMAIL` nebo `E2E_TEST_PASSWORD` nejsou nastaveny.
- Test se přeskočí, pokud `E2E_CONTEST_ID` není nastaven — **production CI tuto secret nemá, test proto NIKDY neběží na produkci**.
- Production Smoke je hard-coded na specs 01+02 — spec 09 tam nefiguruje.

### Regrese zachycené testem

- `buy_ticket_atomic` přestane strhávat wallet.
- UI přestane obnovovat balance po nákupu (odebrání `loadUserBalance`).
- Ticket price se změní bez aktualizace wallet dedukce.
- Czech locale formátování balance se rozbije (`toLocaleString("cs-CZ")` non-breaking space).

### Opravený bug v selektoru (před mergem)

- První staging run selhal: Playwright strict mode violation — `.or()` lokátor vyřešil na 2 elementy, protože ContestDetail zobrazuje buy button i top-up button současně.
- Fix: přidáno `.first()` do `.or()` lokátoru (commit `672d241`).

### Výsledky CI (po mergi do `main`)

- Post-merge Smoke E2E: ✅ 1m13s — run `25864204537`.
- Post-merge Playwright Staging Full E2E: ✅ 2m44s — run `25864280989`, ALL PASSED, Telegram OK.

### Invariant

- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet logika, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.
- Staging Full E2E nyní ověřuje: wallet balance klesne přesně o `ticket_price` po nákupu tiketu.
- Production Smoke zůstává lightweight a non-mutating (pouze specs 01+02).

---

## Mobile/PWA Messages fixed layout (14. 05. 2026)

PR #12 `Fix mobile PWA messages scroll layout` byl sloučen do `main`.

Změna:
- Mobile/PWA Messages layout byl upraven tak, aby horní Messages header zůstal stabilní.
- Spodní message composer zůstává stabilní nad fixed bottom navigation.
- Scrolluje pouze seznam zpráv mezi headerem a composerem.
- Bottom navigation zůstává fixed.
- Layout respektuje iPhone safe area a fixed bottom navigation.

Ověření:
- Smoke E2E prošel na PR #12.
- Playwright Staging Full E2E prošel na větvi `fix/mobile-messages-fixed-header-composer`: run `25876737161`.
- Po merge do `main` prošel Smoke E2E: run `25876891113`.
- Po merge do `main` prošel Playwright Staging Full E2E: run `25877013278`.

Invariant:
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla změněna Bob/AI logika ani message sending logika.
- Nebyly změněny routes, DB, Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, Affiliate ani `buy_ticket_atomic`.

---

## E2E COVERAGE - VOUCHER REDEEM DETAIL (14. 05. 2026)

### PR #15 - Add voucher redeem E2E coverage - mergnut do `main`

- Zdrojova vetev: `test/e2e-voucher-redeem`; cilova vetev: `main`.
- Merge commit: `72810c94b3ce0397faf8246eb5e3820022d82203`.
- Pridan novy staging-only spec soubor: `tests/e2e/11-voucher-redeem.spec.ts`.
- Staging workflow `playwright-staging.yml` nove seeduje dedikovany `E2E Spec11 Voucher` a zakoupeny `user_vouchers` radek pro E2E uzivatele.

### Co test overuje

- Prihlaseni staging E2E uzivatele.
- `/vouchers?tab=purchased` a zalozku `Zakoupene`.
- Viditelnost zakoupeneho `E2E Spec11 Voucher`.
- Otevreni redeem/detail modalu pres `Uplatnit voucher`.
- Viditelnost voucher kodu ve formatu `OMV-XXXXXXXX`.
- Shodu kodu na karte a v modalu.
- Viditelnost a klikatelnost tlacitka `Zkopirovat kod`.

### Production Smoke

- Production Smoke zustava lightweight a unchanged.
- Production Smoke dal spousti pouze specs 01 + 02.
- Spec 11 je chraneny staging-only guardem pres `E2E_CONTEST_ID`, ktery production CI nema.

### Vysledky CI

- PR #15 Smoke E2E prosel: run `25884819703`.
- PR #15 Playwright Staging Full E2E prosel na vetvi `test/e2e-voucher-redeem`: run `25884822640`.
- Po merge do `main` prosel Smoke E2E: run `25885049877`.
- Po merge do `main` prosel Playwright Staging Full E2E: run `25885285280`.

### Invariant

- Nebyl proveden deploy.
- Nebyly spusteny migrace.
- Nebyl zmenen app kod.
- Nebyla zmenena DB, Supabase data, Stripe, wallet logika, contests, tickets, winners, Partner Offers, routes, tracking, login behavior ani `buy_ticket_atomic`.
