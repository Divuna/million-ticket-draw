-- Migration: 20260315240000_fix_bonus_prize_response.sql
-- Purpose: Fix buy_ticket_atomic so it correctly detects bonus prize wins
--          even when fn_check_bonus_prize trigger fires first and sets
--          bonus_prizes.status = 'won' before the function queries it.
--
-- Root cause: AFTER INSERT trigger fn_check_bonus_prize fires synchronously
-- within the same transaction as the ticket INSERT.  It creates the winners
-- row and marks bonus_prizes.status = 'won'.  buy_ticket_atomic then queries
-- bonus_prizes WHERE status = 'pending' and finds nothing, returning
-- won_prize: null even though the user actually won a bonus prize.
--
-- Fix: After the ticket INSERT, query the winners table (not bonus_prizes) to
-- detect whether a bonus winner was just created for this ticket position.
-- Uses explicit variables to avoid RECORD field-name conflicts between the
-- winners-join shape and the bonus_prizes shape.

CREATE OR REPLACE FUNCTION public.buy_ticket_atomic(p_contest_id uuid, p_user_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_ticket_price        NUMERIC;
  v_ticket_count        INT;
  v_contest_status      TEXT;
  v_balance             NUMERIC;
  v_wallet_id           UUID;
  v_next_ticket         INT;
  v_new_ticket_id       UUID;
  v_next_bonus_position INT;
  v_result              JSONB;
  -- Bonus win detection: explicit typed variables (avoids RECORD field-name issues)
  v_bonus_prize_id      UUID;
  v_bonus_title         TEXT;
  v_bonus_description   TEXT;
  v_bonus_amount        NUMERIC;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT ticket_price, ticket_count, status, next_ticket_number
  INTO   v_ticket_price, v_ticket_count, v_contest_status, v_next_ticket
  FROM   public.contests
  WHERE  id = p_contest_id
  FOR UPDATE;

  IF v_ticket_price IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contest not found');
  END IF;

  IF v_contest_status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contest is closed');
  END IF;

  IF v_next_ticket > v_ticket_count THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contest full');
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
    RETURN jsonb_build_object('success', false, 'error', 'Nedostatek miocoinu');
  END IF;

  UPDATE public.contests
  SET    next_ticket_number = next_ticket_number + 1
  WHERE  id = p_contest_id;

  UPDATE public.wallets
  SET    balance_coins = v_balance - v_ticket_price
  WHERE  id = v_wallet_id;

  RAISE LOG 'buy_ticket_atomic: user=%, balance_after=%, deducted=%',
    p_user_id, (v_balance - v_ticket_price), v_ticket_price;

  INSERT INTO public.tickets (contest_id, user_id, number)
  VALUES (p_contest_id, p_user_id, v_next_ticket)
  RETURNING id INTO v_new_ticket_id;

  -- NOTE: After the INSERT above, the fn_check_bonus_prize AFTER INSERT trigger
  -- fires synchronously within this transaction.  It may have already created a
  -- winners row and set bonus_prizes.status = 'won'.  Query the winners table
  -- (not bonus_prizes) to detect the win without re-reading stale status.

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

  -- Next bonus position for response (include 'won' so position still shows after win)
  SELECT ticket_position INTO v_next_bonus_position
  FROM   public.bonus_prizes
  WHERE  contest_id      = p_contest_id
    AND  ticket_position > v_next_ticket
    AND  status          IN ('pending', 'won')
  ORDER  BY ticket_position ASC
  LIMIT  1;

  -- Step 1: Check if a bonus winner already exists in winners table
  -- (created by fn_check_bonus_prize trigger firing after the ticket INSERT)
  SELECT w.prize_id, bp.title, bp.description, bp.amount
  INTO   v_bonus_prize_id, v_bonus_title, v_bonus_description, v_bonus_amount
  FROM   public.winners w
  JOIN   public.bonus_prizes bp ON bp.id = w.prize_id
  WHERE  w.contest_id      = p_contest_id
    AND  w.user_id         = p_user_id
    AND  w.type            = 'bonus'
    AND  bp.ticket_position = v_next_ticket
  LIMIT  1;

  IF v_bonus_prize_id IS NOT NULL THEN
    -- Trigger handled the winner insert; backfill ticket_id if it was omitted
    UPDATE public.winners
    SET    ticket_id = v_new_ticket_id
    WHERE  contest_id = p_contest_id
      AND  prize_id   = v_bonus_prize_id
      AND  user_id    = p_user_id
      AND  ticket_id  IS NULL;
  ELSE
    -- Step 2: Trigger did not fire (or ticket inserted by other path).
    -- Check bonus_prizes directly and create winner here if found.
    SELECT id, title, description, amount
    INTO   v_bonus_prize_id, v_bonus_title, v_bonus_description, v_bonus_amount
    FROM   public.bonus_prizes
    WHERE  contest_id      = p_contest_id
      AND  ticket_position = v_next_ticket
      AND  status          = 'pending'
    LIMIT  1;

    IF v_bonus_prize_id IS NOT NULL THEN
      INSERT INTO public.winners (contest_id, user_id, prize_id, ticket_id, type, notes)
      VALUES (p_contest_id, p_user_id, v_bonus_prize_id, v_new_ticket_id, 'bonus',
              'Bonusová výhra s tiketem #' || v_next_ticket);
      UPDATE public.bonus_prizes SET status = 'won' WHERE id = v_bonus_prize_id;
    END IF;
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
                              WHEN v_bonus_prize_id IS NOT NULL   THEN COALESCE(v_bonus_title, v_bonus_description)
                              WHEN v_next_ticket = v_ticket_count THEN 'Hlavní výhra'
                              ELSE NULL
                            END,
    'won_type',             CASE
                              WHEN v_bonus_prize_id IS NOT NULL   THEN 'bonus'
                              WHEN v_next_ticket = v_ticket_count THEN 'main'
                              ELSE NULL
                            END,
    'bonus_prize_id',       v_bonus_prize_id,
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
$function$;
