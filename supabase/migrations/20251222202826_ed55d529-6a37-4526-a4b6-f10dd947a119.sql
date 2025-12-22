-- Create RPC to transfer bonus balance to main balance
CREATE OR REPLACE FUNCTION public.transfer_bonus_to_main(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bonus_amount integer;
BEGIN
  -- Lock wallet row and get current bonus balance
  SELECT bonus_balance_coins
  INTO v_bonus_amount
  FROM wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for user';
  END IF;

  IF v_bonus_amount IS NULL OR v_bonus_amount <= 0 THEN
    RAISE EXCEPTION 'No bonus balance to transfer';
  END IF;

  -- Transfer bonus to main balance
  UPDATE wallets
  SET 
    balance_coins = balance_coins + v_bonus_amount,
    bonus_balance_coins = 0
  WHERE user_id = p_user_id;
END;
$$;