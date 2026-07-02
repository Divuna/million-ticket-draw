# PR #157 — staging E2E update

Datum: 2026-07-02
Repo: `Divuna/million-ticket-draw`
PR: https://github.com/Divuna/million-ticket-draw/pull/157
Merge commit: `64f8914422bb929e519dd1fa4540b5bba80590da`
Full staging E2E run: https://github.com/Divuna/million-ticket-draw/actions/runs/28621893951

## Stav

`Playwright Staging Full E2E` po PR #157 prošel celý zeleně.

Ověřeno:

- job `Full E2E (Chromium) — Staging`: `success`
- krok `Run E2E (full suite nebo cílený spec)`: `success`
- krok `E2E status — OK`: `success`
- failure screenshoty se nenahrávaly, protože nebyly chyby

## Co PR #157 opravilo

- staging seed vytváří reálné `voucher_codes` pro voucher specy 03/10/11
- Spec11 seed propojuje `user_vouchers.voucher_code_id` a nastavuje vydaný kód jako `issued`
- cleanup před testy uvolní staré E2E-issued kódy, aby FK neblokoval mazání
- voucher hooky mají fallback pro staging, kde mohou chybět volitelné textové sloupce voucher detailu
- Playwright voucher selektory jsou upravené na nové full-banner voucher karty přes `img alt`
- detail dialog se hledá konkrétně podle názvu voucheru, aby nevznikal strict-mode konflikt s jiným dialogem

## Dopad na LAUNCH_TODO

Tento záznam aktualizuje význam těchto položek:

- `C14` — Vouchery: ověřeno novým PR #157 a full staging E2E runem `28621893951`
- `CI02` — Full E2E: aktuální zelený full staging E2E run je `28621893951`

Původní `LAUNCH_TODO.md` může zůstat jako historický checklist, ale při dalším ručním úklidu má být `C14` a `CI02` přepsáno na tento novější důkaz.

## Nedotčeno

PR #157 ani tento dokumentační zápis neměnil:

- produkční Supabase data
- peněženky
- platby
- RLS
- soutěžní logiku
- produkční Stripe nastavení
