-- Fix claim_miocoin_bonus to use 'delivered' status (not 'claimed')
CREATE OR REPLACE FUNCTION public.claim_miocoin_bonus(p_bonus_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_amount integer;
BEGIN
  -- Lock bonus and verify ownership + pending state
  SELECT bp.amount
  INTO v_amount
  FROM bonus_prizes bp
  JOIN winners w ON w.prize_id = bp.id
  WHERE bp.id = p_bonus_id
    AND bp.status = 'pending'
    AND w.user_id = p_user_id
    AND w.type = 'bonus'
    AND w.delivered = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bonus not found, not owned by user, or already claimed';
  END IF;

  -- Credit MioCoins to main wallet
  UPDATE wallets
  SET balance_coins = balance_coins + v_amount
  WHERE user_id = p_user_id;

  -- Mark bonus as delivered (NOT 'claimed')
  UPDATE bonus_prizes
  SET status = 'delivered'
  WHERE id = p_bonus_id;

  -- Mark winner as delivered
  UPDATE winners
  SET delivered = true
  WHERE prize_id = p_bonus_id
    AND user_id = p_user_id;
END;
$function$;