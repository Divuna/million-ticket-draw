-- Restrict MioCoin bonus and bonus-wallet mutation RPCs.
--
-- Security context:
-- - claim_miocoin_bonus(uuid, uuid) accepted an arbitrary p_user_id and was
--   executable by anon/authenticated. A caller could claim/mark another user's
--   bonus by supplying that user's UUID.
-- - claim_miocoin_bonus(uuid) was a legacy SECURITY DEFINER helper that marked
--   any bonus prize and linked winners as delivered with no auth ownership
--   check.
-- - redeem_miocoin(uuid, uuid, integer) had an auth.uid() comparison but did
--   not explicitly reject a null caller/user id, leaving an anonymous/null
--   identity edge.
-- - transfer_bonus_to_main(), transfer_all_bonus_to_main_wallet(), and
--   recalculate_bonus_wallet() were exposed to PUBLIC/anon despite mutating
--   wallet state.
--
-- No wallet balances, bonus prizes, winners, or transactions are modified by
-- this migration. Only function guards, search_path, and EXECUTE grants change.

CREATE OR REPLACE FUNCTION public.claim_miocoin_bonus(p_bonus_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_amount      integer;
  v_wallet_id   uuid;
  v_new_balance numeric;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT bp.amount INTO v_amount
  FROM public.bonus_prizes bp
  JOIN public.winners w ON w.prize_id = bp.id
  WHERE bp.id       = p_bonus_id
    AND bp.status   IN ('won', 'pending')
    AND w.user_id   = p_user_id
    AND w.type      = 'bonus'
    AND w.delivered = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bonus not found, not owned by user, or already delivered';
  END IF;

  SELECT id, balance_coins INTO v_wallet_id, v_new_balance
  FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;

  UPDATE public.wallets
  SET balance_coins = balance_coins + v_amount
  WHERE user_id = p_user_id;

  v_new_balance := v_new_balance + v_amount;

  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id
  ) VALUES (
    p_user_id, v_wallet_id, v_amount, v_new_balance,
    'bonus_claim', 'claim_miocoin_bonus', p_bonus_id
  );

  UPDATE public.bonus_prizes SET status = 'delivered' WHERE id = p_bonus_id;
  UPDATE public.winners SET delivered = true WHERE prize_id = p_bonus_id AND user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_miocoin(p_user_id uuid, p_contest_id uuid, p_ticket_position integer)
RETURNS TABLE(success boolean, message text, new_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_bonus_id uuid;
    current_status text;
    v_winner_user_id uuid;
BEGIN
    -- Security: caller may only redeem for themselves, and anonymous/null
    -- identities must never pass the ownership check.
    IF auth.uid() IS NULL OR p_user_id IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
        success := false;
        message := 'Unauthorized';
        new_status := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Find bonus prize by contest and position (bonus_prizes has no user_id)
    SELECT id, status INTO v_bonus_id, current_status
    FROM public.bonus_prizes
    WHERE contest_id = p_contest_id
      AND ticket_position = p_ticket_position
    LIMIT 1;

    IF v_bonus_id IS NULL THEN
        success := false;
        message := 'Bonus nebyl nalezen';
        new_status := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Verify the caller won this bonus (winners holds prize_id -> bonus_prizes.id)
    SELECT user_id INTO v_winner_user_id
    FROM public.winners
    WHERE contest_id = p_contest_id
      AND prize_id = v_bonus_id
      AND type = 'bonus'
    LIMIT 1;

    IF v_winner_user_id IS NULL OR v_winner_user_id IS DISTINCT FROM p_user_id THEN
        success := false;
        message := 'Tento bonus vám nepatří';
        new_status := current_status;
        RETURN NEXT;
        RETURN;
    END IF;

    IF current_status = 'pending' OR current_status = 'won' OR current_status = 'delivered' THEN
        UPDATE public.bonus_prizes
        SET status = 'won'
        WHERE id = v_bonus_id;

        success := true;
        message := 'Miocoin byl úspěšně uplatněn';
        new_status := 'won';
        RETURN NEXT;
    ELSE
        success := false;
        message := 'Nelze uplatnit bonus s tímto statusem';
        new_status := current_status;
        RETURN NEXT;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_bonus_to_main()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_bonus integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT bonus_balance_coins
  INTO v_bonus
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_bonus IS NULL OR v_bonus <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.wallets
  SET
    balance_coins = balance_coins + v_bonus,
    bonus_balance_coins = 0
  WHERE user_id = v_user_id;

  INSERT INTO public.bonus_transfer_history (user_id, amount)
  VALUES (v_user_id, v_bonus);
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_all_bonus_to_main_wallet()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_wallet_id   uuid;
  v_bonus       numeric;
  v_new_balance numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT id, bonus_balance_coins INTO v_wallet_id, v_bonus
  FROM public.wallets WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_bonus IS NULL OR v_bonus <= 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.wallets
  SET balance_coins       = balance_coins + v_bonus,
      bonus_balance_coins = 0
  WHERE user_id = v_user_id
  RETURNING balance_coins INTO v_new_balance;

  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, metadata
  ) VALUES (
    v_user_id, v_wallet_id, v_bonus, v_new_balance,
    'bonus_transfer', 'transfer_all_bonus_to_main_wallet',
    jsonb_build_object('bonus_transferred', v_bonus)
  );

  RETURN v_bonus;
END;
$$;

ALTER FUNCTION public.claim_miocoin_bonus(uuid) SET search_path TO public;

CREATE OR REPLACE FUNCTION public.recalculate_bonus_wallet()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.wallets w
  SET bonus_balance_coins = COALESCE(sub.total_bonus, 0)
  FROM (
    SELECT wi.user_id, SUM(bp.amount)::int AS total_bonus
    FROM public.winners wi
    JOIN public.bonus_prizes bp ON bp.id = wi.prize_id
    WHERE wi.type = 'bonus'
      AND wi.delivered = false
    GROUP BY wi.user_id
  ) sub
  WHERE w.user_id = sub.user_id;
$$;

-- User-facing, self-scoped functions. Keep authenticated execution for the app,
-- remove anonymous/public execution, and keep service_role for trusted server
-- maintenance where applicable.
REVOKE ALL ON FUNCTION public.claim_miocoin_bonus(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_miocoin_bonus(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_miocoin_bonus(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_miocoin_bonus(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.redeem_miocoin(uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_miocoin(uuid, uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.redeem_miocoin(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_miocoin(uuid, uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.transfer_bonus_to_main() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_bonus_to_main() FROM anon;
GRANT EXECUTE ON FUNCTION public.transfer_bonus_to_main() TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_bonus_to_main() TO service_role;

REVOKE ALL ON FUNCTION public.transfer_all_bonus_to_main_wallet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_all_bonus_to_main_wallet() FROM anon;
GRANT EXECUTE ON FUNCTION public.transfer_all_bonus_to_main_wallet() TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_all_bonus_to_main_wallet() TO service_role;

-- Legacy/global mutation helpers are not called by the application. Keep them
-- out of ordinary RPC reach.
REVOKE ALL ON FUNCTION public.claim_miocoin_bonus(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_miocoin_bonus(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.claim_miocoin_bonus(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.claim_miocoin_bonus(uuid) FROM service_role;

REVOKE ALL ON FUNCTION public.recalculate_bonus_wallet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalculate_bonus_wallet() FROM anon;
REVOKE ALL ON FUNCTION public.recalculate_bonus_wallet() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_bonus_wallet() TO service_role;
