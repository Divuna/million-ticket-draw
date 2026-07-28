-- Legacy contest-inspection RPCs expose exact or derived future winning
-- positions. They are strictly internal and must never inherit PostgreSQL's
-- default EXECUTE privilege from PUBLIC.

REVOKE ALL ON FUNCTION public.get_contests_json() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_contests_json() FROM anon;
REVOKE ALL ON FUNCTION public.get_contests_json() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_contests_json() TO service_role;

REVOKE ALL ON FUNCTION public.get_contest_bonus_stats(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_contest_bonus_stats(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_contest_bonus_stats(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_contest_bonus_stats(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_contest_bonus_stats_enhanced(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_contest_bonus_stats_enhanced(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_contest_bonus_stats_enhanced(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_contest_bonus_stats_enhanced(uuid) TO service_role;

-- The only browser caller is the superadmin contest view. Keep that workflow
-- on a separate guarded endpoint, rather than granting customers access to the
-- legacy RPC merely because superadmins also use the authenticated DB role.
CREATE OR REPLACE FUNCTION public.get_contests_json_internal_superadmin()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.is_superadmin(auth.uid())
  THEN
    RAISE EXCEPTION 'Superadmin required'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.get_contests_json();
END;
$function$;

REVOKE ALL ON FUNCTION public.get_contests_json_internal_superadmin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_contests_json_internal_superadmin() FROM anon;
REVOKE ALL ON FUNCTION public.get_contests_json_internal_superadmin() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_contests_json_internal_superadmin() TO authenticated;

COMMENT ON FUNCTION public.get_contests_json()
IS 'Service-role-only legacy contest inspection including internal future winning positions.';

COMMENT ON FUNCTION public.get_contest_bonus_stats(uuid)
IS 'Service-role-only aggregate derived from internal bonus winning positions.';

COMMENT ON FUNCTION public.get_contest_bonus_stats_enhanced(uuid)
IS 'Service-role-only inspection including exact internal bonus winning positions.';

COMMENT ON FUNCTION public.buy_ticket_atomic(uuid, uuid)
IS 'Service-role-only atomic classic purchase implementation; customer clients use buy_ticket_public.';

COMMENT ON FUNCTION public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid)
IS 'Service-role-only atomic mystery purchase implementation; customer clients use purchase_guaranteed_benefit_bundle_public.';

COMMENT ON FUNCTION public.get_contests_json_internal_superadmin()
IS 'Guarded superadmin browser access to internal contest inspection data.';

-- Atomic purchase implementations return internal ticket allocation state.
-- Customer clients use the sanitized *_public wrappers introduced by the
-- preceding privacy migration; only backend callers may execute the internals.
REVOKE ALL ON FUNCTION public.buy_ticket_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.buy_ticket_atomic(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.buy_ticket_atomic(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.buy_ticket_atomic(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid) TO service_role;
