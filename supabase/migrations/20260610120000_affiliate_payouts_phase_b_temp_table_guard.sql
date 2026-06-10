-- Phase B staging safety patch:
-- make create_affiliate_payout_batch safe for repeated calls in one SQL transaction.

DO $$
DECLARE
  v_function_definition text;
  v_patched_definition text;
BEGIN
  SELECT pg_get_functiondef('public.create_affiliate_payout_batch(uuid[])'::regprocedure)
  INTO v_function_definition;

  IF v_function_definition IS NULL THEN
    RAISE EXCEPTION 'public.create_affiliate_payout_batch(uuid[]) does not exist';
  END IF;

  IF position('DROP TABLE IF EXISTS pg_temp.tmp_affiliate_payout_batch_selection;' IN v_function_definition) > 0 THEN
    RETURN;
  END IF;

  v_patched_definition := replace(
    v_function_definition,
    E'\n  CREATE TEMP TABLE tmp_affiliate_payout_batch_selection (',
    E'\n  DROP TABLE IF EXISTS pg_temp.tmp_affiliate_payout_batch_selection;\n\n  CREATE TEMP TABLE tmp_affiliate_payout_batch_selection ('
  );

  IF v_patched_definition = v_function_definition THEN
    RAISE EXCEPTION 'Could not patch public.create_affiliate_payout_batch(uuid[]): CREATE TEMP TABLE anchor not found';
  END IF;

  EXECUTE v_patched_definition;
END $$;

REVOKE ALL ON FUNCTION public.create_affiliate_payout_batch(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_affiliate_payout_batch(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.create_affiliate_payout_batch(uuid[]) IS
  'Faze B: admin-only vytvoreni payout davky z ready_to_pay provizi. Temp table guard applied. Bez PDF, e-mailu a bank exportu.';
