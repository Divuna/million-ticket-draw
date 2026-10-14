-- ============================================================================
-- ROLLBACK — FÁZE 4: bonus 15 MC pro nového zákazníka přišlého přes partnera
--   migrace: supabase/migrations/20260903200954_partner_new_customer_bonus.sql
--
-- Čistě aditivní fáze — dvě nové tabulky, dvě nové funkce, jeden nový
-- sloupec a index na `partners`. Nezasahuje do žádné existující tabulky,
-- funkce ani triggeru. Rollback proto nemá žádné "obnovit původní verzi"
-- riziko (na rozdíl od Fáze 3) — jde jen o čisté odstranění.
--
-- `wallet_transactions` řádky typu 'partner_new_customer_bonus' jsou
-- immutable (fn_wallet_transactions_immutable) a rollback se jich NEDOTÝKÁ —
-- zůstávají navždy jako historický ledger záznam, přesně jako u každého
-- jiného typu transakce. To je záměr, ne chyba rollbacku.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.record_partner_customer_ref(uuid);
DROP FUNCTION IF EXISTS public.record_pending_partner_attribution_intent(text, uuid);

DROP TABLE IF EXISTS public.partner_customer_refs;
DROP TABLE IF EXISTS public.partner_pending_attributions;

DROP INDEX IF EXISTS public.idx_partners_public_ref_code;
ALTER TABLE public.partners DROP COLUMN IF EXISTS public_ref_code;

COMMIT;

-- ---------------------------------------------------------------------------
-- POSTCHECK (očekáváno: samé 0)
-- ---------------------------------------------------------------------------
-- SELECT
--   (SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
--      AND table_name IN ('partner_customer_refs','partner_pending_attributions'))       AS tables_left,
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--      WHERE n.nspname='public' AND p.proname IN
--      ('record_partner_customer_ref','record_pending_partner_attribution_intent'))      AS fns_left,
--   (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
--      AND table_name='partners' AND column_name='public_ref_code')                      AS column_left,
--   (SELECT count(*) FROM pg_indexes WHERE schemaname='public'
--      AND indexname='idx_partners_public_ref_code')                                     AS index_left;
--
-- POZOR: tento rollback NEMAŽE žádná data v `wallets`/`wallet_transactions` —
-- už připsané bonusy zůstávají zákazníkům na účtu. Storno bonusu (odečtení
-- z peněženky) by byla samostatná, výslovně schválená operace, ne součást
-- tohoto technického rollbacku.
--
-- ---------------------------------------------------------------------------
-- Frontend (samostatný krok, mimo tuto SQL — needituje se odsud)
-- ---------------------------------------------------------------------------
-- Při rollbacku frontendu revertovat/nepublikovat:
--   src/hooks/useApplyPendingPartnerRef.ts   (smazat soubor)
--   src/App.tsx                              (odebrat import + hook wiring,
--                                              2 přidané řádky)
--   src/pages/Register.tsx                   (odebrat ?p=/?c= useEffect blok
--                                              + import PENDING_PARTNER_REF_STORAGE_KEY)
-- Bez SQL rollbacku výše zůstanou tyto RPC volání jen tiše selhávat
-- (function does not exist) — neblokující, protože Register.tsx i hook mají
-- try/catch okolo každého volání.
