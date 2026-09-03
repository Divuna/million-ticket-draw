-- Fix MioCoin bonus double-credit.
--
-- Problem:
-- 1) on_bonus_winner_add_to_bonus_wallet() credits bonus_balance_coins when a bonus is won.
-- 2) claim_miocoin_bonus(uuid, uuid) then credited the same amount again to balance_coins
--    without reducing bonus_balance_coins.
-- 3) transfer_bonus_to_main() could later transfer the still-present bonus balance again.
--
-- Fix:
-- claim_miocoin_bonus now performs an atomic transfer of the claimed prize amount
-- from bonus_balance_coins to balance_coins. The same MioCoin value therefore exists
-- in exactly one wallet bucket before and after the claim.
--
-- No existing wallet/prize/winner data is modified by this migration itself.

CREATE OR REPLACE FUNCTION public.claim_miocoin_bonus(p_bonus_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_amount        integer;
  v_wallet_id     uuid;
  v_bonus_balance numeric;
  v_new_balance   numeric;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Lock both the prize and matching winner so two concurrent claims cannot
  -- process the same bonus twice.
  SELECT bp.amount INTO v_amount
  FROM public.bonus_prizes bp
  JOIN public.winners w ON w.prize_id = bp.id
  WHERE bp.id       = p_bonus_id
    AND bp.status   IN ('won', 'pending')
    AND w.user_id   = p_user_id
    AND w.type      = 'bonus'
    AND w.delivered = false
  FOR UPDATE OF bp, w;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bonus not found, not owned by user, or already delivered';
  END IF;

  -- The win trigger already placed this value into bonus_balance_coins.
  -- Lock the wallet and move exactly the claimed amount to the spendable balance.
  SELECT id, bonus_balance_coins
  INTO v_wallet_id, v_bonus_balance
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for user';
  END IF;

  IF v_bonus_balance IS NULL OR v_bonus_balance < v_amount THEN
    RAISE EXCEPTION 'Bonus wallet balance is inconsistent with the claimed prize';
  END IF;

  UPDATE public.wallets
  SET
    balance_coins       = balance_coins + v_amount,
    bonus_balance_coins = bonus_balance_coins - v_amount
  WHERE user_id = p_user_id
  RETURNING balance_coins INTO v_new_balance;

  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) VALUES (
    p_user_id,
    v_wallet_id,
    v_amount,
    v_new_balance,
    'bonus_claim',
    'claim_miocoin_bonus',
    p_bonus_id,
    jsonb_build_object(
      'movement', 'bonus_to_main',
      'bonus_debited', v_amount
    )
  );

  UPDATE public.bonus_prizes
  SET status = 'delivered'
  WHERE id = p_bonus_id;

  UPDATE public.winners
  SET delivered = true
  WHERE prize_id = p_bonus_id
    AND user_id = p_user_id
    AND type = 'bonus';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_miocoin_bonus(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_miocoin_bonus(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_miocoin_bonus(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_miocoin_bonus(uuid, uuid) TO service_role;
