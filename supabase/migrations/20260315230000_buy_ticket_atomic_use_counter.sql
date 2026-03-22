-- Migration: 20260315230000_buy_ticket_atomic_use_counter.sql
-- Purpose:   Update buy_ticket_atomic to use the contests.next_ticket_number
--            counter instead of SELECT MAX(number)+1 from the tickets table.
--            Drop the tickets_contest_number_desc index which only existed to
--            serve the old ORDER BY number DESC LIMIT 1 query.
--
-- CHANGES TO buy_ticket_atomic
--   REMOVED  v_last_ticket INT (no longer needed)
--   CHANGED  Initial contest SELECT FOR UPDATE now also reads next_ticket_number
--            into v_next_ticket directly — no separate tickets table read.
--   ADDED    UPDATE contests SET next_ticket_number = next_ticket_number + 1
--            after all guard checks pass, immediately before wallet deduction.
--            This advances the counter atomically inside the same transaction
--            that already holds the contest row lock (FOR UPDATE).
--
-- WHAT DOES NOT CHANGE
--   Wallet deduction logic is untouched.
--   Wallet safety guarantees (balance check, ledger write) are untouched.
--   Bonus prize detection logic is untouched.
--   Main winner creation logic is untouched.
--   Contest closure logic is untouched.
--   Auth check (p_user_id IS DISTINCT FROM auth.uid()) is untouched.
--   All existing error messages are preserved.
--
-- REVERSAL INSTRUCTIONS (if rollback is needed)
-- Run the following to restore the previous function version:
--
--   CREATE OR REPLACE FUNCTION public.buy_ticket_atomic(p_contest_id uuid, p_user_id uuid)
--   ... (see migration 20260315190000_contest_engine_functions.sql for prior body)

-- ---------------------------------------------------------------------------
-- Part 1: Update buy_ticket_atomic
-- ---------------------------------------------------------------------------

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
  v_next_ticket         INT;   -- now read directly from contests.next_ticket_number
  v_new_ticket_id       UUID;
  v_bonus               RECORD;
  v_next_bonus_position INT;
  v_result              JSONB;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Lock the contest row and read the current counter in one statement.
  -- next_ticket_number holds the ticket number to be assigned on the NEXT
  -- purchase; it is advanced (+ 1) below only after all guard checks pass.
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

  -- Capacity check: counter exceeds ticket_count means the contest is full.
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
    RETURN jsonb_build_object('success', false, 'error', 'Nedostatek miocoinů');
  END IF;

  -- All guards passed. Advance the counter to claim this ticket number.
  -- We hold the contest row lock (FOR UPDATE above), so this UPDATE is
  -- serialized with any other concurrent buy_ticket_atomic call for this
  -- contest — v_next_ticket is safe to use immediately after this point.
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
                              WHEN v_bonus.id IS NOT NULL         THEN v_bonus.description
                              WHEN v_next_ticket = v_ticket_count THEN 'Hlavní výhra'
                              ELSE NULL
                            END,
    'won_type',             CASE
                              WHEN v_bonus.id IS NOT NULL         THEN 'bonus'
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
$function$;

-- ---------------------------------------------------------------------------
-- Part 2: Drop the DESC index that only served ORDER BY number DESC LIMIT 1
-- ---------------------------------------------------------------------------
-- This index was created specifically to speed up the old query:
--   SELECT number FROM tickets WHERE contest_id = ? ORDER BY number DESC LIMIT 1
-- That query no longer exists in buy_ticket_atomic. The index now only adds
-- write overhead (~1 ms) on every ticket INSERT with no read benefit.
--
-- REVERSAL: CREATE INDEX tickets_contest_number_desc
--             ON public.tickets (contest_id, number DESC);
DROP INDEX IF EXISTS public.tickets_contest_number_desc;

-- ---------------------------------------------------------------------------
-- Verification queries (run after applying):
--
-- 1. Confirm function body uses next_ticket_number (not ORDER BY tickets):
--    SELECT prosrc FROM pg_proc
--    WHERE proname = 'buy_ticket_atomic'
--      AND pronamespace = 'public'::regnamespace;
--    Expected: contains 'next_ticket_number', does NOT contain 'ORDER  BY number DESC'
--
-- 2. Confirm DESC index is gone:
--    SELECT indexname FROM pg_indexes
--    WHERE schemaname = 'public' AND tablename = 'tickets'
--      AND indexname = 'tickets_contest_number_desc';
--    Expected: 0 rows
--
-- 3. Confirm exactly one UNIQUE constraint on tickets(contest_id, number):
--    SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.tickets'::regclass AND contype = 'u';
--    Expected: exactly 1 row — tickets_contest_id_number_key
--
-- 4. Spot-check counter vs actual ticket data:
--    SELECT c.id, c.next_ticket_number,
--           COALESCE((SELECT MAX(t.number) FROM tickets t WHERE t.contest_id = c.id), 0) + 1 AS expected
--    FROM contests c
--    WHERE c.next_ticket_number <>
--          COALESCE((SELECT MAX(t.number) FROM tickets t WHERE t.contest_id = c.id), 0) + 1;
--    Expected: 0 rows
-- ---------------------------------------------------------------------------
