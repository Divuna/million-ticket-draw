-- MioCoin one-decimal rule — follow-up 1/2: remove the legacy second reward engine.
--
-- WHAT IS REMOVED
--   public.api_activate_partner_coins(text, uuid, text, integer)      — thin wrapper
--   public.activate_partner_coins_from_order(uuid, uuid, text, numeric) — the bypass
--
-- WHY
--   activate_partner_coins_from_order read partners.reward_base_czk / reward_mc and
--   computed the reward ITSELF:
--       ROUND((p_order_amount_czk / v_reward_base_czk) * v_reward_mc, 1)
--   then inserted straight into partner_coin_activations. That is a second partner
--   reward engine, which the confirmed invariant forbids — the only place a partner
--   MioCoin reward may be derived is public.compute_partner_reward(...).
--
--   It is being DROPPED rather than rewired because a rewire would mean keeping a
--   parallel issuance path alive for no consumer. compute_partner_reward operates on
--   an order (total + optional items) and the supported activation flow is
--   create_partner_order_reward -> partner_reward_codes -> customer redemption ->
--   log_partner_coin_activation_from_reward -> partner_coin_activations. Pointing the
--   legacy function at the engine would still bypass code issuance, the 0.5 MC floor
--   and the reward-mode logic, i.e. it would remain a second way to bill a partner.
--
-- SECONDARY BENEFIT (not the reason, but worth recording)
--   Both functions had EXECUTE granted to PUBLIC/anon/authenticated, and the wrapper
--   was SECURITY DEFINER — so anyone holding a partner API key could insert billable
--   partner_coin_activations rows while bypassing RLS. Dropping them closes that.
--
-- READ-ONLY DEPENDENCY AUDIT (production xkzhjldrojjlrkezorey, 16. 08. 2026)
--   * SQL: only api_activate_partner_coins references the bypass; nothing references
--     api_activate_partner_coins in turn.
--   * Triggers referencing either function .................... 0
--   * Views / materialized views ............................... 0
--   * RLS policies (USING / WITH CHECK) ........................ 0
--   * Column defaults .......................................... 0
--   * pg_cron jobs ............................................. 0
--   * Repo (frontend, Edge Functions, importers, scripts) ...... 0
--     (only src/integrations/supabase/types.ts, which is generated output)
--   * partner_coin_activations rows produced by this path ...... 0
--     All 4 existing activations carry a `code`, i.e. they came from
--     log_partner_coin_activation_from_reward. The legacy path never sets `code`.
--
-- NOT CHANGED: multi-shop idempotency, compute_partner_reward,
-- create_partner_order_reward, partner_coin_activations data, invoicing.
--
-- Rollback: restore both function bodies from this migration's git history
--   (definitions captured in onemil_history.md, 16. 08. 2026).

begin;

-- Guard: refuse to run if a caller appeared after the audit above. Better to fail
-- the migration loudly than to drop a function something started depending on.
DO $$
DECLARE
  v_callers text;
BEGIN
  SELECT string_agg(p.proname, ', ')
    INTO v_callers
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND p.prosrc ILIKE '%activate_partner_coins_from_order%'
    AND p.proname NOT IN ('activate_partner_coins_from_order', 'api_activate_partner_coins');

  IF v_callers IS NOT NULL THEN
    RAISE EXCEPTION
      'Aborting: unexpected caller(s) of activate_partner_coins_from_order: %', v_callers;
  END IF;
END $$;

-- Wrapper first, then the leaf.
DROP FUNCTION IF EXISTS public.api_activate_partner_coins(text, uuid, text, integer);
DROP FUNCTION IF EXISTS public.activate_partner_coins_from_order(uuid, uuid, text, numeric);

commit;
