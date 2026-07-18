-- Restrict wallet mutation RPCs to trusted server-side execution only.
--
-- Security context:
-- - public.try_credit_wallet_mc(uuid,numeric) is SECURITY DEFINER and credits
--   arbitrary wallets.
-- - public.deduct_wallet_for_refund(uuid,numeric) is SECURITY DEFINER and
--   deducts arbitrary wallets.
-- - public.try_credit_wallet_mc has additional overloads that can create or
--   credit wallets and were also publicly executable through PUBLIC grants.
--
-- Legitimate callers:
-- - stripe-refund Edge Function calls deduct_wallet_for_refund using the
--   SUPABASE_SERVICE_ROLE_KEY.
-- - postgres-owned SECURITY DEFINER referral/payment-status functions call
--   try_credit_wallet_mc internally.
--
-- Do not expose any of these functions directly through PostgREST RPC to anon
-- or ordinary authenticated users.

ALTER FUNCTION public.try_credit_wallet_mc(uuid) SET search_path TO public;
ALTER FUNCTION public.try_credit_wallet_mc(uuid, numeric) SET search_path TO public;
ALTER FUNCTION public.try_credit_wallet_mc(uuid, numeric, text) SET search_path TO public;
ALTER FUNCTION public.deduct_wallet_for_refund(uuid, numeric) SET search_path TO public;

REVOKE ALL ON FUNCTION public.try_credit_wallet_mc(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.try_credit_wallet_mc(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.try_credit_wallet_mc(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.try_credit_wallet_mc(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.try_credit_wallet_mc(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.try_credit_wallet_mc(uuid, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.try_credit_wallet_mc(uuid, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.try_credit_wallet_mc(uuid, numeric) TO service_role;

REVOKE ALL ON FUNCTION public.try_credit_wallet_mc(uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.try_credit_wallet_mc(uuid, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.try_credit_wallet_mc(uuid, numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.try_credit_wallet_mc(uuid, numeric, text) TO service_role;

REVOKE ALL ON FUNCTION public.deduct_wallet_for_refund(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_wallet_for_refund(uuid, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.deduct_wallet_for_refund(uuid, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_wallet_for_refund(uuid, numeric) TO service_role;
