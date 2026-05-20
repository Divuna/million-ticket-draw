## Problém

V admin přehledu soutěží (sloupec **„BONUSOVÉ MIOCOINY"**) ukazuje u řady soutěží **0 MC**, přestože v `bonus_prizes` reálně existují tisíce vygenerovaných MioCoin pozic.

Konkrétní příklady z DB:
- `Corvette c8` (`1abf28cd…`) — v `bonus_prizes` je **83 000** MioCoin řádků (SUM = 83 000), ale `contests.total_miocoin_bonus = 0`.
- `Corvette c8` (`f3748342…`) — **94 500** MioCoin řádků, ale `contests.total_miocoin_bonus = 0`.

## Root cause

1. Admin UI (`AdminContestManagement.tsx`, řádek 3712) zobrazuje sloupec přímo z `contests.total_miocoin_bonus`, nikoli z reálného součtu v `bonus_prizes`.
2. V kódu je komentář:
   > `total_miocoin_bonus is maintained by DB trigger trg_sync_total_miocoin_bonus`
   ale tento trigger v produkční DB **neexistuje**. V `pg_trigger` jsou pouze `trg_generate_miocoin_on_contest_insert` (volá legacy Edge Function `distribute-bonus-prizes`) a `trg_bonus_to_wallet` na `winners`.
3. `total_miocoin_bonus` se proto aktualizuje **jen** v jedné cestě — uvnitř RPC `admin_bulk_insert_miocoin_bonuses` (PR #63). Když MioCoiny vznikají jinak (např. asynchronně přes `trg_generate_miocoin_on_contest_insert` → `distribute-bonus-prizes`), sloupec zůstává na hodnotě, se kterou byla soutěž vložena (typicky 0, protože `admin_manage_contest` ho v INSERT nevyplňuje).
4. Důsledek: data v `bonus_prizes` jsou správně, ale agregovaný sloupec na soutěži, který admin UI zobrazuje, je zastaralý / nulový → admin „nevidí" vygenerované MioCoiny.

## Návrh řešení

Dvě části, obě **bez** změny ticket/contest/wallet logiky, bez změny `buy_ticket_atomic`, bez změny Partner Offers, bez změny RLS.

### A) Frontend (`src/components/AdminContestManagement.tsx`) — preferovaná oprava UI

V loaderu (`fetchContests`, kolem řádků 2985–3069) k seznamu soutěží dopočítat reálný součet MioCoin bonusů z `bonus_prizes` a v UI ho použít místo zastaralého `contests.total_miocoin_bonus`:

- Po načtení seznamu soutěží spustit dotaz typu:
  `select contest_id, sum(amount) from bonus_prizes where contest_id in (...) and amount > 0 group by contest_id`
- V state si držet mapu `contestId → realMioCoinSum`.
- Na řádku 3712 vykreslit tento dopočítaný součet (s fallbackem na `contest.total_miocoin_bonus` jen pokud mapa nemá záznam).
- Stejné pravidlo aplikovat i v summary kartě **„Bonusové MioCoiny"** nad tabulkou, pokud čte stejnou hodnotu.

Tím admin uvidí skutečné MioCoiny bez ohledu na to, jakou cestou vznikly. Žádná změna DB.

### B) (Volitelně, jen na schválení) DB sync trigger

Pokud chceme dlouhodobě udržet `contests.total_miocoin_bonus` v synchronu i pro budoucí cesty zápisu (mimo `admin_bulk_insert_miocoin_bonuses`), přidat AFTER INSERT/UPDATE/DELETE trigger na `bonus_prizes`, který přepočítá `SUM(amount) FILTER (WHERE amount > 0)` do `contests.total_miocoin_bonus` pro dotčené `contest_id`.

**Tato část se neimplementuje bez výslovného schválení** — `CLAUDE.md` zakazuje DB/RLS změny bez instrukce. Lze jen navrhnout migraci do `supabase/migrations/` k pozdějšímu manuálnímu spuštění v SQL Editoru.

## Co se NEbude měnit

- `buy_ticket_atomic`, `admin_bulk_insert_miocoin_bonuses`, `admin_manage_contest`
- `distribute-bonus-prizes` Edge Function a její trigger
- Schéma `bonus_prizes` / `contests`
- RLS policies
- Žádné mazání / přepis existujících `bonus_prizes` ani „backfill" `total_miocoin_bonus` v rámci tohoto fixu (lze udělat samostatně pod schválením)

## Rozsah změn

- 1 soubor: `src/components/AdminContestManagement.tsx` (loader + render bonusového sloupce)
- Žádné migrace, žádné Edge Functions, žádné testy nutné měnit
- Build a existující Playwright suite zůstávají platné

## Otázka k potvrzení

Mám pokračovat pouze s částí **A (frontend dopočet)**, nebo zároveň připravit i migraci pro část **B (DB sync trigger)** k manuálnímu nasazení?
