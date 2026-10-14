-- F5 group B — internal/diagnostic test RPCs that anon could call.
--
-- These are the project's SQL test-suite functions. They were anon-executable with
-- no guard, and two of them write real tables:
--   test_sofinity_performance(int) -> event_logs, users
--   test_sofinity_edge_cases()     -> event_logs
-- and run_deep_sofinity_test_suite(int) calls BOTH of them, so an anonymous caller
-- could drive production writes through it. Verified on staging: as anon the call
-- reached those writes and only died on a users_id_fkey foreign key violation, not
-- on a permission check.
--
-- The codebase already has the right pattern for this:
-- public.assert_admin_validation_rpc_allowed() — passes for service_role, otherwise
-- requires admin/superadmin — and run_complete_admin_test_suite() /
-- test_admin_crud_operations() already use it. This migration extends the same
-- pattern to the two functions the admin UI actually calls, and revokes the rest.
--
-- Which of these the UI really calls: only four RPC names appear in a .rpc() call
-- anywhere in src/ — get_admin_summary_dashboard (already guarded in F3),
-- run_complete_admin_test_suite (already guarded), run_deep_sofinity_test_suite and
-- validate_sofinity_events. The other test_* names appear in those files only as
-- display labels, not as calls. /admin/tests is superadmin-gated in the UI, but the
-- RPCs themselves were open — that is the hole being closed.
--
--   keep authenticated + add guard : run_deep_sofinity_test_suite, validate_sofinity_events
--   service_role only             : every other test_* / diagnostic helper below
--
-- Revoking authenticated from the inner test_* functions does NOT break
-- run_deep_sofinity_test_suite or run_complete_admin_test_suite: both are SECURITY
-- DEFINER, so their inner calls execute as the owner.
--
-- No test function body is rewritten except for the two guard insertions, and those
-- are injected into each function's own live definition so the rest stays
-- byte-identical.

BEGIN;

-- ── 0. Make sure the guard helper exists ───────────────────────────────────────
-- IMPORTANT: public.assert_admin_validation_rpc_allowed() exists on PRODUCTION but
-- NOT on staging. Verified: staging has run_complete_admin_test_suite() and
-- test_admin_crud_operations() — both of which call it — while the helper itself is
-- missing, so those two were already broken there before this migration. Referencing
-- the helper without creating it made the two functions below fail with
-- 42883 "function public.assert_admin_validation_rpc_allowed() does not exist" for
-- admins too (caught on staging during testing). Creating it idempotently keeps this
-- migration self-sufficient in both environments and repairs that pre-existing drift
-- as a side effect. The definition below is production's, copied verbatim.
CREATE OR REPLACE FUNCTION public.assert_admin_validation_rpc_allowed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'superadmin')
    )
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_admin_validation_rpc_allowed() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_admin_validation_rpc_allowed() FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_admin_validation_rpc_allowed() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_admin_validation_rpc_allowed() TO service_role;

-- ── 1. The two the admin UI calls: guard + drop anon ────────────────────────────
DO $do$
DECLARE
  v_names text[] := ARRAY['run_deep_sofinity_test_suite', 'validate_sofinity_events'];
  v_name  text;
  v_def   text;
  v_new   text;
  v_guard text := chr(10) || 'BEGIN' || chr(10)
                  || '  PERFORM public.assert_admin_validation_rpc_allowed();' || chr(10);
BEGIN
  FOREACH v_name IN ARRAY v_names LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_name;

    IF v_def IS NULL THEN
      RAISE EXCEPTION 'function public.% not found', v_name;
    END IF;

    IF v_def LIKE '%assert_admin_validation_rpc_allowed%' THEN
      RAISE NOTICE 'public.% already guarded - skipping', v_name;
      CONTINUE;
    END IF;

    -- Insert right after the function's own top-level BEGIN (the first line that is
    -- exactly BEGIN). regexp_replace replaces only the first match.
    v_new := regexp_replace(v_def, '\r?\nBEGIN\r?\n', v_guard);

    IF v_new = v_def THEN
      RAISE EXCEPTION 'top-level BEGIN marker not found in public.%', v_name;
    END IF;

    EXECUTE v_new;
  END LOOP;
END
$do$;

REVOKE ALL ON FUNCTION public.run_deep_sofinity_test_suite(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_deep_sofinity_test_suite(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.run_deep_sofinity_test_suite(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.validate_sofinity_events(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_sofinity_events(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_sofinity_events(integer) TO authenticated;

-- ── 2. No UI caller at all: service_role only ───────────────────────────────────
DO $do$
DECLARE
  v_sig text;
BEGIN
  FOR v_sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'test_sofinity_performance',
        'test_sofinity_edge_cases',
        'test_sofinity_integration',
        'test_deep_data_integrity',
        'test_admin_security_rls',
        'test_audit_logging',
        'test_partner_api_key',
        'test_rl',
        'create_test_result',
        'validate_crud_test_data'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
END
$do$;

COMMIT;
