# OneMil — Ticket Result UI rollout — 2026-09-19

**STATUS: DOKONČENO A OVĚŘENO NA PRODUKCI**

Tento dokument je závěrečný záznam k redesignu výsledku ticketu, mystery/voucher flow a detailu uložené výhry v `/wins`.

## Produkční stav

- Produkční frontend po finálním nasazení odpovídá commitu:
  - `ba010fe30637e509bada3a4bdb4e941102fb94e8`
- Lovable production deployment:
  - `6a8d1935-ff4b-45df-b5aa-5c9d79b040bb`
- Uživatel po nasazení ručně ověřil na `onemil.cz/wins`, že se nový light-premium design detailu výhry zobrazuje správně.
- Produkční Supabase projekt:
  - `xkzhjldrojjlrkezorey`

## PR #420 — nový výsledek po nákupu + DB opravy

Squash commit:

`fa9d72b5f320584d82c9739f4389a9043385ad70`

Součásti:

- `src/components/TicketResultModal.tsx`
- `src/components/MysteryPurchaseResultDialog.tsx`
- `src/components/VoucherTicketFrame.tsx`
- `src/components/CookieConsentBanner.tsx`
- nové assety pro result/mystery flow
- E2E testy pro win flow, guaranteed benefit, hlavní výhru a viditelnost uzavřené soutěže

Výsledkové stavy sjednocené v novém flow:

- běžná nevýhra
- fyzická bonusová výhra
- MioCoin bonus
- hlavní výhra
- partner offer
- guaranteed purchase benefit / voucher
- kombinace výhra + voucher

Schválený vizuální směr:

- light-premium OneMil
- white / warm cream
- tmavý text
- Energy Orange / Warm Amber akcent
- ticket/certifikát charakter
- bez dark casino / purple gaming vzhledu

## PR #421 — detail uložené výhry v /wins

Squash commit:

`ba010fe30637e509bada3a4bdb4e941102fb94e8`

Změněn pouze:

- `src/components/WinDetailModal.tsx`

Výsledek:

- starý dark/purple modal odstraněn
- vzhled sjednocen s novým TicketResultModal
- light-premium certifikát/ticket
- zachovaná původní funkční logika
- desktop i mobil 375×812 ověřen bez horizontálního overflow

## Produkční DB migrace

Na produkci byly aplikovány pouze tyto dvě migrace:

1. `supabase/migrations/20260918100000_main_prize_uses_contest_main_prize.sql`
   - hlavní výhra vrací skutečný název z `contests.main_prize`
   - zachován fallback pro prázdný název
   - ostatní logika `assign_contest_ticket_atomic` zachována

2. `supabase/migrations/20260918110000_contests_winner_can_read_own_contest.sql`
   - přihlášený uživatel může načíst soutěž, ve které má vlastní winner záznam
   - uzavřené soutěže se tím neotevírají veřejnosti
   - původní public a admin policies zůstaly beze změny

Po aplikaci migrací byl proveden read-only post-check a nebyla změněna žádná produkční data.

## Ověření před nasazením

Pro relevantní změny prošlo:

- Typecheck — PASS
- Build — PASS
- Playwright Smoke E2E Chromium — PASS
- Vercel — PASS
- Vercel Preview Comments — PASS
- cílené E2E testy win flow — PASS
- finální staging průchod ticketů 1–12 — PASS

Staging průchod ověřil mimo jiné:

- hlavní výhru na posledním ticketu
- fyzickou bonusovou výhru
- MioCoin bonus bez dvojího připsání
- guaranteed benefit/voucher
- partner offer
- správné odečty z wallet
- uzavření soutěže
- správný winner přístup po uzavření

## Produkční konfigurace mimo tento rollout

Při produkčním pre-flight byl nalezen již existující stav:

- `guaranteed_benefit_purchase_enabled = true`
- allowlist obsahoval soutěž `Business letenky do Thajska s Emirates`
- contest ID: `3a4f9295-084a-444f-8add-56795e4331fe`
- v okamžiku kontroly bylo dostupných voucher kódů: `0`

Tato konfigurace nebyla v rámci rolloutu měněna.

## Finální závěr

Scope tohoto rolloutu je uzavřený:

- nový výsledek po nákupu je nasazený
- mystery/voucher výsledek je nasazený
- detail uložené výhry v `/wins` je nasazený
- název hlavní výhry je opravený
- výherce vidí svou uzavřenou soutěž
- produkční zobrazení nového designu bylo ručně potvrzeno

Další změny v této oblasti mají navazovat na tento stav a nesmí vracet starý dark/purple design.
