BEGIN;

-- Odstranění zastaralého přetížení `public.sales_lead_propose`.
--
-- Proč: migrace 20260807120000 přidala do funkce parametr `p_contact_email`
-- přes CREATE OR REPLACE. Postgres tím ale nevytvořil náhradu, nýbrž DRUHÉ
-- přetížení — starší 10argumentová verze zůstala vedle nové 11argumentové.
-- Discovery worker volá funkci přes PostgREST s deseti pojmenovanými argumenty,
-- takže na obě varianty sedí stejně dobře a PostgREST vrátí `PGRST203`
-- (Could not choose the best candidate function). Každá ověřená firma BEZ
-- nalezeného e-mailu se tím tiše ztratila — přesně to zachytil nový čítač
-- `funnel.rpc_error_code = {"PGRST203": 1}` na stagingovém jobu b3979554.
--
-- Ponechává se novější 11argumentová verze, protože obsahuje přísnější
-- deduplikaci (shodný contact_email, do_not_contact, přesná e-mailová
-- suppression, archivované leady). Žádná kontrola se neoslabuje.
--
-- Guard: starou verzi smaže jen tehdy, když nová opravdu existuje. Na projektu,
-- kde je 10argumentová verze jediná (např. produkce před migrací 20260807120000),
-- je migrace no-op a nic se nesmaže.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sales_lead_propose' AND p.pronargs = 11
  ) AND EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sales_lead_propose' AND p.pronargs = 10
  ) THEN
    DROP FUNCTION public.sales_lead_propose(
      uuid, text, text, text, smallint, jsonb, text, text, text, text
    );
  END IF;
END $$;

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'sales_lead_propose';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'sales_lead_propose musi mit prave jedno pretizeni, nalezeno %', v_count;
  END IF;
END $$;

-- Oprávnění: migrace 20260807120000 vytvořila nové přetížení bez REVOKE, takže
-- zdědilo výchozí PUBLIC EXECUTE — anon mohl volat SECURITY DEFINER funkci,
-- která zakládá leady. Sjednocuje se se vzorem z 20260704140000: jen service_role.
--
-- Guard: na projektu bez 11argumentové verze (migrace 20260807120000 tam ještě
-- neproběhla) by REVOKE/GRANT na neexistující signaturu celou migraci shodil.
-- Oprávnění 10argumentové verze řeší už 20260704140000, takže tady je no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sales_lead_propose' AND p.pronargs = 11
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.sales_lead_propose('
         || 'uuid, text, text, text, smallint, jsonb, text, text, text, text, text'
         || ') FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.sales_lead_propose('
         || 'uuid, text, text, text, smallint, jsonb, text, text, text, text, text'
         || ') TO service_role';
  END IF;
END $$;

COMMIT;
