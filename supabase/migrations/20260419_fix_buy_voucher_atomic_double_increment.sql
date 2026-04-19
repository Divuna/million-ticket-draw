-- Fix: remove manual redeemed_count increment from buy_voucher_atomic.
-- The trigger trg_user_voucher_redeemed_count is the single source of truth
-- and already increments redeemed_count on INSERT and on UPDATE redeemed false→true.

CREATE OR REPLACE FUNCTION public.buy_voucher_atomic(p_user_id uuid, p_voucher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet_balance     numeric;
  v_wallet_id          uuid;
  v_price              numeric := 5;
  v_existing_favorite  uuid;
  v_existing_purchased boolean;
  v_voucher_available  boolean;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT id, balance_coins INTO v_wallet_id, v_wallet_balance
  FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Peněženka nenalezena');
  END IF;

  IF v_wallet_balance < v_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nedostatek MioCoinů');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM user_vouchers
    WHERE user_id = p_user_id AND voucher_id = p_voucher_id AND redeemed = true
  ) INTO v_existing_purchased;

  IF v_existing_purchased THEN
    RETURN jsonb_build_object('success', false, 'error', 'Voucher již zakoupen');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM vouchers v
    WHERE v.id = p_voucher_id
      AND (v.start_date IS NULL OR v.start_date <= now())
      AND (v.end_date   IS NULL OR v.end_date   >= now())
      AND (v.max_quantity IS NULL OR v.redeemed_count < v.max_quantity)
  ) INTO v_voucher_available;

  IF NOT v_voucher_available THEN
    RETURN jsonb_build_object('success', false, 'error', 'Voucher není dostupný');
  END IF;

  SELECT id INTO v_existing_favorite
  FROM user_vouchers
  WHERE user_id = p_user_id AND voucher_id = p_voucher_id AND redeemed = false;

  IF v_existing_favorite IS NOT NULL THEN
    -- trigger trg_user_voucher_redeemed_count fires on UPDATE redeemed false→true
    UPDATE user_vouchers SET redeemed = true, updated_at = now() WHERE id = v_existing_favorite;
  ELSE
    -- trigger trg_user_voucher_redeemed_count fires on INSERT with redeemed=true
    INSERT INTO user_vouchers (user_id, voucher_id, redeemed) VALUES (p_user_id, p_voucher_id, true);
  END IF;

  UPDATE public.wallets SET balance_coins = balance_coins - v_price WHERE id = v_wallet_id;

  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) VALUES (
    p_user_id, v_wallet_id, -v_price, v_wallet_balance - v_price,
    'voucher_purchase', 'buy_voucher_atomic', p_voucher_id,
    jsonb_build_object('price', v_price)
  );

  -- redeemed_count is managed exclusively by trg_user_voucher_redeemed_count trigger

  RETURN jsonb_build_object('success', true);
END;
$$;
