-- Security hardening for high-risk payment/wallet RPCs.
--
-- Confirmed issues:
-- 1) public.unlock_ticket(contest_id uuid, user_id uuid) was a legacy
--    SECURITY DEFINER ticket-purchase path executable by PUBLIC/anon/authenticated.
--    It accepts an arbitrary user_id and mutates wallets/tickets/winners/contests
--    without binding the request to auth.uid(). The live app uses
--    public.buy_ticket_atomic(...) instead, so ordinary users must not be able
--    to call this legacy path directly.
-- 2) public.ensure_wallet_exists(p_user_id uuid) was executable by PUBLIC/anon
--    and authenticated without verifying p_user_id belongs to auth.uid().
--    It creates wallet rows, so authenticated clients must be self-scoped while
--    trusted server/service-role callers remain supported.

CREATE OR REPLACE FUNCTION public.ensure_wallet_exists(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required';
  END IF;

  IF COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO public.wallets (user_id, balance_coins, bonus_balance_coins, created_at)
  VALUES (p_user_id, 0, 0, now())
  ON CONFLICT (user_id) DO NOTHING;
END;
$function$;

ALTER FUNCTION public.ensure_wallet_exists(uuid) SET search_path TO public;
REVOKE ALL ON FUNCTION public.ensure_wallet_exists(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_wallet_exists(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_wallet_exists(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_wallet_exists(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_wallet_exists(uuid) TO service_role;

ALTER FUNCTION public.unlock_ticket(uuid, uuid) SET search_path TO public;
REVOKE ALL ON FUNCTION public.unlock_ticket(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unlock_ticket(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.unlock_ticket(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_ticket(uuid, uuid) TO service_role;
