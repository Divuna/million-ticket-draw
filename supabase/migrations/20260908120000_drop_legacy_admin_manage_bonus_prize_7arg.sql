-- admin_manage_bonus_prize: odstranění staré 7-arg overload signatury.
--
-- POTVRZENÝ PROBLÉM (read-only audit)
-- Produkce i staging měly dvě `admin_manage_bonus_prize` overload signatury:
--   - 7-arg: (uuid,uuid,text,integer,numeric,text,text) — bez p_image_url a
--     p_detailed_description
--   - 9-arg: (uuid,uuid,text,integer,numeric,text,text,text,text) — canonical,
--     navíc má p_image_url a p_detailed_description
-- Historicky vznikla duplicita tak, že migrace
-- `20260415_fix_admin_manage_bonus_prize_image_url.sql` a
-- `20260415_fix_admin_manage_bonus_prize_detailed_description.sql` použily
-- `CREATE OR REPLACE FUNCTION` s ROZŠÍŘENÝM parametrickým seznamem — Postgres
-- ale `CREATE OR REPLACE` nahradí funkci jen při IDENTICKÉ signatuře; jiný
-- počet/typ parametrů založí novou overload vedle staré. `ContestDetailAdmin.tsx`
-- proto donedávna posílal jen parametry sdílené oběma signaturami, což
-- PostgREST/Postgres vyhodnocovalo jako genuinely nejednoznačné volání
-- (`42725: function ... is not unique`) — opraveno na frontendu v PR #416
-- (explicitní `p_image_url`/`p_detailed_description`).
--
-- AUDIT PŘED TOUTO MIGRACÍ (žádný živý volající 7-arg nenalezen)
-- - Frontend: `AdminContestManagement.tsx` i (po PR #416) `ContestDetailAdmin.tsx`
--   posílají named args, které existují VÝHRADNĚ na 9-arg signatuře
--   (`p_image_url`, `p_detailed_description`) — obě volání jsou tedy
--   strukturálně neschopná trefit 7-arg.
-- - Edge Functions: žádná nevolá `admin_manage_bonus_prize`.
-- - Aktuální migrace: žádná nezávisí na trvající existenci 7-arg; poslední
--   (`20260908110000_bonus_prizes_canonical_superadmin_rls.sql`) upravuje OBĚ
--   signatury jen `CREATE OR REPLACE` a nepředpokládá, že 7-arg musí zůstat.
-- - `docs/rollback/phase1_production_rollback.sql` (historický, mimo rozsah
--   této migrace, NEUPRAVUJE se) má guardovaný fallback, který 7-arg overload
--   podmíněně obnovuje, POKUD existuje; smyčka `FOR r IN ... WHERE ... args = '...'`
--   s nula shodami je no-op (žádná `RAISE EXCEPTION`) — po odstranění 7-arg
--   tento rollback skript nadále bezpečně doběhne, jen už nemá co obnovovat.
-- - `docs/rollback/phase1_production_apply.sql` a `_verification.sql` iterují
--   podle NÁZVU funkce (`p.proname = 'admin_manage_bonus_prize'`), ne podle
--   konkrétní signatury — přizpůsobí se počtu existujících overloadů automaticky.
--
-- ŘEŠENÍ
-- Odstranit VÝHRADNĚ přesnou starou 7-arg signaturu. 9-arg (canonical) zůstává
-- zcela beze změny — žádný CREATE OR REPLACE, žádná úprava těla ani grantů.
--
-- MIMO ROZSAH TÉTO MIGRACE (vědomě nedotčeno):
-- - Tělo 9-arg RPC, bonus_prizes RLS, Edge Functions, business logika
--   bonusových výher, MioCoin logika, ticket engine, winners, soutěžní
--   logika, Sofinity.
-- - Historické migrace (20250921025951, 20250921145952, oba 20260415 soubory)
--   se nemění a nemažou — zůstávají jako historický záznam.
-- - `docs/rollback/phase1_*.sql` se nemění — jsou to historické rollback
--   dokumenty popsané výše.

BEGIN;

DROP FUNCTION public.admin_manage_bonus_prize(
  uuid,
  uuid,
  text,
  integer,
  numeric,
  text,
  text
);

COMMIT;
