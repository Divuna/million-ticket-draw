# OneMil – aktuální stav projektu

**Aktualizováno:** 24. 04. 2026 (CI & Payment Pipeline stabilization)

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

**Plný brand kit:** `docs/brand/onemil_brand_kit/graphics.md`

### Směr
- **Dark premium tech-luxury** — ne casino, ne gambling, ne lottery kitsch
- Zakázané vizuály i slovník: casino, gambling, betting, jackpot, roulette, chips, slot-machine

### Typografie
- Nadpisy / display: **Poppins** 600–800
- Body / UI text: **Inter** 400–500

### Barvy
- Pozadí: `#0A0A0F` (deep) / `#13131A` (surface) / `#1C1C28` (elevated)
- Hlavní akcent: **oranžová** `#FF6B00`
- Logo: **metallic silver / platinum** gradient

### Logo
- **Primární:** trophy / číslo „1" *za* wordmarkem OneMil (wordmark v popředí)
- **Sekundární:** trophy *nad* wordmarkem (stacked, pro čtvercové formáty)
- Export: PNG 512 × 512, PNG 1024 × 1024, SVG, banner 1600 × 900

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
