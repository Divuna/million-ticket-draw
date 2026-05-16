# OneMil — DEVELOPMENT HISTORY (CHRONOLOGICAL ONLY)

**Timestamp (Europe/Prague): 2026-04-13 20:46:33 +02:00** (poslední dokumentační synchronizace)

## Strict header (do not break)
### What belongs in this file
- Only **dated chronological history** (what happened and when).
- Keep entries short and factual; link to concrete artifacts (migrations, functions, pages) where possible.

### What must never be written here
- Current state summaries, invariants, "what is working/broken now" (belongs to `onemil_state.md`).
- Mixed state+history blocks or duplicated state dumps.
- Undated narrative dumps.

---

## 2026-05-16 — PR #26 read-only admin ekonomika soutěže mergnuta

### Co bylo provedeno
- PR #26 **feat: add read-only contest economy panel** byl mergnut do `main`.
- Zdrojová větev: `feature/read-only-contest-economy-panel`; cílová větev: `main`.
- Merge commit: `5f5eb28b17c0cab2b8eaa47e360d75b34252ba59`.
- Změněn jediný soubor: `src/components/AdminContestManagement.tsx`.
- Admin modal pro vytvoření/editaci soutěže má nový read-only tab **„Ekonomika"**.
- Panel počítá hrubou tržbu, DPH, čistou tržbu, náklad na hlavní výhru, náklad na MioCoin bonusy, balné/poštu/práci, jednorázový setup/distribuční náklad, marketingový náklad, celkové odhadované náklady, odhadovaný zisk, marži, bod zvratu v počtu ticketů a doporučenou minimální cenu ticketu.
- Ekonomické předpoklady se resetují při změně modal kontextu, aby se nepřenášely mezi novou soutěží, editací a znovuotevřením modalu.
- Panel je frontend-only a zatím nic neukládá do Supabase.
- Nebyl změněn `buy_ticket_atomic`, `bonus_prizes` schema, Partner Offers, winner logic, ticket purchase logic, migrace ani finální save behavior.
- PR smoke check prošel. Nebyl proveden manuální deploy.

---

## 2026-05-15 — PR #24 + PR #25 Admin Affiliate pages smoke test přidán a aktivován (spec 15)

### Co bylo provedeno
- Staging admin E2E účet vytvořen: `admin-e2e@onemil.cz`, id `3960e47f-b583-4ef9-a48f-786bfe432bbd`, `public.user_roles.role=admin` (staging only, produkce nedotčena).
- GitHub Secrets přidány: `STAGING_E2E_ADMIN_EMAIL`, `STAGING_E2E_ADMIN_PASSWORD`.
- PR #24 `test/e2e-admin-affiliate-pages-smoke` → `main` (merge commit `8a8ba05`): přidán `tests/e2e/15-admin-affiliate-pages-smoke.spec.ts` — read-only smoke pro 3 admin Affiliate stránky.
- PR #25 `test/wire-admin-e2e-secrets` → `main` (merge commit `024fd92`): 2 řádky v `playwright-staging.yml` — `E2E_ADMIN_EMAIL` + `E2E_ADMIN_PASSWORD`.
- Post-merge Staging Full E2E run `25942146994` ✅ — **23 passed, 3 skipped, 0 failed** — spec 15 RUNS (ne skip) a prošel za 10.5s. Telegram OK.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

## 2026-05-15 — PR #23 Affiliate E2E secrets zapojeny do staging workflow, spec 14 aktivován

### Co bylo provedeno
- PR #23 **ci: wire Affiliate E2E secrets into staging workflow (spec 14)** byl mergnut do `main` (merge commit `ecf7abf`).
- Zdrojová větev: `test/wire-affiliate-e2e-secrets`; cílová větev: `main`.
- Změna: 2 řádky přidány do `.github/workflows/playwright-staging.yml` — `E2E_AFFILIATE_EMAIL` a `E2E_AFFILIATE_PASSWORD` namapovány ze `STAGING_E2E_AFFILIATE_EMAIL` / `STAGING_E2E_AFFILIATE_PASSWORD` secrets.
- Staging Affiliate E2E účet vytvořen v staging DB (`dxmowysntemfqfnanxua`, pouze staging):
  - `auth.users`: `affiliate-e2e@onemil.cz`, id `8975593e-cc27-4f6b-ba23-c7077c914f38`, e-mail potvrzen.
  - `public.partners`: `status=approved`, `notes={"type":"influencer"}`, `auth_user_id` propojen.
- GitHub Secrets přidány: `STAGING_E2E_AFFILIATE_EMAIL`, `STAGING_E2E_AFFILIATE_PASSWORD`.
- Post-merge Staging Full E2E run `25941172937` ✅ — **22 passed, 3 skipped, 0 failed** — spec 14 RUNS (ne skip) a prošel za 4.9s. Telegram OK.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

## 2026-05-15 — PR #22 spec 10 flaky E2E test opraven a mergnut do main

### Co bylo provedeno
- PR #22 **fix: stabilize voucher balance E2E test (spec 10)** byl mergnut do `main`.
- Zdrojová větev: `fix/e2e-voucher-balance-before-read`; cílová větev: `main`.
- Merge commit: `3d645d7b98f5650c0a0f29c86f24f8ac87ff85cf`.
- Změněn jediný soubor: `tests/e2e/10-voucher-purchase-balance.spec.ts` (+16 / −1).

### Root cause flaky testu
- Spec 10 číst „before" zůstatek peněženky bez `waitForResponse` — UI mohlo zobrazit hodnotu před doběhnutím `loadUserBalance()` nebo zachytit hodnotu ovlivněnou async vedlejším efektem z předchozího spec 09.
- „After" čtení již `waitForResponse(GET /rest/v1/wallets)` mělo. Asymetrie způsobila nestabilitu při těsném spouštění dvou staging runů (PR #21 branch run + PR #21 post-merge run).
- Naměřeno: 15 MC pokles místo očekávaných 5 MC → assertion selhala.

### Oprava
- Přidán `waitForResponse(GET /rest/v1/wallets)` armovaný před `page.goto()` a awaited před čtením hodnoty — symetrizuje „before" a „after" čtení.

### PR #21 nebyl příčinou
- Spec 14 (přidaný v PR #21) v obou runech skipoval čistě. Selhání bylo pre-existing flakiness spec 10.

### CI výsledky
- Pre-merge branch Staging Full E2E: run `25939178932` ✅ 21 passed, 4 skipped, spec 10 ✅ (17.0s)
- Post-merge production smoke: run `25939417571` ✅ 5 passed (20.7s) — Telegram OK
- Post-merge Staging Full E2E na main: run `25939483233` ✅ **21 passed, 4 skipped, 0 failed**, spec 10 ✅ (13.4s) — Telegram OK
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-15 — PR #21 Affiliate dashboard login smoke test mergnut do main

### Co bylo provedeno
- PR #21 **test: Affiliate dashboard login smoke (spec 14)** byl mergnut do `main`.
- Zdrojová větev: `test/e2e-affiliate-dashboard-smoke`; cílová větev: `main`.
- Merge commit: `b868aaf183ceeee71544832c43e23758cf46d809`.
- Přidán jediný soubor: `tests/e2e/14-affiliate-dashboard-smoke.spec.ts` (115 řádků).
- **Co test ověřuje:** přihlášení schváleného Affiliate partnera přes `/partner/login` → redirect `/influencer/dashboard` → badge „Aktivní Affiliate partner" → H1 → sekce „Váš Affiliate odkaz" → `input[readonly]` s `/?ref=` vzorem.
- **Guard:** `test.skip` pokud `E2E_AFFILIATE_EMAIL` / `E2E_AFFILIATE_PASSWORD` chybí — spec 14 skipuje čistě v production smoke i staging full E2E bez secrets.
- Read-only test — bez Supabase write, bez form submission dat, bez vytváření uživatelů.
- Chybějící follow-up: staging secrets `STAGING_E2E_AFFILIATE_EMAIL` + `STAGING_E2E_AFFILIATE_PASSWORD` nutné pro aktivaci spec 14 v CI.
- Post-merge staging full E2E selhal na spec 10 (flaky timing — nesouvisí). Opraveno v PR #22.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-15 — PR #20 Affiliate public pages E2E regression guard merged into main

### Co bylo provedeno
- PR #20 **test: E2E regression guard for public Affiliate program pages** byl mergnut do `main`.
- Zdrojová větev: `test/e2e-affiliate-landing`; cílová větev: `main`.
- Merge commit: `0f5f864`.
- Přidán jediný soubor: `tests/e2e/13-affiliate-landing.spec.ts` (159 řádků, 3 testy).
- **Co test ověřuje (3 read-only testy, bez auth):**
  - `/influencer` — „Affiliate program OneMil" chip, H1, CTA tlačítko + href `/influencer/register`, „Jak to funguje" link + href `/influencer/how-to-earn`.
  - `/influencer/how-to-earn` — H1, „Sdílejte Affiliate odkaz" (krok 1), zpětný odkaz `/influencer`, dolní CTA.
  - `/influencer/register` — CardTitle „Registrace Affiliate partnera", vstupy name/email/password/mainPlatformUrl, zpětný odkaz; formulář **neodesílán**.
- **Read-only:** bez auth, bez form submission, bez Supabase write. Bez env proměnných — plně veřejné stránky.
- Chytí regresi při návratu „Influencer" wordingu nebo rozbití navigace / formuláře.
- Lokální Windows `spawn UNKNOWN` je pre-existující problém identický pro spece 01–13; CI (Ubuntu) prochází.
- Bob, odesílání zpráv, routy, DB, Supabase, Stripe, wallet, soutěže, tikety, výhry, Partner Offers, Affiliate tracking, `buy_ticket_atomic` — nedotčeny.
- PR branch Staging Full E2E: run `25936217257` ✅ ALL PASSED.
- Post-merge production smoke: run `25936393035` ✅ SUCCESS — Telegram `OneMil PROD smoke OK` doručen.
- Post-merge Staging Full E2E na main: run `25936408552` ✅ ALL PASSED — Telegram `OneMil STAGING full E2E OK` doručen.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-15 — PR #19 Mobile Messages layout E2E regression guard merged into main

### Co bylo provedeno
- PR #19 **test: E2E regression guard for mobile Messages layout** byl mergnut do `main`.
- Zdrojová větev: `test/e2e-mobile-messages-layout`; cílová větev: `main`.
- Merge commit: `c27a103`.
- Přidán jediný soubor: `tests/e2e/12-mobile-messages-layout.spec.ts` (152 řádků).
- **Co test ověřuje (iPhone 14 viewport 390×844):**
  - Spodní navigace (`role="navigation" aria-label="Hlavní menu"`) je visible na `/messages`.
  - Spodní hrana navigace dosahuje viewport dna (`position: fixed` funguje).
  - Composer input (`placeholder="Napište zprávu..."`) je viditelný a jeho spodní hrana je nad horní hranou navigace.
  - Po scrollu messages listu se Y pozice navigace nezmění (≤ 2px tolerance) — hlídá regresi PR #17/18.
  - Po scrollu je composer stále viditelný nad navigací.
- **Read-only:** žádná zpráva neodeslána, žádná data nemutována, žádný Supabase write.
- Lokální Windows `spawn UNKNOWN` je pre-existující problém identický pro všechny spece 01–11; CI (Ubuntu) projde.
- Bob, odesílání zpráv, routy, DB, Supabase, Stripe, wallet, soutěže, tikety, výhry, Partner Offers, `buy_ticket_atomic` — nedotčeny.
- PR branch Staging Full E2E: run `25935324024` ✅ ALL PASSED (3m02s).
- Post-merge production smoke: run `25935503396` ✅ SUCCESS — Telegram `OneMil PROD smoke OK` doručen.
- Post-merge Staging Full E2E na main: run `25935550724` ✅ ALL PASSED — Telegram `OneMil STAGING full E2E OK` doručen.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-15 — PR #18 Messages bottom nav stability fix merged into main

### Co bylo provedeno
- PR #18 **fix: keep bottom nav stable on messages page** byl mergnut do `main`.
- Zdrojová větev: `fix/bottom-nav-stable-messages`; cílová větev: `main`.
- Merge commit: `dc94f61`.
- Změněn jediný soubor: `src/index.css` (5 řádků — přidán `min-height: 100dvh` k `.customer-layout` v `@media (max-width: 768px)`).
- **Root cause:** Po PR #17 (odstraněna třída `min-h-screen`) byla `.customer-layout` kratší než viewport (`100dvh − 5.75rem − safeArea`). iOS Safari rubber-band-scrolluje celou stránku — včetně `position: fixed` elementů — kdykoli se vnitřní scroll messages listu dostane na konec a dokument je kratší než viewport. Spodní navigace se tak vizuálně hýbala při scrollu.
- **Fix:** Přidán `min-height: 100dvh` k `.customer-layout` pro mobil. Customer-layout nyní vždy vyplňuje celý viewport → nulový prostor pro rubber-band scroll → spodní navigace zůstává pevně dole. Oprava kompozitoru z PR #17 zůstává zachována.
- Bob, odesílání zpráv, routy, DB, Supabase, Stripe, wallet, soutěže, tikety, výhry, Partner Offers, `buy_ticket_atomic` — nedotčeny.
- PR branch smoke: run `25889262610` ✅ SUCCESS.
- Pre-merge Staging Full E2E na PR větvi: run `25889352492` ✅ ALL PASSED (3m21s).
- Post-merge production smoke: run `25889554142` ✅ SUCCESS — Telegram `OneMil PROD smoke OK` doručen.
- Post-merge Staging Full E2E na main: run `25889587366` ✅ ALL PASSED — Telegram `OneMil STAGING full E2E OK` doručen.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-15 — PR #17 Messages composer fix merged into main

### Co bylo provedeno
- PR #17 **fix: keep messages composer above bottom nav** byl mergnut do `main`.
- Zdrojová větev: `fix/messages-composer-above-bottom-nav`; cílová větev: `main`.
- Merge commit: `42a06f6`.
- Změněn jediný soubor: `src/pages/Messages.tsx` (1 řádek — odstraněna třída `min-h-screen`).
- **Root cause:** `index.css` definuje `.messages-mobile-fixed-shell` pro `@media (max-width: 768px)` s `height: calc(100dvh - 5.75rem - env(safe-area-inset-bottom, 0px))`. Tailwindová třída `min-h-screen` (`min-height: 100vh`) tuto hodnotu přebíjela přes CSS cascade — shell narůstal na plnou výšku viewportu, vstupní pole skončilo za pevnou spodní navigací na iPhone/PWA.
- **Fix:** Odstraněna třída `min-h-screen`. CSS třída `.messages-mobile-fixed-shell` nyní funguje bez konfliktu — shell má na mobilu správnou výšku, zprávy scrollují uvnitř svého kontejneru, vstupní pole je celé viditelné nad spodní navigací.
- Bob, odesílání zpráv, routy, DB, Supabase, Stripe, wallet, soutěže, tikety, výhry, Partner Offers, `buy_ticket_atomic` — nedotčeny.
- PR smoke: run `25887802417` ✅ 5 passed.
- Pre-merge Staging Full E2E: run `25887887248` ✅ 17 passed, 3 skipped, 0 failed.
- Post-merge production smoke: run `25888181338` ✅ 5 passed — Telegram `OneMil PROD smoke OK` doručen.
- Post-merge Staging Full E2E na main: run `25888244060` ✅ 17 passed, 3 skipped, 0 failed — Telegram `OneMil STAGING full E2E OK` doručen.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-14 — Voucher purchase E2E spec 10 — čistý test-only PR #14 + staging RLS fix

### Co bylo provedeno
- PR #11 (`test/e2e-voucher-purchase-balance`) byl uzavřen bez merge — obsahoval smíšené změny (app hook, CSS, testy, workflow seed).
- Appový bugfix extrahován a mergnut odděleně jako PR #13 (`fix/user-vouchers-fetch`, merge commit `f9719101`).
- Otevřen nový čistý test-only PR #14 z větve `test/e2e-voucher-purchase-balance-clean` (base: `main` @ `c9d8123`).
- PR #14 obsahuje pouze 4 soubory: `tests/e2e/10-voucher-purchase-balance.spec.ts`, `.github/workflows/playwright-staging.yml`, `onemil_state.md`, `onemil_history.md`.
- Spec 10 ověřuje: login → balance read → voucher purchase → Zakoupené tab → balance decrease o přesně voucherPrice MC.
- Workflow rozšířen o 3 seed/reset kroky: Reset test user vouchers, Seed E2E Spec03 voucher, Seed E2E Spec10 voucher.
- Žádný app kód nebyl změněn. `useUserVouchers.ts` fix je na main od PR #13.

### Staging RLS nález a manuální oprava
- **Nález:** spec 10 selhával na „Uplatnit voucher" — tab Zakoupené byl vždy prázdný i po úspěšném nákupu.
- **Root cause:** Stagingový baseline dump vynechal `user_owns_voucher` SELECT policy na `user_vouchers`. PostgREST vracel `[]` (žádná chyba) → `fetchUserVouchers()` vracelo prázdné pole → `purchasedVouchers = []`.
- **Produkce:** měla správně všechny 4 policies (`user_owns_voucher` SELECT, `user_vouchers_insert_own` INSERT, `user_vouchers_delete_own` DELETE, `admin_all_voucher_access_secure` ALL).
- **Oprava:** 3 chybějící policies přidány manuálně na staging via Supabase MCP. Produkce nedotčena.
- **Žádná migrace nebyla commitnuta** v PR #14 — jde o staging infrastrukturní maintenance.
- **Pre-merge Staging Full E2E:** run `25882844526` ✅ **16 passed, 3 skipped, 0 failed** (2m0s).
- **PR #14 mergnut** do `main`, merge commit `4cba4b0`.
- **Post-merge production smoke:** run `25883126324` ✅ **5 passed (21.7s)** — Telegram `OneMil PROD smoke OK` doručen.
- **Post-merge Staging Full E2E na main:** run `25883434451` ✅ **16 passed, 3 skipped, 0 failed** (2m12s) — spec10 prošel 16.5s — Telegram `OneMil STAGING full E2E OK` doručen.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-14 — PR #13 useUserVouchers PostgREST embedded join fix merged into main

### Co bylo provedeno
- PR #13 **fix: replace PostgREST embedded join in useUserVouchers with two explicit queries** byl mergnut do `main`.
- Zdrojová větev: `fix/user-vouchers-fetch`; cílová větev: `main`.
- Merge commit: `f9719101cf98d6063aaf009f7b50acd2e833c33c`.
- Změněn jediný soubor: `src/hooks/useUserVouchers.ts` (+62 / -21 řádků).
- **Root cause opravené chyby:** `fetchUserVouchers()` používal PostgREST embedded join s explicitním FK hintem `!user_vouchers_voucher_id_fkey`. Na stagingové DB (obnovené z produkčního dumpu) PostgREST vrátil HTTP 400, který byl tiše zachycen blokem `try/catch` → `setVouchers([])` → tab Zakoupené zobrazoval prázdný stav i když `user_vouchers` řádky v DB existovaly.
- **Fix:** dva explicitní dotazy místo embedded joinu — (1) `user_vouchers` bez joinu, (2) `vouchers` dle batche ID; výsledky spojeny v Map na frontendu. Pole `voucher` přidáno jako `| null` — bezpečné, protože `expiration.isExpired` v `Vouchers.tsx` závisí jen na `created_at` z `user_vouchers`.
- Před mergem prošel PR smoke E2E (run `25878064722`, 15 passed, success).
- Po mergi do `main` prošel production smoke (run `25878209886`, success).
- Po mergi spuštěn Playwright Staging Full E2E na `main` (run `25878303521`, 15 passed + 3 skipped, success, Telegram OK). Spec 10 (`10-voucher-purchase-balance`) není v `main` — zůstává na PR #11 (`test/e2e-voucher-purchase-balance`).
- PR #11 zůstává OPEN a nemergnuto.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.
- Nebyly změněny Supabase, Stripe, wallet logika, contests, tickets, winners, Partner Offers, schéma, RLS ani `buy_ticket_atomic`.

---

## 2026-05-14 — PR #10 wallet balance E2E coverage merged into main

### Co bylo provedeno
- PR #10 **Add wallet balance E2E coverage** byl mergnut do `main`.
- Zdrojová větev: `test/e2e-wallet-balance`; cílová větev: `main`.
- Merge commit: `6e32ec7e6df079eb1594e7335ec735c41a2bab47`.
- Přidán soubor `tests/e2e/09-wallet-balance.spec.ts` — nový Staging Full E2E test.
- Test ověřuje, že wallet balance klesne přesně o `ticket_price` MC po nákupu jednoho tiketu na `/contest/:id`.
- Test je staging-only a přeskočí se automaticky pokud `E2E_CONTEST_ID` není nastaven (production CI ho nemá) — production dat se nedotýká.
- Během vývoje na feature větvi byl identifikován a opraven Playwright strict mode violation (`.or()` lokátor vyřešil na 2 elementy — ContestDetail zobrazuje buy i top-up button současně). Fix: `.first()` přidáno ke kombinovanému lokátoru (commit `672d241`).
- Před mergem prošel PR smoke E2E (specs 01+02, 1m18s) i Playwright Staging Full E2E (2m38s, ALL PASSED).
- Po mergi do `main` prošel production smoke (run `25864204537`, 1m13s) i Playwright Staging Full E2E (run `25864280989`, 2m44s, ALL PASSED, Telegram OK).
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.
- Nebyly změněny Supabase, Stripe, wallet logika, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-13 — Store policy copy cleanup PR #2 merged and post-merge validation passed

### Co bylo provedeno
- PR #2 **Store policy copy cleanup: 18+ and ticket order model** byl mergnut do `main`.
- Zdrojová větev: `feature/store-policy-18plus-ticket-order-copy`; cílová větev: `main`.
- Commit PR: `459367299d93bc1b57355b3ee3398be391a6cda7`.
- Merge commit: `c132be9ff60e15884d84f38d486c53dcb7f94666`.
- Změněno bylo pouze 6 schválených souborů:
  - `src/pages/ContestDetail.tsx`
  - `src/pages/Games.tsx`
  - `src/pages/OnboardingDateOfBirth.tsx`
  - `src/pages/PrivacyPolicy.tsx`
  - `src/pages/TermsConditions.tsx`
  - `src/pages/Vouchers.tsx`
- Veřejný launch age rule sjednocen na **18+**.
- Veřejná copy odstranila loterijní / random-generator framing a používá model: tikety se otevírají postupně v pořadí 1, 2, 3... a výherní pozice jsou předem určeny.
- MioCoin wording sjednocen: interní kredit OneMil, nelze vybrat jako peníze, nelze převádět mimo OneMil, lze použít pouze uvnitř OneMil.
- Charitativní wording upraven: vybrané kampaně mohou podporovat dobročinný účel a konkrétní příjemce / účel / výše podpory musí být uvedeny u dané kampaně.
- Před mergem prošlo PR smoke E2E a Playwright Staging Full E2E na feature větvi.
- Po mergi prošel `main` smoke workflow `25795875077`.
- Po mergi prošel Playwright Staging Full E2E na `main`, workflow `25795953772`.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.
- Nebyly měněny Supabase, Stripe, OneSignal, Sofinity, wallet, contest engine, tickets, winners, bonus_prizes, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-12 — Paperclip AI team first live session

### Co bylo provedeno
- Paperclip server spuštěn lokálně na portu 3100 z `C:\Users\divis\Desktop\Onemil - Projekt\million-ticket-draw`.
- Claude Code (claude.exe v2.1.138) ověřen jako funkční adaptér; přihlášen jako divispavel2@gmail.com (Pro).
- Codex local adaptér otestován a funkční na Windows s Extra args: `--skip-git-repo-check`.
- Vytvořen a nakonfigurován agent **Provozní ředitel OneMil** (claude_local / codex_local).
- Vytvořen a nakonfigurován agent **Průzkumník obchodních leadů OneMil** (codex_local, Enable search ON).
- Duplikátní firma iCONIC POINT s.r.o. (prefix ICOA) smazána; zbyla pouze ICO.
- Projekt **OneMil** vytvořen pod firmou ICO; Provozní ředitel nastaven jako lead agent.
- Vytvořeny issues ICO-15 až ICO-19 (lead scouting, shortlist, kontakty, Dedoles one-pager, AI team návrh).
- Výstupy uloženy do `C:\Users\divis\Desktop\OneMil Paperclip Outputs`.
- Zjištěno a zdokumentováno pravidlo: Provozní ředitel je manažer, ne exekutor — deleguje na Průzkumníka.
- `onemil_state.md`, `onemil_history.md`, `CLAUDE.md` a `PAPERCLIP_SETUP_CONTEXT.md` aktualizovány.
- Žádný app kód, Supabase, migrace, workflow ani produkční systémy nebyly změněny.

---

## 2026-05-13 — Strategické rozhodnutí: Web/PWA first, native stores odloženy

### Co bylo rozhodnuto
- OneMil bude spuštěn nejdříve jako **Web/PWA**.
- Podání do **Apple App Store** a **Google Play** se odkládá.
- Důvod: OneMil nebude v této fázi platit Apple/Google poplatky 15–30 % z nákupů MioCoinů.
- Stripe zůstává platebním providerem pro **Web/PWA MioCoin top-up**.
- Budoucí nativní iOS/Android aplikace lze znovu zvážit pouze po schválení platební/store strategie.

### Read-only PWA audit
- Ověřeno, že aktivní `public/` zatím neobsahuje zapojený web app manifest ani PWA icon set.
- `index.html` má základní mobile viewport a title `OneMil`, ale nemá manifest link, `apple-touch-icon`, `theme-color` ani splash metadata.
- Aktivní offline/service-worker strategie nebyla nalezena; existuje pouze `public/OneSignalSDKWorker.js` pro OneSignal.
- Stripe Checkout flow pro web/PWA zůstává dostupný přes `create-stripe-checkout`.
- Nebyl změněn app kód, nebyl proveden deploy, migrace ani zásah do produkčních dat.
- Nebyly měněny Supabase, Stripe, OneSignal, Sofinity, wallet, tickets, contests, winners, bonus_prizes, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-11 — Added Paperclip setup context file PAPERCLIP_SETUP_CONTEXT.md

### Co bylo provedeno
- Přidán `PAPERCLIP_SETUP_CONTEXT.md` do rootu repozitáře.
- Soubor definuje základ pro nastavení Paperclipu jako AI management vrstvy pro OneMil.
- Popsán návrh prvního AI koordinátora `OneMil Chief of Staff`.
- Potvrzeno, že Pavel Diviš zůstává owner a final decision maker.
- Popsán approval model: Chief of Staff může navrhovat nové agenty, ale jejich spuštění musí schválit Pavel Diviš.
- Popsán první fokus: obchodní oddělení a strukturovaná databáze firem / leadů.
- Doplněny odkazy do `CLAUDE.md`, `.cursorrules` a `onemil_state.md`.
- Žádný app kód, Supabase, migrace, workflow ani produkční systémy nebyly změněny.

---

## 2026-05-11 — Added permanent business/product context file ONEMIL_BUSINESS_CONTEXT.md

### Co bylo provedeno
- Přidán `ONEMIL_BUSINESS_CONTEXT.md` do rootu repozitáře.
- Soubor definuje, že OneMil je B2B odměnová, partnerská a marketingová platforma, ne jen soutěžní aplikace.
- Popsán partner model: firmy samy nastavují MioCoin odměny a platí pouze za aktivované / použité MioCoiny.
- Popsány kupony, vouchery, Partner Offers, soutěže, uživatelé, osobní kódy, influenceři, agentury, sociální soutěže a podpora partnerů.
- `CLAUDE.md`, `onemil_state.md` a `.cursorrules` byly doplněny o odkazy na tento nový zdroj pravdy.
- Žádný app kód, Supabase, migrace, workflow ani produkční systémy nebyly změněny.

---

## 2026-05-11 — Added permanent company context file COMPANY_CONTEXT.md

### Co bylo provedeno
- Vytvořen `COMPANY_CONTEXT.md` v rootu repozitáře — trvalý zdroj pravdy pro firemní identitu, kontakty, podpis a fakturační údaje
- Obsah: iCONIC POINT s.r.o., IČO 17795851, DIČ CZ17795851, sídlo Praha 2, zakladatel Pavel Diviš, kontakty OneMil, veřejný e-mailový podpis
- Do `CLAUDE.md` přidáno pravidlo pro čtení `COMPANY_CONTEXT.md`
- Do `onemil_state.md` přidán odkaz na `COMPANY_CONTEXT.md`
- Bankovní údaje nejsou v repozitáři — uloženy ve fakturačním systému
- Žádný app kód, workflow, Supabase data ani produkce nebyly změněny

---

## 2026-05-10 — Staging registration: signup email domain opravena (commit `631f915`)

### Co bylo provedeno
- Diagnosed: scheduled staging E2E selhal pouze na `01-registration` — Supabase vrátil HTTP 400 `Email address "e2e+...@example.com" is invalid`
- Root cause: `@example.com` je IANA-rezervovaná doména; Supabase Auth ji odmítá s HTTP 400 (ne 422/429 → existující skip podmínka to nezachytila)
- Fix: `tests/e2e/01-registration.spec.ts` — doména změněna z `@example.com` na `@onemil.cz` (line 73)
- HTTP 400 **není přeskakován** — real staging signup zůstává testován; pokud Supabase odmítne `@onemil.cz`, test selže viditelně
- Ověřovací run `25627706906`: ✅ **ALL PASSED** — 2m 45s, 0 selhání; wallet reset ✅, seed-win-contest ✅, všech 9 spec souborů ✅, Telegram OK ✅
- Produkce `xkzhjldrojjlrkezorey` nedotčena; žádný app kód, workflow ani Supabase data nebyly změněny

---

## 2026-05-10 — Staging full E2E: naplánováno 3× denně (commit `37cfd6c`)

### Co bylo provedeno
- Přidán `schedule` trigger do `.github/workflows/playwright-staging.yml`
- Staging full E2E nyní běží automaticky 3× denně:
  - `0 2 * * *` → 04:00 Praha (CEST)
  - `0 10 * * *` → 12:00 Praha (CEST)
  - `0 18 * * *` → 20:00 Praha (CEST)
- Offset 4 hodiny od production smoke (00:00 / 08:00 / 16:00 Praha) — žádný překryv
- `workflow_dispatch` zůstává dostupný pro manuální spuštění
- Produkce `xkzhjldrojjlrkezorey` nedotčena; žádný app kód ani Supabase data nebyly změněny

---

## 2026-05-10 — Staging full E2E: wallet reset ověřen (run `25625184545`)

### Co bylo provedeno
- Commit `50ba68c` — `ci: reset staging e2e wallet before full run`: přidán krok `Reset test user wallet` do `playwright-staging.yml` (PostgREST PATCH `balance_coins: 5000, bonus_balance_coins: 0` před každým spuštěním testů)
- Spuštěn `workflow_dispatch` na `.github/workflows/playwright-staging.yml` pro ověření nového kroku
- Výsledek: **ALL PASSED** — 2m 33s, 0 selhání
- Kroky v pořadí: Seed win contest ✅ → Reset test user wallet ✅ → Run full E2E suite ✅ → E2E status OK ✅ → Telegram OK ✅
- Staging full E2E je nyní **bezpečný k plánování každých 8 hodin** — wallet se resetuje na 5 000 MioCoin před každým spuštěním, pipeline nevyčerpá zůstatek
- Produkce `xkzhjldrojjlrkezorey` nedotčena; žádný app kód ani Supabase data nebyly změněny

---

## 2026-05-10 — Staging full E2E: pipeline stabilizována a zelená (run `25624552621`)

### Co bylo provedeno
- Opraveny 4 postupné chyby v CI; výsledek: **všech 9 spec souborů prošlo**, 2m 36s, 0 selhání
- Commit `3c4aecf` — `ci: keep auto win contest out of games first position`: auto-seedovaný win contest dostane `created_at: "2020-01-01T00:00:00Z"` → řadí se na konec `/games` (DESC order) → test 03 ho nespotřebuje před testem 05
- Commit `324a747` — `test: stabilize destructive win flow e2e`: toast locator zúžen na `[data-sonner-toast]` (vyhýbá se ModalDialog konfliktu); přidán `test.describe.configure({ retries: 0 })` (retry by vždy selhal — soutěž je po prvním nákupu closed)
- Commit `6ee26df` — `test: scope result dialog locator to avoid cookie banner conflict`: `page.locator('[role="dialog"]')` nahrazen `page.getByRole('dialog', { name: /Výhra/i })` — vyhýbá se `CookieConsentBanner` (také `role="dialog"`)
- Commit `e70fd5c` — `test: robust wait for offer cards or empty state in partner offer open spec`: `waitForTimeout(2000)` nahrazen `Promise.race` na `firstCard.waitFor` vs `emptyState.waitFor` (10s timeout každý) + dvojitý guard skip — robustní bez ohledu na rychlost načítání
- Staging workflow auto-seeduje nový win contest před každým spuštěním (`STAGING_SUPABASE_SERVICE_ROLE_KEY` → PostgREST INSERT → contest ID předán jako step output do `E2E_WIN_CONTEST_ID`)
- Telegram success notifikace doručena: `✅ OneMil STAGING full E2E OK — all specs passed`
- Produkce `xkzhjldrojjlrkezorey` nedotčena; žádný app kód ani Supabase data nebyly změněny
- Monitor po dokončení stagnoval kvůli prázdnému `jq .status` výstupu — harmless, ignorován

### Výsledek
- Run `25624552621`: ✅ **ALL PASSED** — 13 passed, 4 skipped (expected), 0 failed, 2m 36s
- Staging full E2E je stabilní a zelený

---

## 2026-05-10 — Staging: upload-ticket-share nasazena, ticket-shares bucket ověřen

### Co bylo provedeno
- Ověřeno: storage bucket `ticket-shares` existuje na staging `dxmowysntemfqfnanxua`, `public: true`, `file_size_limit: 5242880`
- Nasazena Edge Function `upload-ticket-share` na staging: `npx supabase functions deploy upload-ticket-share --project-ref dxmowysntemfqfnanxua`
- Status: **ACTIVE**
- Staging nyní má 2 nasazené funkce: `sofinity-noop` + `upload-ticket-share`
- Produkce `xkzhjldrojjlrkezorey` nedotčena; žádné jiné funkce nebyly nasazeny

---

## 2026-05-10 — Staging seed: ověřen a zdokumentován

### Co bylo provedeno
- Staging `dxmowysntemfqfnanxua` oseedován pro E2E testy 03–08
- Test user: `e2e@onemil.cz` (ID `7822a82e-f1d3-45ee-827b-679640ce6b65`), wallet balance 5000.00 MioCoin
- General contest (`STAGING_E2E_CONTEST_ID`): `3fa56db0-4007-4fb7-aa2f-e460173070d8`, active, next_ticket 1
- Win contest (`STAGING_E2E_WIN_CONTEST_ID`): `7ff58a8e-c691-46e1-9e0c-ca6cddeb8abb`, active, next_ticket 100
- Partner offer `28278c87-17b6-49c3-ae7e-004d0d1f18b0`, approved, selected_contests, připojena ke general contestu
- Žádný app kód ani workflow nebyly změněny; produkce nedotčena

---

## 2026-05-10 — Production smoke: manuální ověření (run `25618763318`)

### Co bylo provedeno
- Spuštěn `workflow_dispatch` na `.github/workflows/playwright.yml`
- Výsledek: **6 passed** za 1m 22s — `01-registration` (3 testy) + `02-login` (3 testy)
- Specs 03–08 neběžely — potvrzeno z logu; žádný ticket purchase, voucher, wallet, win-flow ani Partner Offers test neproběhl v produkci
- Telegram doručen: `✅ OneMil PROD smoke OK — registration + login passed`
- Neblokující varování: orphaned worktree `.claude/worktrees/ecstatic-lichterman-1aa60a` způsobil `git exit 128` v post-job cleanup; pipeline neovlivněna

---

## 2026-05-10 — CI workflow split: produkce vs staging (commit `82f979f`)

### Co bylo provedeno
- `.github/workflows/playwright.yml` upraven: test command omezen na `tests/e2e/01-registration.spec.ts` a `tests/e2e/02-login.spec.ts`; Telegram zprávy přejmenovány na `PROD smoke OK/FAILED`
- `.github/workflows/playwright-staging.yml` vytvořen: `workflow_dispatch` only, plný suite (`npm run test:smoke`), staging secrets mapovány do standardních env var názvů, Telegram zprávy `STAGING full E2E OK/FAILED`
- Produkce nemůže fyzicky spustit testy 03–08 — hard-coded file paths
- Žádný app kód, spec soubory, ani Supabase data nebyla změněna

---

## 2026-05-10 — Staging migrace: strategie rozhodnuta (Option A)

### Rozhodnutí
- `db push` se na staging nepoužívá — blokováno duplicitními/smíšenými timestamp prefixy v repozitáři (17 souborů trvale pending, exit code 0 nelze dosáhnout bez přejmenování)
- Nové DB změny se aplikují na staging **manuálně přes Supabase SQL Editor** — stejný workflow jako produkce
- Aktuální staging schema baseline (`dxmowysntemfqfnanxua`, 73 tabulek, 95 RLS, `buy_ticket_atomic`, wallet trigger) je přijat jako správný a finální výchozí bod
- `schema_migrations` zůstává na 324 řádcích — není potřeba měnit
- Staging CI (testy 03–08) může pokračovat bez závislosti na `db push --dry-run`

---

## 2026-05-10 — Staging schema_migrations: formát experimentů a finální stav

### Co se stalo
Po manuální aplikaci produkčního schéma na staging proběhlo několik pokusů o nastavení `supabase_migrations.schema_migrations` tak, aby `db push --dry-run` hlásil 0 pending migrací.

### Výsledky experimentů
Supabase CLI extrahuje z lokálních `.sql` souborů vedoucí číselný prefix (ne celý stem). Experimenty v pořadí:
1. **341 plných stemů** (bez `.sql`) → všech 341 "Remote not found" (CLI nezná plné stemy)
2. **327 deduplikovaných číselných prefixů** → 3 krátké 8-ciferné prefixy "Remote not found"
3. **324 prefixů** (bez 3 konfliktních krátkých) → 17 souborů "pending before last remote"
4. **324 + 17 plných stemů sekundárních souborů** → 22 chyb (plné stemy + 5 dříve fungujících se rozbilo)
5. **Zpět na 324** → nejlepší dosažitelný stav, exit code stále 1

### Root cause neřešitelnosti
Repozitář obsahuje 4 páry souborů se stejným 14-ciferným timestampem a 3 skupiny se smíšenými 8/14-cifernými názvy. CLI může spárovat vždy jen jeden DB záznam na jeden prefix — sekundární soubory zůstávají jako "pending before last remote". Celkem 17 souborů nelze pokrýt bez přejmenování.

### Výsledek ověření schématu na staging `dxmowysntemfqfnanxua`
- 73 public tabulek ✅, `public.payments` existuje ✅, `buy_ticket_atomic` existuje ✅, `fn_wallet_transactions_immutable()` trigger existuje ✅, 95 RLS policies ✅
- Produkce `xkzhjldrojjlrkezorey` nedotčena ✅

### Aktuální stav
`schema_migrations`: 324 řádků (číselné prefixy). `db push --dry-run` exit code 1 — 17 souborů pending. Žádný `db push` bez nového plánu.

---

## 2026-05-10 — Staging DB: partial migration failure + cleanup

### Co se stalo
- Spuštěn `npx supabase db push` na staging `dxmowysntemfqfnanxua`
- Migrace #1 a #2 proběhly (`20250914034944_`, `20250914035127_`) — obě jsou `CREATE OR REPLACE FUNCTION`, žádné tabulky
- Migrace #3 (`20250914043049_`) selhala: `ERROR: relation "public.payments" does not exist (SQLSTATE 42P01)`

### Root cause
První ~5 migračních souborů (blank-name, 14. 09. 2025) jsou hotfixy aplikované na existující schéma, ne DDL skripty pro prázdnou DB. Počáteční schéma (tabulky `payments`, `wallets`, `users`, `contests`, `tickets` atd.) bylo vytvořeno přímo v Supabase dashboardu a nikdy nebylo zachyceno jako migrační soubor. Staging má prázdnou DB — tyto tabulky neexistují.

### Cleanup (provedeno uživatelem manuálně)
- Odstraněny 2 záznamy z `supabase_migrations.schema_migrations` na staging:
  - `20250914034944`
  - `20250914035127`
- Ověření: `remaining_migrations = null` (žádné záznamy v migration history)
- Na staging neexistují žádné `public.*` tabulky
- Produkce `xkzhjldrojjlrkezorey` nedotčena

### Dohodnutý recovery plán
Recovery plán zdokumentován v `onemil_state.md` — Fáze 3 sekce. Čeká na souhlas pro každý krok. `db push` se nespouští znovu, dokud není proveden baseline schema dump z produkce.

---

## 2026-05-09, 22:45 — Staging Sofinity izolace dokončena

### Co bylo provedeno
- Staging projekt `onemil-staging` vytvořen (ref `dxmowysntemfqfnanxua`, region `eu-north-1`)
- Secret `SOFINITY_RELAY_URL` nastaven manuálně v Supabase Dashboard na staging projekt
- Edge Function `supabase/functions/sofinity-noop/index.ts` vytvořena — přijímá POST, vrací `{"ok":true,"noop":true}`, nic nezapisuje
- Nasazena výhradně na staging: `npx supabase functions deploy sofinity-noop --project-ref dxmowysntemfqfnanxua --no-verify-jwt`
- POST test: HTTP 200 `{"ok":true,"noop":true}` ✅
- Commit `4167527` — `feat: add staging Sofinity no-op relay`

### Izolační záruky
- Produkční projekt `xkzhjldrojjlrkezorey` — nedotčen
- Produkční Sofinity relay `rrmvxsldrjgbdxluklka` — nedotčen
- Žádné migrace nebyly spuštěny

---

## 2026-05-09 — Staging projekt: potvrzená rozhodnutí

- Produkce: projekt `onemil`, ref `xkzhjldrojjlrkezorey`, region `eu-north-1`
- Staging: název `onemil-staging`, region `eu-north-1` (stejný jako produkce)
- `SOFINITY_RELAY_URL` musí být první secret po vytvoření — vlastní no-op endpoint, nikdy produkční Sofinity relay

---

## 2026-05-09, 22:17 — Staging-safe URL fix dokončen a pushnut

### Co bylo provedeno
Tři hardcoded produkční URL nahrazeny env/client-based hodnotami. Commit `20c6452`, pushnut na `main`.

| Soubor | Změna |
|---|---|
| `supabase/functions/process_event_queue_worker/index.ts` | `Deno.env.get("SOFINITY_RELAY_URL") ?? "<prod URL>"` |
| `src/pages/ShareTicket.tsx` | `${supabaseUrl}/functions/v1/og-ticket-share` |
| `src/components/TicketResultModal.tsx` | `${supabaseUrl}/functions/v1/og-ticket-share` |

- Build: ✅ `vite build` passed, 0 errors
- `.claude/settings.local.json` nebyl commitnut ani pushnut
- `api/og-ticket.ts` a `vercel.json` označeny jako legacy — Lovable je aktivní deploy cesta, Vercel soubory se v produkci nespouštějí

### Výsledek
Fáze 1 staging readiness je dokončena. Staging projekt lze nyní vytvořit — stačí nastavit env vars bez dalších code changes.

---

## 2026-05-09, 21:47 — E2E produkční bezpečnost: audit a staging plán

### Cíl
Navrhnout bezpečný způsob E2E testování, který neznečistí produkční data.

### Klíčové závěry auditu

**Contest 93dc5cdc-8bd2-4906-92b4-948d5eba1e60:**
- Draft contest — správně neviditelný pro uživatele (RLS SELECT: `status IN (active, pending, paused)`)
- `rules_pdf_url = NULL` — bug detekován, frontend fix nasazen, admin musí re-uploadovat PDF
- `bonus_prizes.status = 'won'` na draft contest — NENÍ bug: contest byl legitimně aktivován (10 tiketů prodáno), `buy_ticket_atomic` správně nastavil status; poté admin omylem přesunul `closed → draft` před zavedením `closed`-je-finální guardu
- `admin_actions` tabulka potvrdila timeline: `active → closed → draft` (přechod closed→draft byl umožněn, teprve pak byl guard nasazen)

**wallet_transactions immutability:**
- Trigger `fn_wallet_transactions_immutable()` RAISES EXCEPTION na UPDATE nebo DELETE — permanentní finanční ledger
- Definitně vylučuje „cleanup + reset" přístup pro E2E testy v produkci

**Porovnání tří možností E2E izolace:**
1. ✅ Separátní staging projekt — doporučeno
2. ⚠️ `is_e2e` flag — neúplné (wallet ledger + Sofinity stále zasaženy)
3. ❌ Cleanup v produkci — nemožné (wallet_transactions immutability)

**Staging readiness:**
- Frontend Supabase klient: env-var-based ✅ (nulové code changes potřeba pro přepnutí projektu)
- Hardcoded URLs blokující izolaci: 3 soubory:
  - `process_event_queue_worker/index.ts:19` — Sofinity relay (nejvyšší riziko)
  - `src/pages/ShareTicket.tsx:22` — OG image URL
  - `src/components/TicketResultModal.tsx:416` — OG image URL
- Staging plan zdokumentován v `onemil_state.md` — neprovádět bez souhlasu uživatele

### Postup
Audit proběhl read-only. Žádné produkční změny nebyly provedeny.

---

## 2026-05-05 — Closed contest status made final

### Bug
Admin mohl v UI změnit status `closed` soutěže zpět na `draft`, `pending`, `active` nebo `paused`.

### Fix
- `src/components/AdminContestManagement.tsx` — commit `54466bb`
- `handleStatusChange`: přidán guard na začátek funkce — pokud `current.status === "closed"`, zobrazí toast _„Ukončenou soutěž nelze znovu aktivovat ani přesunout."_ a okamžitě vrátí
- Status Select v řádku tabulky: `disabled` rozšířen o `|| contest.status === "closed"`
- Odstraněna duplicitní deklarace `const current` v `draft` větvi (sdílí nyní proměnnou z vrcholu funkce)

### Ověřeno manuálně
V tabu „Archiv ukončených soutěží" nelze otevřít status dropdown uzavřené soutěže. Soutěž zůstává uzavřena.

---

## 2026-05-05 — Contest rules PDF fix (rules_pdf_url NULL bug)

### Bug
Admin nahrál PDF s pravidly, ale `contests.rules_pdf_url` zůstal `NULL`. ContestDetail proto nezobrazoval odkaz na pravidla.

### Root cause
Přímý `UPDATE contests SET rules_pdf_url = ...` z frontendu byl blokován chybějící RLS UPDATE policy na `public.contests`. Supabase vracel `{ data: [], error: null }` (0 rows affected, silent no-op). Navíc chyběl `return` po UPDATE error → frontend zobrazil false success toast i při selhání.

### Opravy
- **DB:** přidána RLS policy `contests_admin_update` — admin/superadmin mohou UPDATE `public.contests` (migrace commitnuty a aplikovány; commity `bfc7813`, `95ab8e3`)
- **`src/components/AdminContestManagement.tsx`:** přidán `return` po UPDATE error (commit `20e4a34`); UPDATE změněn na `.select("id")` pro detekci 0-row no-op (commit `934bfbd`)
- **`src/pages/ContestDetail.tsx`:** odkaz přejmenován na „Zobrazit pravidla soutěže", otevírá PDF v novém tabu

### Playwright testy 03-voucher-purchase.spec.ts (opraveny souběžně)
- `waitForTimeout(3_000)` → `expect(buyButton.or(emptyState)).toBeVisible({ timeout: 15_000 })` (commity `0d7acbd`, `f0094e7`)
- `getByText(regex)` → `getByRole('heading', { name: '...' })` — eliminace strict mode violation (commit `1035273`)

### CI výsledek
14 passed / 3 skipped / 0 failed ✅

---

## 2026-05-04/05 — Ticket result modal + buy_ticket_atomic oprava

### buy_ticket_atomic — timeout (57014)
- **Root cause:** `trigger_sofinity_forward()` a `process_event_queue_trigger()` volaly `net.http_post()` synchronně uvnitř transakce; saturace pg_net workerů → 57014 statement timeout
- **Fix:** migrace `20260504_fix_nonblocking_sofinity_triggers.sql` — `trigger_sofinity_forward()` přepsán na INSERT do `event_queue`; `process_event_queue_trigger()` je no-op

### buy_ticket_atomic — chybějící fieldy v response
- Funkce nevracela `remaining_tickets`, `next_bonus_position`, `distance_to_next_bonus`
- Migrace `20260504_add_remaining_and_bonus_distance_to_buy_ticket_atomic.sql` přidala:
  - `remaining_tickets = v_ticket_count - v_next_ticket`
  - `v_next_bonus_position` — SELECT nejbližšího pending bonus_prizes.ticket_position > v_next_ticket po aktualizaci aktuálního bonusu na 'won'
  - `distance_to_next_bonus = v_next_bonus_position - v_next_ticket`
- Aplikováno v produkci, ověřeno STRING_AGG query

### Frontend — null → 0 přepis (root cause fallback textu)
- `remaining_tickets: result.remaining_tickets ?? 0` → `?? undefined` v `ContestDetail.tsx`, `Games.tsx`, `FavoriteGames.tsx`
- `?? 0` převáděl null na 0 → `0 > 0 = false` → `nearestPrizeDistance` vždy null → vždy fallback text

### TicketResultModal — text vzdálenosti
- Přidán helper `formatDrawsText(n)` + konstanta `DRAWS_EXPLANATION`
- Nahrazen text „Nejbližší výhra může být už za X tahů." na všech 4 místech (canvas, getShareText, bonus win pill, loss box)
- Nový formát: „Další výherní ticket čeká už za X tahy/tahů." / „...při dalším tahu." (X=1)
- Přidán vysvětlující řádek pod text vzdálenosti
- Správná česká pluralizace: 2–4 = tahy, 5+ = tahů

### Další opravy (uživatel — paralelní větev)
- Odstraněno číslo tiketu z result boxu
- Odstraněno extra „0" z modalu (React `{0 && <JSX>}` bug způsobený `?? 0`)
- Odstraněn toast „Ticket #N zakoupen!" po nákupu — commit `5bae556`
- Skryt název soutěže a celkový počet tiketů na listing kartách — commit `f2c1678`
- Česká pluralizace opravena (`tahPlural`, `nextWinTicketText`, `NEXT_WIN_EXPLAINER`) — commit `6269732`
- Sdílovací karta přepsána na `generatePremiumShareCard` (1200×630, reálné prize obrázky) — commit `0790362`
- Favorites počítadlo opraveno (aktualizace bez refresh) — commity `ebf5e8e`, `00e1e99`
- Partner Offers assignment ověřen funkční bez změny kódu

---

## 2026-05-01 — CI oprava: Payment Pipeline selhání diagnostikováno a opraveno

### Problém
4 CI runs selhaly (`25211401801`, `25213567010`, `25214606796`, `25215350051`) s hláškou "PAYMENT PIPELINE FAILED". Všechny spustilo pushování na `main` (start.bat / end.bat scripty). Telegram bot reportoval každý fail.

### Diagnostika
- Logy staženy přes GitHub Actions API (GitHub token z Windows Credential Manager)
- Jediný selhávající test: `01-registration.spec.ts:72` — "new user registers and is authenticated"
- Přesná chyba: `Expected Supabase session in localStorage (onemil-auth) but none found`
- Příčina: Supabase má zapnuté potvrzení emailu → `signUp()` vrátí `session: null` → žádný token do localStorage → `Profile.tsx` přesměruje na `/login` → `expectSessionExists()` selže
- Test selhal i po retryi (CI config: `retries: 1`)

### Oprava
- `tests/e2e/01-registration.spec.ts` upraven (commity `945a77d`, `0659a28`):
  - `expectSessionExists()` podmíněné — volá se jen pokud app neredirectuje na `/login` a email confirmation screen není viditelný
  - Přidán graceful skip pro Supabase 429 (rate limit) a 422 (domain block)

### Přidáno: scheduled testy
- `.github/workflows/playwright.yml` — přidán `schedule:` cron trigger (commit `156000f`)
- 3× denně: 00:00, 08:00, 16:00 Praha (CEST = UTC+2: 22:00, 06:00, 14:00 UTC)

### Přidáno: CLAUDE.md pravidlo
- `CLAUDE.md` — přidáno pravidlo: po každém zápisu do `onemil_state.md` nebo `onemil_history.md` automaticky spustit `git add -A && git commit -m "update state" && git push origin main` (commit `aa2c62d`)

---

## 2026-04-27 — Vizuální systém: brand aplikace a zmírnění zlaté (nedokončeno)

### Kontext
Proběhla analýza stavu větví a vizuálních změn. Bylo zjištěno, že brand změny z předchozí práce (Poppins, Energy Orange) nikdy nebyly mergovány do `main` — zůstaly izolované na větvi `claude/setup-playwright-tests-bShrg`.

### Co proběhlo
**Analýza větví:**
- Větev `claude/setup-playwright-tests-bShrg` obsahuje commity `d6d4597` + `25e87dd`: Poppins font, Energy Orange CSS proměnné, orange bordery/gradienty na ContestCard + ContestDetail.
- Tyto commity nikdy neprošly do `main`.

**Vizuální zmírnění na `claude/thirsty-volhard-e1eb7c` (commit `a21ef28`):**
- Zadání: nesnižovat layout/strukturu, pouze vizuálně zmírnit — méně intenzivní zlatá, dark overlay, soft rgba bordery, potlačení glow efektů.
- Změněné soubory: `src/index.css`, `src/components/ContestCard.css`, `src/components/ContestCard.tsx`, `src/components/MioCoin.tsx`
- Klíčová změna: `--neon-gold` přesunut z jasné zlaté (`43 90% 55%`) na tlumenou amber-oranžovou (`33 70% 44%`); glow opacity snížena ~50 %; bordery → `rgba(191,198,207,0.16)`; progress bar → `#C07018/#884A08`.
- Pushnuté na remote, nemergnuto do `main`.

### Stav na konci dne
- Grafika je **nedokončená**.
- Probíhá testování funkčnosti systému (platební pipeline, tiket purchase, contest flow) — grafika se dořeší až po ověření funkčnosti.
- Otevřená otázka: která větev se merguje do `main` (nebo cherry-pick obou sad změn).

---

## 2026-02-08 — Partner Offers v1: reminder automation
- Edge Function `supabase/functions/send-offer-reminders/index.ts` present (documented as "Block F — send-offer-reminders").
- Uses DB RPC `get_due_offer_reminder_rows()` and updates `user_partner_offers.last_reminder_at`.
- Documents safety invariant: never touches `winners` / `bonus_prizes`.

## 2026-03-15 — Deep backend stabilization audit (recorded)
- Scope recorded: schema, SQL functions, triggers, migrations, wallet system, contest engine, ticket generation, bonus prize logic, event pipeline, push pipeline, edge functions.
- Fixes recorded as applied via six migrations:
  - `20260315240000_fix_bonus_prize_response.sql`
  - `20260315260000_cleanup_duplicate_triggers.sql`
  - `20260315270000_remove_redundant_ticket_trigger.sql`
  - `20260315280000_cleanup_winners_indexes.sql`
  - `20260315290000_additional_safety_constraints.sql`
  - `20260315300000_fix_bonus_wallet_ledger.sql`

## 2026-03-22 — E2E contest flow "final fix" (recorded)
- Result recorded: E2E success (tickets, contest close, winners, wallet, notifications).

## 2026-03-23 — OneMil ↔ Sofinity stabilization (recorded)
- Result recorded: pipeline stable, backlog processed, cron automation in place.

## 2026-03-30 — AI chat CTA follow-up detection regression (recorded)
- Issue recorded: follow-up messages not recognized as support intent → CTA "Kontaktovat podporu" disappears.
- Root cause recorded: `isSupportIntentForCta` too strict.

## 2026-04-08 to 2026-04-09 — Cursor session work (recorded)
- Temporary private-access gate work (`src/App.tsx`).
- SEO static assets + sitemap/robots production availability work (via commits).
- Admin contests list robustness work recorded (ensure contest list loads even if bonus-stats RPC fails).

## 2026-04-09 — Memory reconciliation correction pass
- Goal: keep clean state/history split and keep Partner Offers v1 treated as confirmed project context.
- Partner Offers section in `onemil_state.md` updated to distinguish:
  - confirmed project truth
  - confirmed in current repo snapshot
  - needs repo re-check later (narrow existence checks only)
- Note: Partner Offers details are considered **partially reconciled** until final E2E and a final documentation pass are completed.

---

## 2026-04-10 — Partner Offers v1 – finální E2E uzavření, wiring fix, token rotace, kanonický memory režim

### Shrnutí
Partner Offers v1 bylo v tomto chatu finálně uzavřeno.
Po dokončení bloků A–G proběhlo vícekolové E2E ověřování, během kterého byly potvrzeny reálné integrační vazby a opravena jedna chybějící produkční mezera: automatické napojení assignment logiky do `purchase-ticket`.

Výsledný stav:
**Partner Offers v1 PASSED finálním E2E.**

---

### 1. Výchozí stav na začátku tohoto úseku
Na začátku bylo považováno za hotové:
- Block A
- Block B
- Block C
- Block D
- Block E
- Block F
- Block G

Ale ještě nebylo finálně end-to-end potvrzené, že:
- assignment přes ticket purchase běží opravdu automaticky
- `won_type` gate funguje i na HTTP úrovni
- reminder pipeline má správně sjednocený internal token

---

### 2. E2E verifikace – plán a postup
Nejdřív byl zvolen menší, tokenově úsporný postup:
1. plán E2E
2. DB + admin smoke check
3. seed + assignment slice
4. finální HTTP-level integrační test

Tím se zabránilo zbytečně velkým promptům a zbytečnému spalování tokenů.

---

### 3. DB + admin smoke check
Bylo potvrzeno:
- Block G DB objekty existují
- funkce jsou callable
- `partner_invoices.type` existuje
- `partner_offer_activations.invoiced` a `invoice_id` existují
- `get_admin_activation_summary()` funguje
- `sync_partner_offer_activations()` funguje
- TypeScript build je čistý
- admin UI compile smoke je OK

V této fázi byl nalezen jeden blocker:
- `send-offer-reminders` vracel 401

---

### 4. Block F – internal token blocker
Bylo potvrzeno, že:
- `INTERNAL_FUNCTION_TOKEN` neodpovídal mezi prostředími
- reminder function kvůli tomu vracela 401
- cron na reminder běh tím pádem selhával

#### Zjištěné body
Používaly se tři místa:
- Supabase secret `INTERNAL_FUNCTION_TOKEN`
- lokální `.env` `VITE_INTERNAL_FUNCTION_TOKEN`
- cron joby s hardcoded tokenem

#### Provedená oprava
Byl vygenerován nový silný token a proběhla rotace:
- přepsán token v pg_cron `send_offer_reminders_daily`
- přepsán token v pg_cron `process-event-queue`
- ručně sjednocen `.env`
- ručně sjednocen Supabase secret `INTERNAL_FUNCTION_TOKEN`

Poté proběhla hygienická kontrola:
- starý token už se nikde nevyskytoval

#### Ověření po opravě
Test:
- `send-offer-reminders`

Výsledek:
- HTTP 200
- `{"success":true,"emails_queued":0,"offers_touched":0}`

Závěr:
**Block F blocker odstraněn.**

---

### 5. Seed + assignment flow audit
Byl proveden řízený test assignment vrstvy.

Potvrzeno:
- `assign_partner_offer_to_ticket(...)` funguje správně při ručním volání
- `user_partner_offers` vzniká správně
- `status = active`
- `ticket_id` FK funguje správně při reálném ticket UUID
- cooldown vrací `NULL`
- `last_assigned_at` se aktualizuje
- `sync_partner_offer_activations()` vytváří activation rows

V této fázi se ale ukázalo:
- assignment RPC existuje
- ale **nevolá ho nic automaticky při ticket purchase**

To byl skutečný chybějící blok.

---

### 6. Kritický fix – chybějící wiring v purchase-ticket
Bylo rozhodnuto pro správné řešení:
- **Option B**
- napojit assignment do:
  - `supabase/functions/purchase-ticket/index.ts`

Výslovně bylo zakázáno:
- měnit `buy_ticket_atomic`
- přidávat DB trigger na `tickets`
- sahat na `winners`
- sahat na `bonus_prizes`

#### Implementace
Změněn pouze:
- `supabase/functions/purchase-ticket/index.ts`

Přidaná logika:
- po úspěšném `buy_ticket_atomic`
- pokud `data.success === true && data.won_type === null`
- zavolá se:
  - `assign_partner_offer_to_ticket(...)`
- předá se:
  - `ticket_row_id` jako `p_ticket_id`
- chyba je non-fatal
- response pro uživatele zůstává stejná

Tím byl dokončen chybějící wiring v Block D.

---

### 7. Finální HTTP-level integrační test
Po wiring fixu proběhl finální skutečný integrační test přes:
- reálné HTTP volání `purchase-ticket`
- reálné JWT

#### Positive path
Potvrzeno:
- při `won_type = null` vznikne nový `user_partner_offers`
- `ticket_id` v UPO odpovídá `ticket_row_id` z response
- response body zůstává beze změny

#### Negative path
Potvrzeno:
- při `won_type = 'bonus'` **nevznikne žádné UPO**
- gate funguje správně

#### Finální závěr testu
**Partner Offers v1 PASSED finálním E2E ověřením.**

---

### 8. Praktický výsledek po E2E
Bylo finálně potvrzeno:
- assignment flow funguje
- cooldown funguje
- `ticket_id` wiring funguje
- `last_assigned_at` se aktualizuje
- `won_type` gate blokuje assignment pro výherce
- user response zůstává nedotčená
- activation sync funguje
- reminder token problem byl vyřešen

Nebyl nalezen žádný nový produkční blocker.

---

### 9. Kanonické memory soubory – nové pracovní pravidlo
Během chatu byl zjištěn problém, že Cursor / Claude používaly různé memory soubory a staré workspaces.

Bylo sjednoceno nové pravidlo pro OneMil:

Kanonická složka:
`C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw`

Kanonické soubory:
- `onemil_state.md`
- `onemil_history.md`
- `CLAUDE.md`

Potvrzeno:
- workspace byl přepnut správně na `million-ticket-draw`
- další OneMil zápisy se mají dělat už jen sem
- staré `ProjectsBundle\onemil` se bere jen jako legacy reference, ne jako aktivní místo zápisu

---

### 10. Stav na konci
Partner Offers v1 je považováno za:
- implementované
- nasazené
- dopojené
- end-to-end otestované
- uzavřené jako hotový modul v rámci v1

Mimo v1 nadále zůstává:
- `category_contests`

---

### 11. Další krok
Další práce už nemá znovu otevírat architekturu Partner Offers v1.

Správný další krok:
1. jen případné bugfixy z běžného provozu
2. nebo další samostatný modul mimo Partner Offers

---

### Důležité varování pro další chat
Další asistent NESMÍ:
- znovu vracet Partner Offers do `winners`
- znovu vracet Partner Offers do `bonus_prizes`
- přidávat novou bottom položku
- znovu míchat billing do `partner_offers`
- znovu otevírat Blocks A–G bez důvodu
- ignorovat, že finální E2E už proběhlo úspěšně
- zapisovat OneMil stav mimo:
  - `C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw\onemil_state.md`
  - `C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw\onemil_history.md`

---

## 2026-04-10 — Block E frontend implementace a nasazení

### Co bylo provedeno
Po post-deploy auditu bylo zjištěno, že Block E (user UI pro Nabídky) existoval v paměti, ale soubory chyběly v repozitáři.

Byly vytvořeny a commitnuty tyto soubory:
- `src/components/OfferCard.tsx` — nový
- `src/components/OfferDetailModal.tsx` — nový
- `src/pages/Wins.tsx` — aktualizován (přidán tab switcher Výhry / Nabídky)

### Chování implementace
- Nabídky čtou z `user_partner_offers` kde `status = active` AND `hidden_at IS NULL`
- Otevření detailu zapisuje `opened_at` (non-fatal)
- Skrytí zapisuje `hidden_at` → DB trigger Block F automaticky odešle systémovou zprávu do `messages`
- Skrytá nabídka okamžitě zmizí ze seznamu
- Tab switcher Výhry / Nabídky je uvnitř `/wins` — bottom menu zůstalo `Výhry`
- Partner display name: `company_name ?? name`
- Zobrazuje `valid_to`

### Build výsledek
- `npm run build` → exit code 0
- Žádné nové TypeScript ani import chyby

### Commit
- `b7aa4ce` — `feat: Block E – add Nabídky tab to /wins with OfferCard and OfferDetailModal`
- Pushnut do `main`

---

## 2026-04-11 — Partner portal UI: offer management v PartnerDashboard

- `src/pages/PartnerDashboard.tsx` rozšířen o kompletní správu nabídek:
  - `PartnerOffer` interface, 14 nových state proměnných, 8 nových funkcí
  - `loadPartnerOffers(partnerId)` — SELECT z `partner_offers` filtrovaný na `partner_id`
  - `openCreateOffer` / `openEditOffer` — správa form stavu
  - `handleSaveOfferDraft` — INSERT (nová) nebo UPDATE (existující draft/rejected)
  - `handleSubmitOffer` — UPDATE status na `submitted`
  - `handleReviseOffer` — RPC `revise_partner_offer({p_offer_id})`
  - `getOfferStatusBadge` / `getDeploymentModeLabel` — UI helpers
  - Card sekce se seznamem nabídek (Table) + inline akce dle stavu
  - Dialog pro vytvoření / úpravu s fieldy: title, short_text, deployment_mode, valid_from, valid_to, link_or_code
  - Approved nabídky jsou read-only (žádné tlačítko editace)
- `loadPartnerOffers(partnerData.id)` voláno z `loadPartnerData()` automaticky
- Build: ✅ exit code 0

## 2026-04-10 — Odstranění dočasného private-access gate v App

- V `src/App.tsx` odstraněn email allowlist (`divispavel2@gmail.com`), `isLockExemptRoute` / `isLocked` a celá obrazovka „Web je momentálně neveřejný”; role redirecty v `useEffect` beze změny logiky kromě odstranění early return kvůli locku.
- Ověřeno lokálně: `npm run build` — Vite production build dokončen úspěšně (`✓ built`).

---

## 2026-04-12 — Partner billing visibility + invoice PDF/email – Admin + Partner portal

- `src/pages/PartnerDashboard.tsx` rozšířen o Block 5: read-only billing přehled pro partnera
  - `loadOfferBilling(partnerId)` načítá: počet aktivací, billing config, seznam offer faktur
  - `downloadOfferInvoicePdf(invoiceId)` volá `generate-partner-invoice-pdf` přes `withEdgeInternalToken`
  - Karta „Fakturace nabídek” zobrazuje: aktivace, billing mode, cena za aktivaci, tabulku faktur s PDF tlačítkem
  - Commit: `7272be5`
- `supabase/migrations/20260412_extend_partner_offer_invoices_numbering.sql` — Block 2: `create_partner_offer_invoices_for_period` rozšířena o `invoice_number`, `variable_symbol`, `issue_date`, `due_date`, `taxable_date` voláním `generate_invoice_number()`
- `supabase/functions/generate-partner-invoice-pdf/index.ts` — Block 3: přidána podpora `type='offer'` faktur; čte z `partner_offer_invoice_lines` a `partner_offer_activations`; oddělená větev od coin logiky; nasazeno jako verze 98
- `src/pages/AdminPartnersPortal.tsx` — Block 4: tlačítka „Vygenerovat PDF” a „Odeslat fakturu” pro oba typy faktur (coin i offer); `skipped` response z `send-partner-invoice-email` zpracována jako `toast.info`; commit `f1554dc`

---

## 2026-04-13 — Contest admin fixes: create, status model, archive UX, delete safety

### Contest create – ticket_count fix
- Zjištěno: `admin_manage_contest` dříve tiše přepisoval `ticket_count` na fallback `1000000`, pokud nebyl správně předán z frontendu
- Opraveno na frontendu v `AdminContestManagement` (žádný tichý fallback)
- Na straně DB/RPC: při **create** už `admin_manage_contest` **netiše** nepřijímá neplatný nebo chybějící `ticket_count` (vyžaduje se platná hodnota / chyba místo mlčení)
- Nasazení frontend opravy na Lovable vyžadovalo **Share → Publish** (ne jen git push)

### DB status constraint rozšíření
- `contests_status_check` byl rozšířen o chybějící hodnoty tak, aby odpovídal UI statusům: `draft`, `pending`, `active`, `paused`, `closed`
- Předtím constraint způsoboval selhání při CREATE soutěže s neočekávanými hodnotami

### Contest archive UX
- `src/components/AdminContestManagement.tsx` rozšířena o 3 filtrovací taby pod hlavičkou stránky:
  - Aktivní soutěže (`pending`, `active`, `paused`)
  - Archiv test (`draft`)
  - Archiv ukončených soutěží (`closed`)
- Archiv zůstává na stejné stránce, ne na nové stránce, ne ve row dropdownu
- Commit: `2d0cc84`

### Draft přejmenován na „Archiv test” v admin UI
- `STATUS_OPTIONS`: label `”Koncept”` → `”Archiv test”` pro value `”draft”`
- DB hodnota `draft` beze změny
- Commit: `f26caa9`

### Pravidlo přechodu do Archiv test
- `active` → `draft` zablokováno: frontend guard v `handleStatusChange` + disabled dropdown option
- Povoleno pouze z `pending` nebo `paused`
- Commit: `b4b55b0`

### Hard delete – audit a závěr
- Bylo potvrzeno: `partner_offer_contests.contest_id` má FK na `contests(id)`
- Soft detach (`detached_at = now()`) logicky odpojí nabídku, ale FK řádky fyzicky zůstávají
- Hard delete po soft detach stále selže s FK violation
- Závěr: **hard delete contestů není bezpečný; testovací soutěže se archivují do `draft`**
- Testovací soutěže se nemají řešit jako běžné produkční „cleanup" cíle — bezpečná cesta je statusová archivace, ne mazání
- Delete v admin UI povolen pouze pro `draft` a `pending` (testovací fáze); pro `active`, `paused`, `closed` zablokováno
- Invariant: **nemazat** řádky `partner_offer_contests` natvrdo; u úklidu soutěží se **nesahat** na triggery ani na `buy_ticket_atomic` / `assign_partner_offer_to_ticket`
- Commity: `ac52556`, `8026382`

### Dokumentační synchronizace (13. 04. 2026, 20:46:33 +02:00)
- Do kanonické trojice `onemil_state.md` + `onemil_history.md` + `CLAUDE.md` doplněny výše uvedené ověřené body (create path, DB create validace `ticket_count`, Lovable Publish, status constraint, 3 archivní filtry, pravidla `draft`, FK/delete závěry, Partner Offers invarianty). Žádná změna aplikačního kódu v rámci tohoto kroku.

---

## 2026-04-24 — CI, Payments & E2E Stabilization COMPLETE

### Stripe webhook – kompletní oprava failure handlingu
- Všechny `throw` výrazy uvnitř `checkout.session.completed` nahrazeny kontrolovanými `return 500` odpověďmi (Stripe retry)
- Structured log přidán ke všem 6 failure paths: `console.error('STRIPE WEBHOOK FAILURE', {session_id, reason, user_id, amount})`
- Idempotency log standardizován: `console.log('STRIPE WEBHOOK DUPLICATE', { session_id: session.id })`
- **Kritická oprava:** outer `catch` blok vracel 400 → opraveno na 500 (neočekávané runtime chyby jsou nyní retryovatelné)
- Signature check inner catch zůstává 400 (správně)
- Soubor: `supabase/functions/stripe-webhook/index.ts`

### GitHub Actions – Playwright CI pipeline
- Vytvořen workflow `.github/workflows/playwright.yml`:
  - Trigger: push na `claude/**`, PR do `main/master`, `workflow_dispatch`
  - Playwright Chromium smoke tests přes `npm run test:smoke`
  - HTML report artifact + screenshots artifact při selhání
- Přidány GitHub Step Summary notifikace: `PAYMENT PIPELINE OK` / `PAYMENT PIPELINE FAILED`
- Přidány Telegram notifikace (curl na `api.telegram.org`) na success i failure
- Přidán `workflow_dispatch` trigger pro ruční spuštění

### Playwright smoke testy – stabilizace
- `tests/e2e/01-registration.spec.ts`:
  - Přidán helper `fillDateInput()` — native value setter + event dispatch pro React controlled `<input type="date">`
  - Přidán helper `expectSessionExists()` — kontroluje `localStorage.getItem('onemil-auth')` (storageKey z Supabase clienta)
  - `waitForResponse('/auth/v1/signup')` — čeká na reálnou Supabase API odpověď před dalšími asserty
  - Nahrazen `waitForURL` za `expect(page).not.toHaveURL(/\/register/)` — opravena chyba kde condition byla splněna okamžitě
  - Vizuální check: `bottomNav.or(emailConfirmScreen)` (buď bottom nav nebo email confirmation notice)
  - Výsledek: **3/3 testů passing**
- `tests/e2e/02-login.spec.ts` + `tests/e2e/helpers/auth.ts`:
  - Opravena strict mode violation: `getByRole('button', { name: 'Přihlásit se' })` matchoval 4 tlačítka (Google/Apple/Facebook SSO)
  - Všechna 3 místa v login spec + helper nahrazena `locator('button[type="submit"]')`
  - Výsledek: **passing** (po aplikaci secrets v CI)

### Supabase secrets v GitHub CI
- Přidány GitHub repository secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Bez těchto secrets `createClient('', '')` crashoval React app při startu → všechny UI testy selhaly

### Wallet auto-creation – centralizovaná DB funkce
- Vytvořena migrace `supabase/migrations/20260420_ensure_wallet_exists.sql`
  - Funkce `public.ensure_wallet_exists(p_user_id uuid)` — INSERT ... ON CONFLICT (user_id) DO NOTHING
  - Columns: `user_id`, `balance_coins=0`, `bonus_balance_coins=0`, `created_at=now()`
- Call sites přidány:
  - `supabase/functions/purchase-ticket/index.ts` (Edge Function)
  - `src/pages/Vouchers.tsx`
  - `src/pages/Homepage.tsx`
  - `src/components/VoucherCarousel.tsx`
- **Migrace commitnuta, nutno aplikovat v Supabase SQL Editoru**

### Profiles trigger oprava
- Vytvořena migrace `supabase/migrations/20260420_fix_profiles_insert_remove_user_id.sql`
  - Opravuje `handle_new_auth_user()`: odstraněn neexistující sloupec `user_id` z INSERT do `public.profiles`
  - Backfill: doplní chybějící `profiles` řádky pro existující `auth.users` účty
- **Migrace commitnuta, nutno aplikovat v Supabase SQL Editoru**

### Stav CI na konci tohoto úseku
- Registration testy: **passing** (3/3)
- Login testy: **passing** (2/2 stabilní, 1 skip bez credentials)
- Voucher/ticket testy: **skip** (čekají na `E2E_TEST_EMAIL` + `E2E_TEST_PASSWORD`)
- Pipeline: **stable, production-ready**

---

## 2026-04-24 (session 2) — Integrity audity buy_ticket_atomic + won_type fix + Playwright testy 03–08

### Audity buy_ticket_atomic (READ-ONLY)

**1. Wallet deduction audit**
- Potvrzeno: wallet deduction probíhá **přesně jednou** — single `UPDATE wallets SET balance_coins = v_balance - v_ticket_price WHERE id = v_wallet_id`
- `FOR UPDATE` lock na wallet row serializuje souběžné nákupy (žádný double-deduct možný)
- Nedostatek mincí vrací `{success: false, error: 'Nedostatek miocoinu'}` a rollbackuje transakci

**2. Frontend response handling audit**
- Potvrzeno: všechna 3 místa volají `buy_ticket_atomic` **přímo** (ne přes Edge Function): `ContestDetail.tsx`, `Games.tsx`, `FavoriteGames.tsx`
- `ContestDetail.tsx:329` — `if (result.success === false || result.error)`
- `Games.tsx` + `FavoriteGames.tsx` — `if (!rpcResult.success)` po normalizaci
- HTTP 200 je vždy vrácen i pro business logic failures; success check je správně implementován

**3. Ticket creation audit**
- Potvrzeno: přesně **jeden** INSERT do `tickets` — žádný tichý fail, žádná duplicate
- `ticket_row_id` je generován jako `gen_random_uuid()` přímo v INSERT
- Žádný EXCEPTION blok kolem INSERT → selhání propaguje a rollbackuje celou transakci

**4. Purchase integrity audit**
- Contest limit: `FOR UPDATE` lock na `contests` row + guard `IF v_next_ticket > v_ticket_count THEN RETURN error` — overfill impossible
- Ticket number: `UPDATE contests SET sold_tickets = sold_tickets + 1 RETURNING sold_tickets` — atomický increment, duplicate impossible
- won_type logic: CASE v_next_ticket = v_ticket_count (main) / v_bonus_prize_id NOT NULL (bonus) / ELSE NULL

### won_type priority fix

- Bug nalezen: poslední tiket + bonusová pozice → `won_type` vracel `'bonus'` místo `'main'`
- Root cause: CASE vyhodnocoval `v_bonus_prize_id IS NOT NULL` před `v_next_ticket = v_ticket_count`
- Fix: `CASE WHEN v_next_ticket = v_ticket_count THEN 'main' WHEN v_bonus_prize_id IS NOT NULL THEN 'bonus' ELSE NULL END`
- Migrace: `supabase/migrations/20260424_fix_won_type_main_priority_over_bonus.sql` — commit `68e06fc`
- **Nutno aplikovat v Supabase SQL Editoru**

### Playwright testy — nové spec soubory

- `tests/e2e/03-ticket-purchase.spec.ts` (commit `c9e4607`):
  - Skip bez credentials; login → /games → první Detail → /contest/:id
  - Pokud buy button: klik → assert toast/dialog/alert; pokud top-up: assert enabled
- `tests/e2e/05-win-flow.spec.ts` (commit `ac2da53`):
  - Vyžaduje `E2E_WIN_CONTEST_ID` (soutěž se 1 zbývající tiketou)
  - `page.on('response')` zachytí `won_type` z RPC
  - Assert: Gratulujeme toast + dialog viditelný + won_type in ['main', 'bonus']
- `tests/e2e/06-partner-offers.spec.ts` (commit `be301de`):
  - Login → /games → koupě tikety → zachycení won_type + user_partner_offers response
  - Pokud won_type === null: assert "SPECIÁLNÍ NABÍDKA" nebo "Nabídka je uložena v tvých" v result modalu
  - Pokud won_type !== null: annotace skip-reason (prize win)
- `tests/e2e/07-partner-offer-open.spec.ts` (commit `be7fedb`):
  - Login → /wins → Nabídky tab → klik na první offer card
  - OfferCard selector: `div.group.cursor-pointer` (ne button — OfferCard je `<div onClick>`)
  - Assert: dialog viditelný + heading viditelný + pokud wasNew: PATCH user_partner_offers fired
- `tests/e2e/08-partner-offer-persistence.spec.ts` (commit `d37dd7a`):
  - Login → /wins → Nabídky → otevřít nabídku → waitForResponse PATCH (s catch pro already-opened)
  - Escape → reload → přepnout zpět na Nabídky tab
  - Assert: nabídka stále viditelná + "Nová" badge NOT visible

### Nový env var
- `E2E_WIN_CONTEST_ID` — přidat jako GitHub Secret; musí ukazovat na seeded contest s 1 zbývající tiketou

---

## 2026-05-13 - PR #3 PWA metadata a schválené trophy ikony

- Sloučen PR #3 `Add PWA manifest and approved icons` do `main`.
- Merge commit: `365d7545894a2d4d9d89c349c55a563dee3d62a8`.
- Přidán `public/manifest.webmanifest`.
- Do `index.html` přidán manifest link, `theme-color` a `apple-touch-icon`.
- Do `public/` byly zapojeny pouze schválené trophy ikony z brand kitu:
  - `public/apple-touch-icon.png`
  - `public/android-chrome-192x192.png`
  - `public/android-chrome-512x512.png`
- Nepřidán service worker ani offline caching.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.
- Ověření před merge:
  - Smoke E2E prošel na PR #3.
  - Playwright Staging Full E2E prošel na větvi `codex/pwa-icon-metadata`: run `25806842615`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25807224457`.
  - Playwright Staging Full E2E prošel: run `25807653323`.

---

## 2026-05-13 - PR #4 iPhone/PWA spodní navigace

- Sloučen PR #4 `Fix iOS PWA bottom navigation` do `main`.
- Merge commit: `0013ab74864ed4c206e79721d67a7346ce54e48d`.
- Spodní navigace v mobilním/PWA zobrazení zůstává fixovaná dole při scrollování.
- Přidána podpora iPhone safe area přes `viewport-fit=cover` a `env(safe-area-inset-bottom)`.
- Přidáno mobilní spodní odsazení obsahu, aby obsah nebyl schovaný za navigací.
- Nebyly změněny routy, ikony, české labely ani business logika.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.
- Ověření před merge:
  - Smoke E2E prošel na PR #4: run `25810873277`.
  - Playwright Staging Full E2E prošel na větvi `fix/ios-pwa-bottom-navigation`: run `25811043511`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25811447264`.
  - Playwright Staging Full E2E prošel: run `25811641231`.

---

## 2026-05-13 - PR #5 launch wording cleanup

- Sloučen PR #5 `Clean launch wording risks` do `main`.
- Merge commit: `acc43c90d313cbe2bd01adf333d74d3f424905fa`.
- Z public/admin/Bob-visible textů byla odstraněna riziková wording stopa kolem `losy`, `losování`, `jackpot` a `Megajackpot`.
- Texty jsou sjednocené na bezpečnější launch formulace: tikety, otevření tiketů, soutěžní mechanismus, předem určené výherní pozice, hlavní výhra.
- Nebyla změněna business logika.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.
- Ověření před merge:
  - Smoke E2E prošel na PR #5.
  - Playwright Staging Full E2E prošel na větvi `fix/launch-copy-risk-wording-cleanup`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25816716804`.
  - Playwright Staging Full E2E prošel: run `25816763438`.

---

## 2026-05-13 - Produkční DB launch verification read-only

- Produkční DB verification proběhla pouze read-only přes `SELECT`.
- `handle_new_auth_user` původní FAIL byl false positive.
- `public.profiles` insert používá `id`, `full_name`, `date_of_birth`, `avatar_url` a nevkládá `user_id` do `profiles`.
- `trigger_sofinity_forward` nevolá `net.http_post` přímo.
- Produkce aktuálně používá legacy Sofinity forwarding path:
  `event_logs / trigger_sofinity_forward -> event_forward_log -> call_event_forward_log_listener -> event_queue -> process_event_queue_worker -> Sofinity`.
- Tato legacy mezivrstva není Web/PWA launch blocker.
- Technický dluh po launchi: zvážit zjednodušení legacy cesty `event_forward_log -> event_queue`, ale pouze po samostatném schválení.
- Nebyla změněna data ani schema.
- Nebyly spuštěny migrace.
- Nebyl proveden deploy.
- Nebyly měněny Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, Sofinity, OneSignal ani `buy_ticket_atomic`.

---

## 2026-05-13 - Produkční contest cleanup před Web/PWA launchem

- Produkční launch blocker `active contests missing rules_pdf_url` byl vyřešen.
- 7 testovacích soutěží bylo přesunuto ze stavu `active` do `draft` / Archiv test.
- 3 reálné soutěže bez PDF pravidel byly dočasně přesunuty ze stavu `active` do `draft` / Archiv test:
  - BMW S 1000 RR
  - Corvette
  - MY26 CORVETTE C8 Stingray 6.2L V8 - Coupe
- Finální ověření: PASS — žádné aktivní soutěže nemají chybějící `rules_pdf_url`.
- Žádná soutěž nebyla smazána.
- Nebyly spuštěny migrace.
- Nebyl proveden deploy.
- Nebyl měněn app kód.
- Nebyly měněny Stripe, wallet, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-13 - Stripe Test Mode verification

- Stripe je aktuálně správně v Test mode.
- Testovací top-up pro `e2e@onemil.cz` byl vizuálně dokončen v OneMil a zobrazen ve Stripe.
- Supabase ověření potvrdilo:
  - wallet pro `e2e@onemil.cz` existuje,
  - `balance_coins = 100507.00`,
  - `bonus_balance_coins = 11.00`,
  - latest payment `status = completed`,
  - latest payment `method = stripe`,
  - `stripe_session_id` začíná `cs_test_`,
  - latest payment amount v DB je `1280.00`.
- Amount `1280.00` je potřeba porovnat s vybraným UI balíčkem/bonusem před veřejným spuštěním.
- Nebyla provedena žádná live platba.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyl měněn app kód.
- Nebyly měněny Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-14 - PR #6 admin revenue reporting fix

- Sloučen PR #6 `Separate admin revenue from credited MioCoins` do `main`.
- Merge commit: `c32325eef3a4511d8283dca74c27d050b8e5d287`.
- Admin reporting už nezobrazuje `payments.amount` jako Kč tržbu.
- `payments.amount` zůstává evidováno jako připsané MioCoiny.
- `Tržba Kč` je ve frontendu odvozena ze známé mapy MioCoin balíčků:
  - 50 MC -> 50 Kč
  - 310 MC -> 300 Kč
  - 525 MC -> 500 Kč
  - 1280 MC -> 1200 Kč
- Připsané MioCoiny jsou v adminu zobrazeny samostatně.
- Neznámé částky mimo známé balíčky se v Kč tržbě zobrazují jako `neznámé`.
- Nebyla změněna business logika.
- Nebyla měněna databázová funkce `get_admin_summary_dashboard`.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase data, Stripe, webhook, wallet, contests, tickets, winners, Partner Offers, Sofinity, OneSignal ani `buy_ticket_atomic`.
- Ověření před merge:
  - Smoke E2E prošel na PR #6.
  - Playwright Staging Full E2E prošel na větvi `fix/admin-revenue-miocoin-reporting`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25845908864`.
  - Playwright Staging Full E2E prošel: run `25845971759`.

---

## 2026-05-14 - get_admin_summary_dashboard follow-up audit

- Po PR #6 hlavní admin reporting správně odděluje `Tržba Kč` a `Připsané MioCoiny`.
- Read-only audit potvrdil, že DB funkce `get_admin_summary_dashboard` stále ve legacy `payments_summary` formátuje `payments.amount` jako Kč.
- `payments.amount` zůstává připsaný počet MioCoinů, ne zaplacená Kč částka.
- Funkce je v živém kódu používána pouze v `AdminValidationWorkflows` / admin validation tabu.
- Hlavní admin revenue reporting po PR #6 na tuto legacy hodnotu nespoléhá.
- Toto není Web/PWA launch blocker.
- Technický dluh po launchi:
  - buď přestat ve frontend validačním tabu zobrazovat raw `payments_summary`,
  - nebo později upravit DB funkci přes samostatně schválenou migraci.
- Během auditu nebyly změněny soubory, app kód, data ani schema.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.

---

## 2026-05-14 - MioCoin top-up package verification

- MioCoin top-up package mapping bylo ověřeno read-only.
- Potvrzené mapování:
  - 50 Kč -> 50 MioCoinů
  - 300 Kč -> 310 MioCoinů
  - 500 Kč -> 525 MioCoinů
  - 1200 Kč -> 1280 MioCoinů
- Ověřené plochy:
  - Homepage top-up balíčky,
  - Profile top-up balíčky,
  - PaymentSuccess analytické mapování,
  - `paymentReporting` admin reporting helper,
  - `create-stripe-checkout` serverové mapování ceny na MioCoiny,
  - `stripe-webhook` mapování zaplacené Kč částky na připsané MioCoiny,
  - admin reporting po PR #6.
- Homepage, Profile, PaymentSuccess, `paymentReporting`, `create-stripe-checkout`, `stripe-webhook` a admin reporting mapping jsou sladěné.
- Nebyla nalezena žádná neshoda.
- Toto není Web/PWA launch blocker.
- Během auditu nebyly změněny soubory, app kód, data ani schema.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, payments, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-14 - Production contest status cleanup

- Poslední aktivní testovací soutěž `bmw` byla přesunuta ze stavu `active` do `draft`.
- Finální produkční stav soutěží:
  - `active = 0`
  - `closed = 19`
  - `draft = 76`
- Žádné soutěže nebyly smazány.
- Tento stav je správný, protože OneMil ještě není oficiálně veřejně spuštěný.
- Public launch bude vyžadovat vytvoření nebo aktivaci pouze reálných soutěží s dokončenými PDF pravidly.
- Nebyl měněn app kód.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- V rámci tohoto dokumentačního záznamu nebyla dotčena Supabase data, Stripe, wallet, payments, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-14 - PR #7 Affiliate program wording merge

- Sloučen PR #7 `Rename influencer UI to Affiliate program` do `main`.
- Merge commit: `5391fdaabaccb1b1e4d5bd34fe845a46ae01603d`.
- Viditelné UI/admin označení `Influencer` bylo přejmenováno na `Affiliate program` / `Affiliate partner`.
- `/influencer` routes zůstávají beze změny kvůli bezpečnosti a kompatibilitě.
- Interní DB názvy `influencer_*` zůstávají beze změny.
- Nebyly změněny provize, tracking, login/routing, DB ani business logika.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, commissions, tracking, routes, login behavior ani `buy_ticket_atomic`.
- Ověření před merge:
  - Smoke E2E prošel na PR #7.
  - Playwright Staging Full E2E prošel na větvi `fix/affiliate-program-wording`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25859772102`.
  - Playwright Staging Full E2E prošel: run `25859844919`.

---

## 2026-05-14 - PR #8 Footer Affiliate wording fix

- Sloučen PR #8 `Update footer Affiliate wording` do `main`.
- Merge commit: `003a54dc874568f90f263543d8b1b1f54d41dfd5`.
- Zbývající viditelné footer texty `Pro influencery`, `Registrace influencera` a `Přihlášení influencera` byly nahrazeny wordingem `Affiliate program` / `Affiliate partner`.
- Existující URL/routes zůstaly beze změny.
- Nebyly změněny DB, logika, provize, tracking ani login/routing.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, commissions, tracking, routes, login behavior ani `buy_ticket_atomic`.
- Ověření před merge:
  - Smoke E2E prošel na PR #8.
  - Playwright Staging Full E2E prošel na větvi `fix/footer-affiliate-wording`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25861584394`.
  - Playwright Staging Full E2E prošel: run `25861663913`.

---

## 2026-05-14 - PR #9 visible referral / Influencer wording cleanup

- Sloučen PR #9 `Clean visible referral and influencer wording` do `main`.
- Merge commit: `06e98a392db9213be501085ee1d44daa89c43512`.
- Viditelné UI/admin wording `referral` bylo nahrazeno českým wordingem `doporučení` / `doporučovací`.
- Viditelné admin wording `Influencer` bylo nahrazeno wordingem `Affiliate partner`.
- `/influencer` routes zůstávají beze změny.
- Interní DB/table/function názvy `influencer_*` a interní `referral_*` názvy zůstávají beze změny kvůli kompatibilitě.
- Nebyly změněny routes, DB, tracking, provize, login/routing, Stripe, wallet, contest, ticket, winner, Partner Offers ani `buy_ticket_atomic`.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, commissions, tracking, routes, login behavior ani `buy_ticket_atomic`.
- Ověření před merge:
  - Smoke E2E prošel na PR #9.
  - Playwright Staging Full E2E prošel na větvi `fix/visible-referral-affiliate-wording`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25862999591`.
  - Playwright Staging Full E2E prošel: run `25863074687`.

---

## 2026-05-14 - PR #12 mobile/PWA Messages fixed layout

- Sloučen PR #12 `Fix mobile PWA messages scroll layout` do `main`.
- Merge commit: `afe743f469e9ec0059a3a1f787d8ac2ec6711946`.
- Mobile/PWA Messages layout byl opraven tak, aby horní Messages header a spodní message composer zůstaly stabilní.
- Scrolluje pouze seznam zpráv mezi headerem a composerem.
- Bottom navigation zůstává fixed.
- Nebyla změněna Bob/AI logika ani message sending logika.
- Nebyly změněny routes, DB, Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, Affiliate ani `buy_ticket_atomic`.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Ověření před merge:
  - Smoke E2E prošel na PR #12.
  - Playwright Staging Full E2E prošel na větvi `fix/mobile-messages-fixed-header-composer`: run `25876737161`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25876891113`.
  - Playwright Staging Full E2E prošel: run `25877013278`.

---

## 2026-05-14 - PR #15 voucher redeem E2E coverage

- Sloucen PR #15 `Add voucher redeem E2E coverage` do `main`.
- Merge commit: `72810c94b3ce0397faf8246eb5e3820022d82203`.
- Pridan staging-only spec `tests/e2e/11-voucher-redeem.spec.ts`.
- Staging Full E2E nyni overuje zakoupeny voucher redeem/detail modal, `OMV-XXXXXXXX` voucher kod a tlacitko `Zkopirovat kod`.
- Staging workflow nove seeduje dedikovany `E2E Spec11 Voucher` a zakoupeny `user_vouchers` radek pro E2E uzivatele.
- Production Smoke zustava lightweight a unchanged: dal spousti pouze specs 01 + 02.
- Nebyl zmenen app kod.
- Nebyly zmeneny DB, Stripe, wallet logika, contests, tickets, winners, Partner Offers, routes, tracking, login behavior ani `buy_ticket_atomic`.
- Nebyl proveden deploy.
- Nebyly spusteny migrace.
- Nebyla dotcena production data.
- Overeni pred merge:
  - Smoke E2E prosel na PR #15: run `25884819703`.
  - Playwright Staging Full E2E prosel na vetvi `test/e2e-voucher-redeem`: run `25884822640`.
- Overeni po merge do `main`:
  - Smoke E2E prosel: run `25885049877`.
  - Playwright Staging Full E2E prosel: run `25885285280`.
