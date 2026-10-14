-- Customer MioCoin history
--
-- A single, read-only projection for the authenticated customer. The canonical
-- wallet ledger remains public.wallet_transactions; partner_coin_activations and
-- partner_reward_codes only enrich a code-credit row with its already-recorded
-- partner and order context. bonus_transfer_history is included because it is
-- the existing source of main-wallet credits created by transfer_bonus_to_main.
--
-- SECURITY DEFINER is necessary because customers may select only their wallet
-- ledger rows through RLS, while partner reward tables are partner/admin scoped.
-- The function has no user-id argument and filters EVERY source by auth.uid(),
-- so a customer can never request another customer's history.

CREATE OR REPLACE FUNCTION public.get_my_miocoin_history(p_limit integer DEFAULT 50)
RETURNS TABLE (
  entry_id text,
  occurred_at timestamptz,
  amount numeric,
  entry_type text,
  entry_source text,
  partner_name text,
  partner_website_url text,
  external_order_id text,
  entry_metadata jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH requested_limit AS (
    SELECT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100) AS value
  ),
  wallet_entries AS (
    SELECT
      'wallet:' || wt.id::text AS entry_id,
      wt.created_at AS occurred_at,
      wt.amount,
      wt.type AS entry_type,
      wt.source AS entry_source,
      partner.name AS partner_name,
      partner.website_url AS partner_website_url,
      COALESCE(activation.external_order_id, reward_code.external_order_id) AS external_order_id,
      wt.metadata AS entry_metadata
    FROM public.wallet_transactions AS wt
    LEFT JOIN public.partner_coin_activations AS activation
      ON wt.type = 'miocoin_code_credit'
      AND wt.source = 'redeem_miocoin_code'
      AND activation.user_id = wt.user_id
      AND activation.code = wt.metadata ->> 'code'
      AND activation.coins = wt.amount
    LEFT JOIN public.partner_reward_codes AS reward_code
      ON wt.type = 'miocoin_code_credit'
      AND wt.source = 'redeem_miocoin_code'
      AND reward_code.activated_by_user_id = wt.user_id
      AND reward_code.code = wt.metadata ->> 'code'
    LEFT JOIN public.partners AS partner
      ON partner.id = COALESCE(activation.partner_id, reward_code.partner_id)
    WHERE wt.user_id = auth.uid()
  ),
  bonus_transfer_entries AS (
    SELECT
      'bonus-transfer:' || transfer.id::text AS entry_id,
      transfer.created_at AS occurred_at,
      transfer.amount,
      'bonus_transfer_to_main'::text AS entry_type,
      'bonus_transfer_history'::text AS entry_source,
      NULL::text AS partner_name,
      NULL::text AS partner_website_url,
      NULL::text AS external_order_id,
      NULL::jsonb AS entry_metadata
    FROM public.bonus_transfer_history AS transfer
    WHERE transfer.user_id = auth.uid()
  )
  SELECT
    entry_id,
    occurred_at,
    amount,
    entry_type,
    entry_source,
    partner_name,
    partner_website_url,
    external_order_id,
    entry_metadata
  FROM (
    SELECT * FROM wallet_entries
    UNION ALL
    SELECT * FROM bonus_transfer_entries
  ) AS entries
  ORDER BY occurred_at DESC, entry_id DESC
  LIMIT (SELECT value FROM requested_limit);
$$;

REVOKE ALL ON FUNCTION public.get_my_miocoin_history(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_miocoin_history(integer) TO authenticated;

COMMENT ON FUNCTION public.get_my_miocoin_history(integer) IS
  'Read-only MioCoin history for auth.uid(); enriches the wallet ledger with verified partner reward context.';
