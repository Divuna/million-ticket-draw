-- =============================================================================
-- Customer MioCoin code redemption
--
-- redeem_miocoin_code(p_code text) RETURNS jsonb
--
-- Self-service: a logged-in customer enters a MioCoin reward code and the coins
-- are credited atomically to their wallet.
--
-- Crediting flow:
--   1. lock partner_reward_codes row (FOR UPDATE) — prevents double-spend
--   2. validate code (status / expiry / email restriction)
--   3. ensure wallet exists, credit wallets.balance_coins
--   4. write wallet_transactions ledger row (SECURITY DEFINER bypasses RLS)
--   5. mark code activated — this fires trg_log_partner_coin_activation_reward
--      which auto-inserts partner_coin_activations (partner billing). DO NOT
--      insert that row here.
--
-- Returns: { success:true, coins, new_balance }  on success
--          { success:false, error:'<code>' }     on any handled rejection
-- =============================================================================

CREATE OR REPLACE FUNCTION public.redeem_miocoin_code(p_code text)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_email       text;
  v_code        text := upper(trim(coalesce(p_code, '')));
  v_row         public.partner_reward_codes%rowtype;
  v_restrict    citext;
  v_wallet_id   uuid;
  v_new_balance numeric;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_logged_in');
  END IF;

  IF v_code = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;

  -- Exact code lookup + row lock (PK is `code`). Match case-insensitively by
  -- comparing the upper-cased input against the upper-cased stored code.
  SELECT * INTO v_row
  FROM public.partner_reward_codes
  WHERE upper(code) = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;

  -- Status / lifecycle guards
  IF v_row.status = 'activated' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_used');
  ELSIF v_row.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'cancelled');
  ELSIF v_row.status = 'expired' THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  ELSIF v_row.status <> 'issued' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;

  IF v_row.expired_at IS NOT NULL AND v_row.expired_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;

  -- Email restriction: if the code is bound to an email it must match the
  -- logged-in user's auth email.
  v_restrict := coalesce(v_row.issued_to_email, v_row.customer_email);
  IF v_restrict IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    IF v_email IS NULL OR v_restrict <> v_email::citext THEN
      RETURN jsonb_build_object('success', false, 'error', 'email_mismatch');
    END IF;
  END IF;

  -- Ensure wallet and credit
  PERFORM public.ensure_wallet_exists(v_uid);

  UPDATE public.wallets
  SET balance_coins = balance_coins + v_row.coins
  WHERE user_id = v_uid
  RETURNING id, balance_coins INTO v_wallet_id, v_new_balance;

  -- Append-only ledger entry (reference_id left NULL — code PK is text, not uuid)
  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) VALUES (
    v_uid,
    v_wallet_id,
    v_row.coins,
    v_new_balance,
    'miocoin_code_credit',
    'redeem_miocoin_code',
    NULL,
    jsonb_build_object('code', v_row.code, 'partner_id', v_row.partner_id)
  );

  -- Mark code activated — trigger trg_log_partner_coin_activation_reward
  -- auto-inserts partner_coin_activations from this UPDATE.
  UPDATE public.partner_reward_codes
  SET status = 'activated',
      activated_at = now(),
      activated_by_user_id = v_uid
  WHERE code = v_row.code;

  RETURN jsonb_build_object(
    'success', true,
    'coins', v_row.coins,
    'new_balance', v_new_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_miocoin_code(text) TO authenticated;
