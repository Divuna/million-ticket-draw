-- Security hardening for remaining finance-adjacent RPC entry points.
--
-- This migration intentionally changes only EXECUTE grants and search_path.
-- It does not rewrite payment, wallet, voucher, ticket, Stripe, refund, or
-- partner activation business logic.

-- Legacy direct partner reward-code creation allowed approved partners to
-- choose an arbitrary p_coins value. Current supported partner issuance goes
-- through service-role Edge Functions and create_partner_order_reward(), where
-- coins are derived server-side from the partner order.
DO $$
BEGIN
  IF to_regprocedure('public.generate_partner_reward_code(uuid, integer, text, citext, jsonb)') IS NOT NULL THEN
    ALTER FUNCTION public.generate_partner_reward_code(uuid, integer, text, citext, jsonb)
      SET search_path TO public, extensions, pg_temp;
    REVOKE ALL ON FUNCTION public.generate_partner_reward_code(uuid, integer, text, citext, jsonb) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.generate_partner_reward_code(uuid, integer, text, citext, jsonb) FROM anon;
    REVOKE ALL ON FUNCTION public.generate_partner_reward_code(uuid, integer, text, citext, jsonb) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.generate_partner_reward_code(uuid, integer, text, citext, jsonb) TO service_role;

    COMMENT ON FUNCTION public.generate_partner_reward_code(uuid, integer, text, citext, jsonb)
      IS 'Legacy partner reward-code helper restricted to service_role only; public partner issuance must use service-side create_partner_order_reward.';
  END IF;
END $$;

-- Affiliate commission recalculation mutates calculated commission rows.
-- Keep the authenticated admin UI path and internal cron/service-role use, but
-- remove unauthenticated direct RPC execution.
ALTER FUNCTION public.calculate_affiliate_commissions_for_month(date)
  SET search_path TO '';
REVOKE ALL ON FUNCTION public.calculate_affiliate_commissions_for_month(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calculate_affiliate_commissions_for_month(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.calculate_affiliate_commissions_for_month(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_affiliate_commissions_for_month(date) TO service_role;

COMMENT ON FUNCTION public.calculate_affiliate_commissions_for_month(date)
  IS 'Recalculates affiliate commissions for one month; executable only by authenticated admin-guarded callers and service_role.';
