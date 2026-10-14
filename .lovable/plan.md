# Oprava neúspěšného buildu posledních změn (4 soubory)

## Co je ověřené (read-only)

- Všech 18 chyb z `npx tsc -p tsconfig.app.json --noEmit` jsou **předexistující chyby na main** (sales-leads, MysteryPurchaseResult, replaceAll) — dokumentované, **nesouvisejí** s poslední změnou a Vite build (`"build": "vite build"`) je nespouští.
- 4 změněné soubory (`src/hooks/useApplyPendingPartnerRef.ts`, `src/pages/Register.tsx`, `src/App.tsx`, `src/pages/PartnerEshopLanding.tsx`) jsou syntakticky v pořádku; asset `src/assets/logo-onemil.png` existuje; diff App.tsx/Register.tsx obsahuje pouze požadované přírůstky.
- **Konkrétní příčina „Build unsuccessful" zatím není potvrzena** — build log (Lovable/Vercel) nemám k dispozici. Prvním krokem je získat přesnou chybu, ne hádat.

## Plán

1. **Zachytit přesnou chybu buildu** — spustit lokálně `npm run build` (vite build) a přečíst skutečný výstup. Pokud lokálně projde, požádat Pavla o text chyby z Vercel/Lovable logu (je možné, že jde o chybu mimo repozitář — paměť, env, timeout).
2. **Opravit pouze minimální rozsah nutný k zelenému buildu.** Priorita: změny pouze ve 4 uvedených souborech. Pokud by chyba vyžadovala zásah mimo ně, zastavit se a nejdřív napsat Pavlovi proč.
3. **Ověření:** `npx tsc -p tsconfig.app.json --noEmit` (nesmí přibýt žádná nová chyba oproti 18 existujícím) + `npm run build` musí projít.
4. **Funkční kontrola:** v preview ověřit `/pro-eshopy` (rendering, CTA na `/partner/register` vč. `?via=`) a `/partner/register`.
5. Nic nepublikovat, žádné změny Supabase/migrací/Edge Functions, `/partnerstvi` beze změny, `SHOW_PARTNER_15MC_CARD = false` zůstává.

## Technické poznámky

- Vite build nespouští `tsc`, takže existující TS chyby build neshazují.
- Možní kandidáti na příčinu (k ověření až z logu): chybějící import, Rollup chyba, nebo hostingová chyba mimo repo (Vercel limit). Bez logu se k příčině nehlásím.
