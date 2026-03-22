
-- Fix the claim_miocoin_bonus function to use correct column name
CREATE OR REPLACE FUNCTION public.claim_miocoin_bonus(p_bonus_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_amount numeric;
BEGIN
  -- Lock and get the bonus amount
  SELECT amount
  INTO v_amount
  FROM bonus_prizes
  WHERE id = p_bonus_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bonus not available';
  END IF;

  -- Credit MioCoins to user wallet (using correct column name)
  UPDATE wallets
  SET balance_coins = balance_coins + v_amount
  WHERE user_id = p_user_id;

  -- Mark bonus as claimed/won
  UPDATE bonus_prizes
  SET status = 'won'
  WHERE id = p_bonus_id;
END;
$function$;
;
