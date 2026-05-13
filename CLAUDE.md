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

## CURRENT SYSTEM STATUS (10. 05. 2026)

- CI pipeline stabilní: dva oddělené workflow (commit `82f979f`):
  - `.github/workflows/playwright.yml` — **production smoke**: pouze `01-registration` + `02-login`; spouští se 3× denně + push/PR na `main`
  - `.github/workflows/playwright-staging.yml` — **staging full E2E**: všech 9 spec souborů; pouze `workflow_dispatch` (manuálně)
- **Produkce nemůže spouštět** testy 03–08 (ticket purchase, voucher, wallet, win-flow, Partner Offers) — hard-coded file paths v `playwright.yml`
- Telegram zprávy rozlišují: `✅ OneMil PROD smoke OK` / `❌ OneMil PROD smoke FAILED` vs `✅ OneMil STAGING full E2E OK` / `❌ OneMil STAGING full E2E FAILED`
- **Production smoke manuálně ověřen** (run `25618763318`): 6 passed, 1m 22s, Telegram doručen, specs 03–08 neběžely ✅
- Payment pipeline ověřen: Stripe webhook vrací 500 na selhání (retry), idempotency funguje, wallet credit přes trigger
- Registrace + login plně otestovány v Playwright (Chromium, CI)
- Playwright testy: **9 spec souborů** (01–08, dva soubory s prefixem 03); staging testy 03–08 čekají na GitHub Secrets:
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
