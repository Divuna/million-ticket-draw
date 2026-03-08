
CREATE OR REPLACE FUNCTION public.buy_voucher_atomic(
  p_user_id uuid,
  p_voucher_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_balance numeric;
  v_price numeric := 5;
  v_existing_favorite uuid;
  v_existing_purchased boolean;
  v_voucher_available boolean;
BEGIN
  -- Lock user wallet row
  SELECT balance_coins INTO v_wallet_balance
  FROM wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_wallet_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Peněženka nenalezena');
  END IF;

  IF v_wallet_balance < v_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nedostatek MioCoinů');
  END IF;

  -- Check if already purchased (redeemed=true)
  SELECT EXISTS(
    SELECT 1 FROM user_vouchers
    WHERE user_id = p_user_id AND voucher_id = p_voucher_id AND redeemed = true
  ) INTO v_existing_purchased;

  IF v_existing_purchased THEN
    RETURN jsonb_build_object('success', false, 'error', 'Voucher již zakoupen');
  END IF;

  -- Check if voucher exists and is available (date + quantity)
  SELECT EXISTS(
    SELECT 1 FROM vouchers v
    WHERE v.id = p_voucher_id
      AND (v.start_date IS NULL OR v.start_date <= now())
      AND (v.end_date IS NULL OR v.end_date >= now())
      AND (v.max_quantity IS NULL OR v.redeemed_count < v.max_quantity)
  ) INTO v_voucher_available;

  IF NOT v_voucher_available THEN
    RETURN jsonb_build_object('success', false, 'error', 'Voucher není dostupný');
  END IF;

  -- Check if existing favorite record exists
  SELECT id INTO v_existing_favorite
  FROM user_vouchers
  WHERE user_id = p_user_id AND voucher_id = p_voucher_id AND redeemed = false;

  IF v_existing_favorite IS NOT NULL THEN
    -- Update favorite to purchased
    UPDATE user_vouchers
    SET redeemed = true, updated_at = now()
    WHERE id = v_existing_favorite;
  ELSE
    -- Insert new purchased record
    INSERT INTO user_vouchers (user_id, voucher_id, redeemed)
    VALUES (p_user_id, p_voucher_id, true);
  END IF;

  -- Deduct coins
  UPDATE wallets
  SET balance_coins = balance_coins - v_price
  WHERE user_id = p_user_id;

  -- Increment redeemed_count on voucher
  UPDATE vouchers
  SET redeemed_count = redeemed_count + 1
  WHERE id = p_voucher_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
