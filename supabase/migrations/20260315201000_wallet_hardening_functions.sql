-- =============================================================================
-- Wallet hardening part 2: ledger entries in remaining wallet functions (STEPS 4-9).
-- Depends on 20260315200000_wallet_hardening.sql (wallet_transactions table must exist).
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: fix deduct_wallet_for_refund — add ledger entry
--   Silent truncation via GREATEST(0,...) is preserved to prevent negative balances.
--   Both the requested and actual deductions are recorded in the ledger.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.deduct_wallet_for_refund(p_user_id uuid, p_amount numeric)
  RETURNS numeric
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_wallet_id    uuid;
  v_old_balance  numeric;
  v_new_balance  numeric;
  v_actual_debit numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  SELECT id, balance_coins
  INTO v_wallet_id, v_old_balance
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Wallet not found for user %', p_user_id;
  END IF;

  v_new_balance  := GREATEST(0, v_old_balance - p_amount);
  v_actual_debit := v_old_balance - v_new_balance;

  UPDATE public.wallets
  SET balance_coins = v_new_balance
  WHERE id = v_wallet_id;

  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, metadata
  ) VALUES (
    p_user_id,
    v_wallet_id,
    -v_actual_debit,
    v_new_balance,
    'refund_debit',
    'deduct_wallet_for_refund',
    jsonb_build_object(
      'requested_debit', p_amount,
      'actual_debit',    v_actual_debit,
      'was_clamped',     (v_actual_debit < p_amount)
    )
  );

  RETURN v_new_balance;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: fix buy_ticket_atomic — add ledger entry
--   Ledger INSERT placed AFTER ticket INSERT so ticket id is available as reference_id.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.buy_ticket_atomic(p_contest_id uuid, p_user_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_ticket_price        NUMERIC;
  v_ticket_count        INT;
  v_contest_status      TEXT;
  v_balance             NUMERIC;
  v_wallet_id           UUID;
  v_last_ticket         INT;
  v_next_ticket         INT;
  v_new_ticket_id       UUID;
  v_bonus               RECORD;
  v_next_bonus_position INT;
  v_result              JSONB;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT ticket_price, ticket_count, status
  INTO   v_ticket_price, v_ticket_count, v_contest_status
  FROM   public.contests
  WHERE  id = p_contest_id
  FOR UPDATE;

  IF v_ticket_price IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contest not found');
  END IF;

  IF v_contest_status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contest is closed');
  END IF;

  SELECT id, balance_coins
  INTO   v_wallet_id, v_balance
  FROM   public.wallets
  WHERE  user_id = p_user_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  RAISE LOG 'buy_ticket_atomic: user=%, contest=%, ticket_price=%, balance_before=%',
    p_user_id, p_contest_id, v_ticket_price, v_balance;

  IF v_balance < v_ticket_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nedostatek miocoinů');
  END IF;

  SELECT number INTO v_last_ticket
  FROM   public.tickets
  WHERE  contest_id = p_contest_id
  ORDER  BY number DESC
  LIMIT  1;

  v_next_ticket := coalesce(v_last_ticket, 0) + 1;

  IF v_next_ticket > v_ticket_count THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contest full');
  END IF;

  UPDATE public.wallets
  SET    balance_coins = v_balance - v_ticket_price
  WHERE  id = v_wallet_id;

  RAISE LOG 'buy_ticket_atomic: user=%, balance_after=%, deducted=%',
    p_user_id, (v_balance - v_ticket_price), v_ticket_price;

  INSERT INTO public.tickets (contest_id, user_id, number)
  VALUES (p_contest_id, p_user_id, v_next_ticket)
  RETURNING id INTO v_new_ticket_id;

  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) VALUES (
    p_user_id,
    v_wallet_id,
    -v_ticket_price,
    v_balance - v_ticket_price,
    'ticket_purchase',
    'buy_ticket_atomic',
    v_new_ticket_id,
    jsonb_build_object('contest_id', p_contest_id, 'ticket_number', v_next_ticket)
  );

  SELECT ticket_position INTO v_next_bonus_position
  FROM   public.bonus_prizes
  WHERE  contest_id      = p_contest_id
    AND  ticket_position > v_next_ticket
    AND  status          = 'pending'
  ORDER  BY ticket_position ASC
  LIMIT  1;

  SELECT * INTO v_bonus
  FROM   public.bonus_prizes
  WHERE  contest_id      = p_contest_id
    AND  ticket_position = v_next_ticket
    AND  status          = 'pending'
  LIMIT  1;

  IF v_bonus.id IS NOT NULL THEN
    INSERT INTO public.winners (contest_id, user_id, prize_id, type, notes)
    VALUES (p_contest_id, p_user_id, v_bonus.id, 'bonus',
            'Bonusová výhra s tiketem #' || v_next_ticket);

    UPDATE public.bonus_prizes SET status = 'won' WHERE id = v_bonus.id;
  END IF;

  IF v_next_ticket = v_ticket_count THEN
    UPDATE public.contests SET status = 'closed' WHERE id = p_contest_id;

    INSERT INTO public.winners (contest_id, user_id, ticket_id, type, notes)
    VALUES (p_contest_id, p_user_id, v_new_ticket_id, 'main',
            'Hlavní výhra s tiketem #' || v_next_ticket);
  END IF;

  v_result := jsonb_build_object(
    'success',              true,
    'ticket_number',        v_next_ticket,
    'ticket_price',         v_ticket_price,
    'won_prize',            CASE
                              WHEN v_bonus.id IS NOT NULL        THEN v_bonus.description
                              WHEN v_next_ticket = v_ticket_count THEN 'Hlavní výhra'
                              ELSE NULL
                            END,
    'won_type',             CASE
                              WHEN v_bonus.id IS NOT NULL        THEN 'bonus'
                              WHEN v_next_ticket = v_ticket_count THEN 'main'
                              ELSE NULL
                            END,
    'bonus_prize_id',       v_bonus.id,
    'remaining_tickets',    v_ticket_count - v_next_ticket,
    'next_bonus_position',  v_next_bonus_position,
    'distance_to_next_bonus', CASE
                                WHEN v_next_bonus_position IS NOT NULL
                                THEN v_next_bonus_position - v_next_ticket
                                ELSE NULL
                              END
  );

  RETURN v_result;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: fix buy_voucher_atomic — add ledger entry
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.buy_voucher_atomic(p_user_id uuid, p_voucher_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
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
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

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
    UPDATE user_vouchers SET redeemed = true, updated_at = now() WHERE id = v_existing_favorite;
  ELSE
    INSERT INTO user_vouchers (user_id, voucher_id, redeemed) VALUES (p_user_id, p_voucher_id, true);
  END IF;

  UPDATE public.wallets SET balance_coins = balance_coins - v_price WHERE id = v_wallet_id;

  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) VALUES (
    p_user_id,
    v_wallet_id,
    -v_price,
    v_wallet_balance - v_price,
    'voucher_purchase',
    'buy_voucher_atomic',
    p_voucher_id,
    jsonb_build_object('price', v_price)
  );

  UPDATE vouchers SET redeemed_count = redeemed_count + 1 WHERE id = p_voucher_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7: fix claim_miocoin_bonus — add ledger entry
--   NOTE: production signature is (p_bonus_id uuid, p_user_id uuid).
--   DROP and recreate to avoid parameter-rename conflict.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.claim_miocoin_bonus(uuid, uuid);

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
  SELECT bp.amount INTO v_amount
  FROM bonus_prizes bp
  JOIN winners w ON w.prize_id = bp.id
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

  UPDATE bonus_prizes SET status = 'delivered' WHERE id = p_bonus_id;
  UPDATE winners      SET delivered = true      WHERE prize_id = p_bonus_id AND user_id = p_user_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 8: fix redeem_voucher — add ledger entry for balance_vouchers debit
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.redeem_voucher(p_voucher_id uuid)
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_user_id             uuid;
  v_voucher_record      vouchers%ROWTYPE;
  v_remaining_vouchers  integer;
  v_user_wallet_balance numeric;
  v_wallet_id           uuid;
  v_price               numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Uživatel není přihlášen');
  END IF;

  SELECT * INTO v_voucher_record FROM vouchers WHERE id = p_voucher_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Voucher neexistuje');
  END IF;

  IF v_voucher_record.start_date IS NOT NULL AND now() < v_voucher_record.start_date THEN
    RETURN json_build_object('success', false, 'message', 'Voucher ještě není aktivní');
  END IF;
  IF v_voucher_record.end_date IS NOT NULL AND now() > v_voucher_record.end_date THEN
    RETURN json_build_object('success', false, 'message', 'Voucher již vypršel');
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_vouchers
    WHERE user_id = v_user_id AND voucher_id = p_voucher_id AND redeemed = true
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Tento voucher jste již uplatnili');
  END IF;

  IF v_voucher_record.max_quantity IS NOT NULL THEN
    v_remaining_vouchers := v_voucher_record.max_quantity - coalesce(v_voucher_record.redeemed_count, 0);
    IF v_remaining_vouchers <= 0 THEN
      RETURN json_build_object('success', false, 'message', 'Všechny vouchery byly již uplatněny');
    END IF;
  END IF;

  v_price := coalesce(v_voucher_record.redeem_price_vouchers, 1);

  SELECT id, balance_vouchers INTO v_wallet_id, v_user_wallet_balance
  FROM public.wallets WHERE user_id = v_user_id FOR UPDATE;

  IF v_user_wallet_balance IS NULL OR v_user_wallet_balance < v_price THEN
    RETURN json_build_object('success', false, 'message', 'Nedostatečný zůstatek voucherů v peněžence');
  END IF;

  BEGIN
    UPDATE public.wallets
    SET balance_vouchers = balance_vouchers - v_price
    WHERE user_id = v_user_id;

    INSERT INTO public.wallet_transactions (
      user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
    ) VALUES (
      v_user_id, v_wallet_id, -v_price, v_user_wallet_balance - v_price,
      'voucher_redeem_debit', 'redeem_voucher', p_voucher_id,
      jsonb_build_object('voucher_name', v_voucher_record.name, 'price', v_price)
    );

    UPDATE vouchers SET redeemed_count = coalesce(redeemed_count, 0) + 1 WHERE id = p_voucher_id;
    INSERT INTO user_vouchers (user_id, voucher_id, redeemed) VALUES (v_user_id, p_voucher_id, true);

    PERFORM log_admin_action(
      'voucher_redeemed', 'vouchers', p_voucher_id, NULL,
      jsonb_build_object(
        'user_id',               v_user_id,
        'voucher_name',          v_voucher_record.name,
        'redeem_price_vouchers', v_price,
        'remaining_vouchers',    CASE
                                   WHEN v_voucher_record.max_quantity IS NULL THEN 'unlimited'
                                   ELSE (v_voucher_record.max_quantity - coalesce(v_voucher_record.redeemed_count, 0) - 1)::text
                                 END
      )
    );

    RETURN json_build_object('success', true, 'message', 'Voucher byl úspěšně uplatněn', 'redeemed_value', v_price);

  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', 'Chyba při uplatnění voucheru: ' || SQLERRM);
  END;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 9: fix transfer_all_bonus_to_main_wallet — add ledger entry
-- ─────────────────────────────────────────────────────────────────────────────

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
