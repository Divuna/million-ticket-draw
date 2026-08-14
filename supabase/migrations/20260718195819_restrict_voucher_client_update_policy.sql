-- Restrict direct customer writes to voucher definitions.
--
-- Confirmed issue:
-- The legacy policy "Users can claim unassigned vouchers" allowed any
-- authenticated user to UPDATE public.vouchers rows where user_id IS NULL.
-- Because the policy did not restrict updated columns, a normal customer could
-- alter public voucher metadata/availability through the REST API. Current
-- purchases and favorites use public.user_vouchers + public.buy_voucher_atomic,
-- so direct customer UPDATE on public.vouchers is no longer a legitimate path.
--
-- Safe behavior preserved:
-- * Admin/superadmin voucher management policies are unchanged.
-- * Public voucher SELECT policies are unchanged.
-- * Favorites remain direct INSERT/DELETE on public.user_vouchers.
-- * Voucher purchases still go through public.buy_voucher_atomic, which issues
--   a voucher_code, deducts MioCoins and writes wallet_transactions atomically.

DROP POLICY IF EXISTS "Users can claim unassigned vouchers" ON public.vouchers;

-- Restrict legacy production admin-test helpers that mutate voucher rows.
--
-- These helpers are useful for explicit admin validation, but the production
-- functions were SECURITY DEFINER and still executable by PUBLIC/anon. Keep the
-- existing implementation as internal helpers and expose guarded wrappers under
-- the original RPC names.

ALTER FUNCTION public.setup_crud_test_data(text)
RENAME TO setup_crud_test_data_internal_20260718195819;

ALTER FUNCTION public.test_admin_crud_operations()
RENAME TO test_admin_crud_operations_internal_20260718195819;

ALTER FUNCTION public.run_complete_admin_test_suite()
RENAME TO run_complete_admin_test_suite_internal_20260718195819;

CREATE OR REPLACE FUNCTION public.assert_admin_validation_rpc_allowed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.setup_crud_test_data(p_user_email text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM public.assert_admin_validation_rpc_allowed();
  RETURN public.setup_crud_test_data_internal_20260718195819(p_user_email);
END;
$$;

CREATE OR REPLACE FUNCTION public.test_admin_crud_operations()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM public.assert_admin_validation_rpc_allowed();
  RETURN public.test_admin_crud_operations_internal_20260718195819();
END;
$$;

CREATE OR REPLACE FUNCTION public.run_complete_admin_test_suite()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM public.assert_admin_validation_rpc_allowed();
  RETURN public.run_complete_admin_test_suite_internal_20260718195819();
END;
$$;

REVOKE ALL ON FUNCTION public.assert_admin_validation_rpc_allowed() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_admin_validation_rpc_allowed() FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_admin_validation_rpc_allowed() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_admin_validation_rpc_allowed() TO service_role;

REVOKE ALL ON FUNCTION public.setup_crud_test_data_internal_20260718195819(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.setup_crud_test_data_internal_20260718195819(text) FROM anon;
REVOKE ALL ON FUNCTION public.setup_crud_test_data_internal_20260718195819(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.setup_crud_test_data_internal_20260718195819(text) TO service_role;

REVOKE ALL ON FUNCTION public.test_admin_crud_operations_internal_20260718195819() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.test_admin_crud_operations_internal_20260718195819() FROM anon;
REVOKE ALL ON FUNCTION public.test_admin_crud_operations_internal_20260718195819() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.test_admin_crud_operations_internal_20260718195819() TO service_role;

REVOKE ALL ON FUNCTION public.run_complete_admin_test_suite_internal_20260718195819() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_complete_admin_test_suite_internal_20260718195819() FROM anon;
REVOKE ALL ON FUNCTION public.run_complete_admin_test_suite_internal_20260718195819() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.run_complete_admin_test_suite_internal_20260718195819() TO service_role;

REVOKE ALL ON FUNCTION public.setup_crud_test_data(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.setup_crud_test_data(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.setup_crud_test_data(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.setup_crud_test_data(text) TO service_role;

REVOKE ALL ON FUNCTION public.test_admin_crud_operations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.test_admin_crud_operations() FROM anon;
GRANT EXECUTE ON FUNCTION public.test_admin_crud_operations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_admin_crud_operations() TO service_role;

REVOKE ALL ON FUNCTION public.run_complete_admin_test_suite() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_complete_admin_test_suite() FROM anon;
GRANT EXECUTE ON FUNCTION public.run_complete_admin_test_suite() TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_complete_admin_test_suite() TO service_role;
