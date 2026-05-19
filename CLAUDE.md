# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before Starting Any Task

Always read these files first — they are the source of truth for current system state, known bugs, and next steps:
- `onemil_state.md` — current system state (treat as authoritative, ignore `state.md`)
- `onemil_history.md` — project timeline and context

Always read:
- `COMPANY_CONTEXT.md` — for company identity, owner, contacts, email signature, billing identity, and official company context.
- `ONEMIL_BUSINESS_CONTEXT.md` — for OneMil business model, product positioning, partner model, user rewards, influencers, agencies, social contests, vouchers, coupons, Partner Offers, and official explanation of what OneMil is.
- `PAPERCLIP_SETUP_CONTEXT.md` — for Paperclip setup, AI agents, OneMil Chief of Staff, sales department, lead database, and AI employee structure.

For schema/architecture context: `.cursor/SYSTEM_MAP.md` and `.cursor/PROJECT_CONTEXT.md`

## Commands

```sh
npm run dev              # Start Vite dev server (localhost:5173)
npm run build            # Production build
npm run lint             # ESLint validation
npm run functions:serve  # Serve Supabase Edge Functions locally
npm run deploy:ai        # Deploy ai-chat Edge Function to production
npm run e2e:full         # Full E2E test suite
npm run test:concurrency # Race condition tests
```

## Architecture

**OneMil** is a global contest and reward platform (React 18 + TypeScript + Vite, hosted via Lovable/Vercel).

**Core flow:** voucher purchase (Stripe) → wallet credit (MioCoin) → ticket purchase (`buy_ticket_atomic` RPC) → contest close at 1,000,000 tickets → winner distribution → prize delivery

**Backend:** Supabase (Postgres + Auth + Realtime + Edge Functions on Deno). 40+ Edge Functions in `supabase/functions/`.

**Event pipelines:**
- Reporting: `event_logs` → `event_queue` → Sofinity (external analytics)
- Push notifications: `notifications` → `push_log` → OneSignal

**Auth & roles:** Supabase Auth with three account types enforced via `useUserRole()`:
- Customers: `/`, `/games`, `/profile`, `/messages`, etc.
- Partners: `/partner/*` only
- Influencers: `/influencer/*` only (strictest isolation — sub-type of partner)
- Admins: `/admin/*`

**State management:** React Query (TanStack v5) for server state; `AuthContext` for auth state; component-level hooks for UI state.

**Key integrations:** Stripe (payments), OneSignal (push), Resend + Sofinity (email/events), OpenAI (AI chat via `ai-chat` Edge Function).

## Database Rules

- Always inspect the schema before writing or suggesting SQL (check `supabase/migrations/` or `.cursor/SYSTEM_MAP.md`).
- Never rename existing tables or columns. Never break RLS policies.
- All SQL is applied manually in the Supabase SQL Editor. Never run `supabase db push` or `db reset` automatically.
- Write SQL changes as migration files into `supabase/migrations/` — do not apply them.

## Actions Requiring User Approval

Do not execute these without explicit user instruction:
- Applying production migrations or any SQL that mutates production data
- Dropping/truncating tables or columns, modifying RLS
- Changing wallet or contest economic rules (ticket cost, prize amounts, contest close conditions)
- Deleting files or running destructive scripts

## Core Logic — Do Not Change Without Explicit Instruction

- `buy_ticket_atomic` RPC and all related ticket/contest logic
- Event pipeline: `event_logs` → `event_queue` → Sofinity
- Push pipeline: `notifications` → `push_log` → OneSignal
- Voucher → MioCoin → ticket economic flow

## Admin Contest Economy Panel

- PR #26 added a frontend-only read-only **Ekonomika** tab to `src/components/AdminContestManagement.tsx`.
- PR #27 added a compact read-only live economy summary bar above the admin contest modal tabs.
- PR #30 changed the admin final save path so MioCoin bonuses are persisted using the exact previewed positions from frontend state instead of being re-randomized through `distribute-bonus-prizes`.
- Phase 3A adds frontend-only physical prize cost preview fields in `src/components/AdminContestManagement.tsx`: supplier name, unit cost CZK, VAT rate, and optional per-prize handling override.
- The panel is an orientation preview during contest creation/editing. It calculates gross revenue, VAT, net revenue, main prize cost, MioCoin cost, handling cost, setup cost, marketing cost, total estimated cost, profit, margin, break-even ticket count, and recommended ticket price.
- The summary bar shows ticket count, total estimated costs, recommended ticket price, estimated net profit, and margin using the same frontend-only calculations as the **Ekonomika** tab.
- Economy assumptions are local frontend state only and reset when the modal context changes.
- The panel and summary bar do not save economy assumptions to Supabase.
- Physical prize cost preview is also frontend-only; supplier/cost/VAT/handling preview fields are not persisted to Supabase yet.
- Physical prize preview cost is now included in total estimated cost, profit, margin, break-even, and recommended ticket price. Handling uses per-prize override when set, otherwise the global default.
- Final contest save now validates bonus positions before persisting MioCoin rows: integer positions, range `1..ticket_count`, duplicate MioCoin positions, physical/MioCoin collisions, and final-ticket collisions.
- Editing existing contest bonus positions is blocked when tickets already exist.
- PR #52 added bulk quantity distribution for physical bonus prizes (Počet kusů + Rozmístění pozic: Rovnoměrně/Náhodně). For qty > 1 the app auto-assigns N unique positions via `pickPositions` helper; collision rules exclude MioCoin positions, existing physical prizes, final-ticket position, and out-of-range positions. Only `src/components/AdminContestManagement.tsx` changed.
- No changes were made to `buy_ticket_atomic`, ticket purchase logic, winner logic, Partner Offers, `bonus_prizes` schema, main prize final-ticket logic, migrations, or production smoke scope.

## Store Policy / Launch Copy Rules

- Public launch age rule is **18+**.
- Public copy must not describe OneMil contests as lottery, drawing/losování, random-generator based, gambling, betting, jackpot, casino, or similar framing.
- Correct public contest model: tickets open sequentially in order `1, 2, 3...`; winning positions are predefined in the rules of the given contest.
- MioCoin is internal OneMil credit.
- MioCoin cannot be withdrawn as money.
- MioCoin cannot be transferred outside OneMil.
- MioCoin can only be used inside OneMil.
- Charitable campaigns must state the specific beneficiary, purpose, and support amount for that campaign.
- PR #2 merged these copy rules to `main` after PR smoke and staging full E2E passed. No deploy was performed as part of that merge.

## Launch Strategy / Store Submission

- OneMil launch strategy is **Web/PWA first**.
- Apple App Store and Google Play submission is postponed.
- Reason: OneMil will not pay Apple/Google 15–30% fees for MioCoin purchases in the current launch strategy.
- Stripe remains the payment provider for Web/PWA MioCoin top-up.
- Future native iOS/Android apps may be reconsidered only after payment/store strategy is explicitly approved.
- Do not implement native store billing, native app submission changes, or mobile-only payment-routing changes without explicit user approval.

## Deployment rule
After every file change, always run:
git add -A && git commit -m "fix: <short description of change>" && git push

Never leave changes without pushing to GitHub.

## Chat system rules

Modes:
- AI mode (Bob active)
- ADMIN mode (Bob off after first admin message)

Flow:
- AI responds to user messages
- User can request support
- AI continues until admin sends first message
- First admin message switches to ADMIN mode
- AI must stop immediately
- Admin handles chat
- When support ends, switch back to AI mode

Technical:
- AI messages come from ai-chat via reply_message_id
- Must appear immediately
- Realtime is fallback
- No duplicates

---

## CURRENT SYSTEM STATUS (19. 05. 2026)

- **Staging Full E2E ZELENÝ po PR #59 (19. 05. 2026):** run `26106988469` — **27 passed, 0 failed, 3 skipped** (3m 6s). Spec 18 ✅ (11.3s, první pokus). Spec 19 ✅. Telegram: `✅ OneMil STAGING full E2E OK` doručen (message_id 492).
- **PR #59 mergnut (19. 05. 2026):** fix spec 18 pro PRs #56/#57 economy UI changes. Merge commit: `ab9e37f`. Změněn pouze `tests/e2e/18-admin-economy-persist.spec.ts`. Root cause: staging run `26105990009` — spec timeout na `Náklad na hlavní výhru` fill (pole přesunuto PR #57 do Basic tabu) a pokus o fill read-only pole `Náklad na MioCoin bonusy` (PR #56/#57). Fix: Step 4a v Basic tabu, Step 4b jen `Jednorázový`+`Cílová marže`, `Náklad na MioCoin bonusy` fill+assertion odstraněny.
- **PR #58 mergnut (19. 05. 2026):** fix physical prize grouping key — `image_url` vyloučeno z klíče v `src/pages/ContestDetail.tsx`. Bulk výhry mají unikátní UUID storage cestu → starý klíč s `image_url` → N duplicitních karet. Nový klíč: `${description}||${detailed_description}` → správné seskupení.
- **PR #57 mergnut (19. 05. 2026):** Economy input cleanup v `src/components/AdminContestManagement.tsx`. `Náklad na hlavní výhru` přesunut do Basic tabu. `Reálný náklad na MioCoin bonusy` vždy read-only (auto-odvozeno z `effectiveMioCoinCost`).
- **PR #56 mergnut (19. 05. 2026):** fix MioCoin bonus save RPC + auto-sync economy v `src/components/AdminContestManagement.tsx`. `admin_manage_bonus_prize` RPC s explicitními null args (eliminuje overload ambiguitu). `effectiveMioCoinCost` = auto-sync economy kalkulace se skutečnými MioCoin bonusy.
- **Staging Full E2E ZELENÝ po PR #55 (19. 05. 2026):** run `26059677757` — **27 passed, 0 failed, 3 skipped** (4m 14s). Spec 18 ✅ (10.8s, první pokus). Spec 19 ✅ (10.9s). Telegram: `✅ OneMil STAGING full E2E OK` doručen (message_id 475).
- **PR #55 mergnut (19. 05. 2026):** fix duplicate physical bonus prize cards (ContestDetail) + fix create-contest modal not closing. Merge commit: `9808f83d13e4ff09516dc2f352abcc3c28274ab8`. Změněny: `src/pages/ContestDetail.tsx`, `src/components/AdminContestManagement.tsx`. Part A: přidán `groupedBonusPrizes` useMemo — fyzické výhry se seskupují podle `description+detailed_description+image`; každá skupina → jedna karta s badge `N× v soutěži`. MioCoin bonusy zůstávají individuální. Part B: pro CREATE mód při `updatedRows.length === 0` (RLS blokuje client-side UPDATE čerstvého řádku) kód nyní pokračuje k `onSaved()/onClose()` místo `return`; pro EDIT mód původní chování zachováno. Žádné migrace, žádný RPC, žádné workflow changes.
- **Staging Full E2E ZELENÝ po PR #53 + #54 (18. 05. 2026):** run `26057380995` — **26 passed, 0 failed, 3 skipped** (4m 0s). Spec 08 ✅ skipped (PR #54 fix drží). Spec 18 ✅ passed (retry #1, 15.8s — transient staging latence). Spec 19 ✅ (12.3s). Telegram: `✅ OneMil STAGING full E2E OK` doručen (message_id 471).
- **PR #54 mergnut (18. 05. 2026):** fix flaky skip guard v spec 08 (`tests/e2e/08-partner-offer-persistence.spec.ts`). Merge commit: `819cb77819bfc37598a621b46821a1995c17d2c9`. Nahrazen `waitForTimeout(2_000) + okamžité isVisible()` za `Promise.race` pattern (mirror spec 07) — wait up to 10s pro offer card nebo empty state, poté skip guard. Přidán i `!firstCard.isVisible()` fallback skip. Žádný app kód, workflow, schéma nezměněno.
- **PR #53 mergnut (18. 05. 2026):** fix gallery upload "Invalid key" — raw file names se sanitizují před uložením do Supabase Storage (`src/components/AdminContestManagement.tsx`). Merge commit: `8356ac04bdf3d03f457febe6e199fca4593e856b`. Přidán helper `sanitizeStorageFileName()`: NFD normalize + strip diakritiky + spaces→hyphens + strip speciálních znaků + collapse hyphens + fallback "file". Aplikován na všechny 3 gallery upload paths. Nový storage key formát: `${Date.now()}-${crypto.randomUUID()}-${safeFileName}`. Žádné migrace, žádný RPC, žádné workflow changes.
- **Staging Full E2E ZELENÝ po PR #52 (18. 05. 2026):** run `26053065266` — **27 passed, 0 failed, 3 skipped** (3m 56s). Spec 18 ✅ (9.8s), spec 19 ✅ (10.0s). Telegram: `✅ OneMil STAGING full E2E OK` doručen. Žádná regrese po přidání bulk distribution feature.
- **PR #52 mergnut (18. 05. 2026):** přidána bulk quantity distribution pro věcné bonusové výhry v `src/components/AdminContestManagement.tsx`. Merge commit: `e43cda76c4f187bd4a8e9ae00ec3396626a73e19`. Nová UI pole: Počet kusů (default 1), Rozmístění pozic (Rovnoměrně / Náhodně). Automatická bezkolizní distribuce pozic pro qty > 1 — vylučuje MioCoin pozice, existující věcné výhry, final-ticket pozici a pozice mimo rozsah. Opraven stale helper text. Žádné migrace, žádný RPC, žádné workflow changes.
- **Staging Full E2E ZELENÝ — Phase 4 KOMPLETNÍ (18. 05. 2026):** run `26046436837` — **27 passed, 0 failed, 3 skipped** (4m 28s). Spec 18 ✅ (11.9s), spec 19 ✅ (11.2s, první pokus bez retry). Telegram: `✅ OneMil STAGING full E2E OK` doručen. Všechny 19 spec souborů zelené. 3 skipy jsou pre-existující záměrné skipy (spec 01 new-user registration, spec 07 partner offer open, spec 08 partner offer persistence).
- **Staging SQL fix aplikován manuálně (18. 05. 2026):** Na staging projektu `dxmowysntemfqfnanxua` bylo aplikováno: (1) `ALTER TABLE bonus_prizes ADD COLUMN IF NOT EXISTS supplier_name/unit_cost_czk/vat_rate_percent/handling_override_czk` — Phase 4 economy sloupce; (2) `CREATE POLICY "Allow admin full access to bonus prizes" ON bonus_prizes FOR ALL USING (has_role(...))` — chybějící write policy odblokovala přímé client-side UPDATE/DELETE z admin UI. Bez write policy `.update()` economy dat tiše selhával (0 řádků), `.delete()` cleanup taky; SECURITY DEFINER RPC obcházel RLS a INSERT fungoval, čímž se maskovala chyba.
- **PR #51 mergnut (18. 05. 2026):** přidán workflow seed step "Ensure staging admin E2E user has admin role" do `playwright-staging.yml` — Supabase Admin API najde/vytvoří `admin-e2e@onemil.cz` v auth.users a upsertuje public.users (role=admin), user_roles, profiles, wallets před spuštěním E2E suite. Idempotentní. Merge commit: `97797662d19cafe53062a04fb73449545ef98780`. Pouze `.github/workflows/playwright-staging.yml`.
- **Production smoke ZELENÝ (18. 05. 2026):** run `26027726603` — 5 passed, 0 failed, 0 skipped (22s). Telegram: `✅ OneMil PROD smoke OK`. Phase 4 migrace na produkci ověřeny bez regrese.
- **Phase 4 — Economy Persistence NASAZENA NA PRODUKCI (18. 05. 2026):** `contest_economy` tabulka + `bonus_prizes` economy sloupce aplikovány na produkci; production smoke zelený; staging Full E2E zelený (run `26026329321`, 26/3/0); spec 18 ověřuje celý persistence cyklus.
- **PR #49 mergnut (18. 05. 2026):** fix spec 18 cleanup hang — přidán `{ timeout: 1000 }` do close button click; selector `[aria-label="Close"]` nenacházel element, bez `actionTimeout` čekal donekonečna. Merge commit: `a0a2b494ef398c74b1cee591b1554d4610daac00`. Pouze `tests/e2e/18-admin-economy-persist.spec.ts`.
- **PR #50 mergnut (18. 05. 2026):** přidán `tests/e2e/19-admin-physical-prize-economy-persist.spec.ts` (173 řádků, staging-only). Ověřuje celý cyklus persistování fyzických nákladových údajů věcných výher (supplier_name, unit_cost_czk, vat_rate_percent, handling_override_czk). Sdílí `E2E_SPEC18_CONTEST_ID`. Merge commit: `1b937efba87cbda9118a2d8e532d2da6fdc46d44`.
- **Staging Full E2E ZELENÝ (18. 05. 2026):** run `26026329321` — 26 passed, 3 skipped, 0 failed. Spec 18 (economy persist) prošel (10.7s). Spec 17 prošel. Spec 16 prošel. Telegram OK doručen.
- **PR #16 mergnut (17. 05. 2026):** přidán `tests/e2e/17-profile-smoke.spec.ts` — staging-only, read-only profile smoke test. Ověřuje `/profile` rendering pro E2E uživatele: identita, peněženka/MioCoin sekce, Účet heading, Přihlašovací údaje, Osobní údaje. Přejmenováno z `12-` na `17-` (kolize s `12-mobile-messages-layout.spec.ts`). Merge commit: `7fd9766972b4a84c9ee33b11357f42ad46c38854`. Žádný app kód, migrace ani business logika nezměněna.
- **PR #38 mergnut (17. 05. 2026):** spec 16 Ekonomika tab assertions přesunuty na `econPanel = dialog.locator('[role="tabpanel"][data-state="active"]')` — zamezuje strict mode violations z always-visible summary baru. Pouze `tests/e2e/16-admin-economy-preview.spec.ts`.
- **PR #37 mergnut (17. 05. 2026):** spec 16 `Balné` assertion opraven na `{ exact: true }` — regex matchoval 2 elementy. Pouze `tests/e2e/16-admin-economy-preview.spec.ts` (1 řádek).
- **PR #36 mergnut (17. 05. 2026):** admin contest create/edit modal je nyní wider (`max-w-[95vw]`), economy summary bar se zalamuje responsivně, záložky se zalamují — žádný vnitřní horizontální scrollbar. Změněn pouze `src/components/AdminContestManagement.tsx` (layout CSS). Žádná logika nezměněna.
- **PR #34 mergnut (17. 05. 2026):** přidán `tests/e2e/16-admin-economy-preview.spec.ts` — staging-only, read-only smoke test admin economy preview. Ověřuje, že věcná výhra aktualizuje economy summary bar a záložku Ekonomika bez finálního uložení. Selektory jsou stabilní (inputByLabel helper, summaryValue přes div.uppercase.opacity-70). Skip guard pokud chybí admin secrets.
- **Playwright testy: 19 spec souborů** (01–19); staging full E2E obsahuje všechny spec soubory
- CI pipeline stabilní: dva oddělené workflow (commit `82f979f`):
  - `.github/workflows/playwright.yml` — **production smoke**: pouze `01-registration` + `02-login`; spouští se 3× denně + push/PR na `main`
  - `.github/workflows/playwright-staging.yml` — **staging full E2E**: všech 19 spec souborů; pouze `workflow_dispatch` (manuálně) + schedule 3× denně
- **Produkce nemůže spouštět** testy 03–17 (ticket purchase, voucher, wallet, win-flow, Partner Offers, admin, profile) — hard-coded file paths v `playwright.yml`
- Telegram zprávy rozlišují: `✅ OneMil PROD smoke OK` / `❌ OneMil PROD smoke FAILED` vs `✅ OneMil STAGING full E2E OK` / `❌ OneMil STAGING full E2E FAILED`
- **Production smoke manuálně ověřen** (run `25618763318`): 6 passed, 1m 22s, Telegram doručen, specs 03–08 neběžely ✅
- Payment pipeline ověřen: Stripe webhook vrací 500 na selhání (retry), idempotency funguje, wallet credit přes trigger
- Registrace + login plně otestovány v Playwright (Chromium, CI)
- Playwright testy: **17 spec souborů**; staging testy 03–17 čekají na GitHub Secrets (set):
  - `STAGING_E2E_TEST_EMAIL` → `e2e@onemil.cz`, `STAGING_E2E_TEST_PASSWORD`, `STAGING_E2E_CONTEST_ID` → `3fa56db0-4007-4fb7-aa2f-e460173070d8`, `STAGING_E2E_WIN_CONTEST_ID` → `7ff58a8e-c691-46e1-9e0c-ca6cddeb8abb`
- **Staging seed ověřen** (10. 05. 2026): test user `e2e@onemil.cz`, wallet 5000 MioCoin, general contest + win contest active, partner offer approved a připojena — detaily v `onemil_state.md`
- **Staging full E2E ZELENÝ + wallet reset ověřen** (run `25625184545`, 10. 05. 2026): ✅ ALL PASSED — 13 passed, 4 skipped, 0 failed, 2m 33s
  - Workflow auto-seeduje nový win contest před každým spuštěním (PostgREST INSERT + step output)
  - Workflow resetuje wallet test uživatele na 5 000 MioCoin před testy (commit `50ba68c`)
  - Telegram success doručen
  - Commity: `3c4aecf`, `324a747`, `6ee26df`, `e70fd5c` (stabilizace) + `50ba68c` (wallet reset) + `631f915` (signup email domain `@example.com` → `@onemil.cz`)
  - Staging full E2E **naplánováno 3× denně** (commit `37cfd6c`): 04:00 / 12:00 / 20:00 Praha — offset od production smoke, žádný překryv
  - `workflow_dispatch` zůstává dostupný
  - Destruktivní testy (03–08) **nesmí běžet v produkci** (hard-coded v `playwright.yml`)
  - Produkce nedotčena
- **Migrace commitnuty ale neaplikovány** v Supabase:
  - `20260420_ensure_wallet_exists.sql` — wallet auto-creation helper
  - `20260420_fix_profiles_insert_remove_user_id.sql` — oprava trigger profiles INSERT
  - `20260424_fix_won_type_main_priority_over_bonus.sql` — won_type: main > bonus priorita
  - `20260504_fix_nonblocking_sofinity_triggers.sql` — 57014 timeout fix (trigger non-blocking)
- **Migrace aplikované v produkci (05. 05. 2026):**
  - `20260504_add_remaining_and_bonus_distance_to_buy_ticket_atomic.sql` ✅
- won_type bug potvrzen a opravena v migraci: poslední tiket + bonusová pozice → byl vracen 'bonus' místo 'main'
- Frontend volá `buy_ticket_atomic` přímo (ContestDetail, Games, FavoriteGames) — ne přes Edge Function
- buy_ticket_atomic nyní vrací: `remaining_tickets`, `next_bonus_position`, `distance_to_next_bonus`

## STAGING READINESS — stav (09. 05. 2026)

**Produkce:** projekt `onemil`, ref `xkzhjldrojjlrkezorey`, region `eu-north-1`
**Staging:** projekt `onemil-staging`, region `eu-north-1`, ref TBD po vytvoření manuálně

- **Fáze 1 dokončena** (commit `20c6452`): hardcoded produkční URL nahrazeny env/client-based hodnotami
  - `process_event_queue_worker/index.ts` — `SOFINITY_RELAY_URL` env var
  - `src/pages/ShareTicket.tsx` — `${supabaseUrl}/functions/v1/og-ticket-share`
  - `src/components/TicketResultModal.tsx` — `${supabaseUrl}/functions/v1/og-ticket-share`
- `api/og-ticket.ts` + `vercel.json` — **legacy**, Lovable je aktivní deploy cesta; tyto soubory se nespouštějí
- **Fáze 2 dokončena** (09. 05. 2026, commit `4167527`):
  - Projekt `onemil-staging` vytvořen, ref `dxmowysntemfqfnanxua`, region `eu-north-1`
  - `SOFINITY_RELAY_URL` nastaven → `https://dxmowysntemfqfnanxua.supabase.co/functions/v1/sofinity-noop`
  - `sofinity-noop` nasazena na staging, POST test ✅ `{"ok":true,"noop":true}`
  - Produkce `xkzhjldrojjlrkezorey` a Sofinity relay `rrmvxsldrjgbdxluklka` nedotčeny
- **Fáze 3 — POZASTAVENO (10. 05. 2026):**
  - `db push` selhal na migraci #3 (`20250914043049_`) — `public.payments` neexistuje v prázdné staging DB
  - Root cause: počáteční schéma nebylo nikdy zachyceno jako migrace; první migrace jsou hotfixy na existující schéma
  - **Schema baseline aplikován manuálně:** produkční schéma zdumpováno a aplikováno na staging přes SQL Editor
  - Ověřeno na staging: 73 tabulek ✅, `buy_ticket_atomic` ✅, wallet trigger ✅, 95 RLS ✅
  - `schema_migrations` testován ve 4 formátech — nejlepší dosažitelný stav: **324 číselných prefixů, 17 souborů permanently pending**
  - Root cause: repozitář obsahuje soubory s duplicitními timestamps a smíšenými 8/14-cifernými prefixy — exit code 0 nelze dosáhnout bez přejmenování souborů
  - **Strategie rozhodnuta (10. 05. 2026): Option A — `db push` se na staging nepoužívá**
  - Nové DB změny se aplikují manuálně přes SQL Editor (stejný workflow jako produkce)
  - `schema_migrations`: 324 řádků — přijato jako finální stav, neměnit
  - 17 permanently pending souborů je obsaženo v baseline schématu — CLI je nedokáže sledovat, ale schéma je správné
  - **⛔ Nespouštět `db push` na staging. Needitovat `schema_migrations` bez schválení.**
  - Produkce `xkzhjldrojjlrkezorey` nedotčena ✅
  - Detaily v `onemil_state.md` — Fáze 3 sekce
- **Staging Edge Functions nasazeny (10. 05. 2026):**
  - `sofinity-noop` — ACTIVE ✅ (nasazeno dříve)
  - `upload-ticket-share` — ACTIVE ✅ (nasazeno 10. 05. 2026)
  - Storage bucket `ticket-shares` existuje na staging, public: true ✅

## NEDODĚLÁNO — otevřené body (10. 05. 2026)

- **Vizuální systém:** brand větve nemergnuto do `main` (viz sekce níže)

## Partner Offers — invarianty (uzamčeno, nesmí se měnit)

- Partner Offers **nejsou** výhry soutěže
- Partner Offers se **nesmí** počítat do výpočtu vzdálenosti k nejbližší výhře v `TicketResultModal`
- Partner Offers se **nesmí** zapisovat do tabulek `winners` ani `bonus_prizes`
- `assign_partner_offer_to_ticket` se volá pouze při `won_type === null`

---

## Vizuální systém — NEDOKONČENO (27. 04. 2026)

Grafika je rozpracovaná. Momentálně testujeme funkčnost systému. Grafika se dořeší poté.

**Větve s vizuálními změnami (obě nemergnuto do `main`):**
- `claude/setup-playwright-tests-bShrg` — Poppins + Energy Orange (commity `d6d4597`, `25e87dd`)
- `claude/thirsty-volhard-e1eb7c` — zmírnění zlaté, soft rgba bordery (commit `a21ef28`)

**Soubory dotčené vizuálními změnami:**
- `src/index.css` — CSS proměnné gold → amber-orange, glow opacity snížena
- `src/components/ContestCard.css` — border sweep a inner glow zmírněny
- `src/components/ContestCard.tsx` — border, progress bar, CTA button barvy
- `src/components/MioCoin.tsx` — outer ring gradient, shadow snížena

**Co je potřeba dořešit:**
- Rozhodnutí o mergi větví do `main`
- Sjednocení fontu (Poppins vs Plus Jakarta Sans)
- Vizuální review všech stránek po brand aplikaci
- Schválení výsledku v prohlížeči před mergem

---

## Aktuální uzamčený stav (13. 04. 2026, dokumentace synchronizována 20:46:33 +02:00)
- Dočasný frontend private-access gate v `src/App.tsx` byl odstraněn (2026-04-10); přihlášení a role routing beze změny; `npm run build` ověřen úspěšně.
- Partner Offers v1 je dokončené, nasazené a prošlo finálním E2E ověřením.
- Chybějící wiring byl doplněn v `supabase/functions/purchase-ticket/index.ts`, takže assignment běží automaticky po `buy_ticket_atomic` při `won_type === null`.
- Block E frontend je nasazený a builduje čistě (commit `b7aa4ce`):
  - `src/components/OfferCard.tsx` — existuje
  - `src/components/OfferDetailModal.tsx` — existuje
  - `src/pages/Wins.tsx` — obsahuje tab Výhry / Nabídky
- Partner portal offer management UI nasazeno v `src/pages/PartnerDashboard.tsx` (2026-04-11):
  - Partner vidí seznam svých nabídek s reálnými stavy (draft/submitted/approved/rejected)
  - Může vytvářet draft, odesílat ke schválení, vracet zamítnuté k úpravám
  - Approved nabídky jsou read-only (nelze editovat)
  - Build: ✅ exit code 0
- Partner billing visibility nasazeno v `src/pages/PartnerDashboard.tsx` (2026-04-12):
  - Karta „Fakturace nabídek" čte `partner_offer_activations`, `partner_offer_billing_configs`, `partner_invoices(type='offer')`
  - PDF download volá `generate-partner-invoice-pdf` přes `withEdgeInternalToken`
- `category_contests` zůstává mimo v1, dokud nebude existovat skutečný model kategorií soutěží.
- OneMil kanonické memory soubory jsou pouze:
  - `onemil_state.md`
  - `onemil_history.md`
  - `CLAUDE.md`
  v workspace `C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw`.

## Contest admin – uzamčená pravidla (13. 04. 2026, sync 20:46:33 +02:00)

### Statuses
- Platné hodnoty v DB (constraint `contests_status_check`): `draft`, `pending`, `active`, `paused`, `closed`
- `draft` se v admin UI zobrazuje jako **„Archiv test"** — DB hodnota se nemění
- `closed` je pouze systémový přechod — admin ho nemůže nastavit ručně
- **`closed` je finální** — uzavřená soutěž se nesmí vrátit do žádného jiného stavu; `handleStatusChange` to blokuje guard + disabled Select

### Admin contest management UX
- `src/components/AdminContestManagement.tsx` — 3 taby: Aktivní soutěže / Archiv test / Archiv ukončených soutěží (archiv na stejné stránce, ne nová stránka ani row dropdown)
- `closed` soutěže patří do tabu Archiv ukončených soutěží
- Přechod do `draft` (Archiv test): povolen jen z `pending` nebo `paused`; z `active` zablokován
- Contest create: `AdminContestManagement` → `admin_manage_contest`; `ticket_count` musí být platný na frontendu i při create na RPC (žádný tichý default / žádné tiché přijetí neplatného nebo chybějícího `ticket_count`)
- Lovable: po změnách admin UI často **Share → Publish**, aby byl live build v prohlížeči

### Hard delete – zakázáno
- Hard delete soutěže je nebezpečný: `partner_offer_contests.contest_id` má FK na `contests(id)`
- Soft detach (`detached_at`) logicky odpojí nabídku, ale FK řádky fyzicky zůstávají → DELETE selže
- Testovací soutěže se archivují přesunem do `draft`, ne mazáním; neřadit je mezi běžné produkční „cleanup" cíle
- V admin UI je delete povolen pouze pro `draft` a `pending` (testovací fáze)

### Co se nesmí měnit
- `buy_ticket_atomic` — bez explicitní instrukce
- `assign_partner_offer_to_ticket` — bez explicitní instrukce
- `partner_offer_contests` — neměnit FK model; **nemazat** vazební řádky natvrdo kvůli úklidu soutěží
- Trigger `trg_partner_offer_approved` — neměnit
- Přechod `active` → `draft` musí zůstat zablokovaný
- Úklid soutěží: řešit stavem (`draft` / Archiv test), ne mazáním contestu ani mazáním `partner_offer_contests`

---

## Brand Identity (uzamčeno 27. 04. 2026)

Full reference: `docs/brand/onemil_brand_kit/graphics.md` (source zip: `docs/brand/onemil_brand_kit.zip`)
**Tagline:** Luxusní soutěže. Skutečné výhry.

- **Aesthetic:** dark premium tech-luxury — never casino / hazard / gambling / jackpot / roulette / chips / slot-machine (visuals or wording)
- **Headings:** Poppins 600–800 (Google Fonts import only — no font files in repo)
- **Body / UI:** Inter 400–500
- **Accent colour:** Energy Orange `#FF8A00` (primary CTA gradient: `#FF8A00` → `#FFB547`)
- **Backgrounds:** Midnight Black `#0A0B0F` / Deep Navy `#101722` / Graphite `#1D2128`
- **Text:** Platinum `#E7EBF0` / Silver `#BFC6CF` / Muted Silver `#8E98A6`
- **CSS token prefix:** `--om-*` (e.g. `--om-orange`, `--om-black`, `--om-platinum`)
- **Primary logo:** trophy / "1" motif *behind* the OneMil wordmark (web, app, hero)
- **Secondary logo:** trophy *above* the OneMil wordmark — stacked (social, banners, posters)
- **Standalone icon:** trophy / "1" symbol only — favicon, app icon, avatars
- **Logo colour:** metallic silver / platinum gradient (not flat white, not yellow gold)
- **Forbidden words (CZ):** casino, hazard, sázení, sázka, jackpot, žetony, zbohatni
- **Forbidden words (EN):** casino, gambling, betting, jackpot, roulette, chips, slot
- **Use instead:** soutěž, tiket, MioCoin, voucher, hlavní výhra, luxusní cena

---

## Git workflow rule

After ANY code change that is confirmed working:
1. git add .
2. git commit -m "<short clear message>"
3. git push

Rules:
- NEVER push broken code
- ALWAYS test before push
- NEVER skip push after confirmed fix

---

## State/History auto-commit rule

Po každém zápisu do `onemil_state.md` nebo `onemil_history.md` automaticky spusť:

```sh
git add -A && git commit -m "update state" && git push origin main
```

Toto pravidlo platí vždy, bez výjimky — nikdy nenechávej state/history změny bez commitu a pushe.

---

## Paperclip — operační pravidla (12. 05. 2026)

Paperclip běží lokálně jako AI management vrstva pro OneMil.
Spuštění: `npx paperclipai onboard --yes` z `C:\Users\divis\Desktop\Onemil - Projekt\million-ticket-draw`.
Detailní setup viz `PAPERCLIP_SETUP_CONTEXT.md`.

### Aktivní agenti

| Agent | Adaptér | Role |
|-------|---------|------|
| Provozní ředitel OneMil | claude_local / codex_local | Manažer, deleguje práci |
| Průzkumník obchodních leadů OneMil | codex_local | Lead research, hledá firmy |

### Pravidla pro Claude Code při práci s Paperclipem

- **Nikdy nečti `onemil_history.md` automaticky** v kontextu Paperclip agentů — pouze na výslovnou žádost Pavla.
- Provozní ředitel **deleguje** lead scouting, velké tabulky, marketingový průzkum a repetitivní práci na Průzkumníka. Sám zpracovává, pouze pokud Pavel řekne „zpracuj osobně".
- Výstupy se **zveřejňují přímo do komentáře Paperclip issue** (ne jen jako interní soubor).
- Soubory (CSV, Markdown, reporty) se ukládají do: `C:\Users\divis\Desktop\OneMil Paperclip Outputs`
- Nový agent se **navrhuje, ale nespouští** bez schválení Pavla Diviše.
- Pavel Diviš je owner a final decision maker — žádná akce (e-mail, outreach, GitHub, Supabase, Stripe, produkce) bez jeho výslovného schválení.
