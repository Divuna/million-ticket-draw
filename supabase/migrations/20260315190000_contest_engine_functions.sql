-- =============================================================================
-- Contest engine safety: step 3 of 3 – replace close_contest and
-- buy_ticket_atomic with safe versions.
-- MUST be run after 20260315180000_contest_engine_constraints.sql.
--
-- Changes vs previous versions:
--
--   close_contest:
--     - Contest row is locked with FOR UPDATE BEFORE reading status (not after).
--     - After acquiring the lock, status is re-checked; return if already closed.
--     - After the lock, existence of a main winner is checked; if one already
--       exists the contest is synced to 'closed' and the function returns without
--       inserting a second winner. This eliminates the duplicate-main-winner race.
--     - ticket_id is always set on the inserted winner row.
--
--   buy_ticket_atomic:
--     - All existing business logic is preserved unchanged.
--     - The INSERT INTO tickets now uses RETURNING id to capture the new ticket's
--       UUID, which is then supplied as ticket_id when inserting the main winner
--       on the last ticket. This makes main winners created by this path traceable
--       to their ticket row, consistent with close_contest behaviour.
--
-- Run manually in Supabase SQL Editor. Do not run via CLI.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. close_contest
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_contest(p_contest_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_ticket record;
  v_status text;
BEGIN
  -- Acquire a row-level lock on the contest FIRST so that all subsequent
  -- reads and writes happen inside a single serialized critical section.
  -- Any concurrent call to close_contest for the same contest will wait here.
  SELECT status
  INTO   v_status
  FROM   public.contests
  WHERE  id = p_contest_id
  FOR UPDATE;

  -- Contest not found
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Already closed – nothing to do
  IF v_status = 'closed' THEN
    RETURN;
  END IF;

  -- A main winner already exists (e.g. inserted by buy_ticket_atomic or a
  -- previous concurrent call that committed just before we got the lock).
  -- Sync the status flag and return without inserting a duplicate winner.
  IF EXISTS (
    SELECT 1
    FROM   public.winners
    WHERE  contest_id = p_contest_id
      AND  type       = 'main'
  ) THEN
    UPDATE public.contests
    SET    status = 'closed'
    WHERE  id     = p_contest_id;
    RETURN;
  END IF;

  -- Pick a random winning ticket
  SELECT *
  INTO   v_ticket
  FROM   public.tickets
  WHERE  contest_id = p_contest_id
  ORDER  BY random()
  LIMIT  1;

  -- No tickets sold – close the contest with no winner (edge case)
  IF v_ticket IS NULL THEN
    UPDATE public.contests
    SET    status = 'closed'
    WHERE  id     = p_contest_id;
    RETURN;
  END IF;

  -- Insert exactly one main winner, linking the winning ticket via ticket_id
  INSERT INTO public.winners (
    contest_id,
    user_id,
    ticket_id,
    type,
    created_at
  )
  VALUES (
    p_contest_id,
    v_ticket.user_id,
    v_ticket.id,
    'main',
    now()
  );

  UPDATE public.contests
  SET    status = 'closed'
  WHERE  id     = p_contest_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. buy_ticket_atomic
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.buy_ticket_atomic(p_contest_id uuid, p_user_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_ticket_price       NUMERIC;
  v_ticket_count       INT;
  v_contest_status     TEXT;
  v_balance            NUMERIC;
  v_last_ticket        INT;
  v_next_ticket        INT;
  v_new_ticket_id      UUID;       -- id of the ticket row just inserted
  v_bonus              RECORD;
  v_next_bonus_position INT;
  v_result             JSONB;
BEGIN
  -- Security: caller may only act on their own behalf
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Lock the contest row to serialise concurrent purchases for the same contest
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

  -- Lock the wallet row to serialise concurrent purchases by the same user
  SELECT balance_coins
  INTO   v_balance
  FROM   public.wallets
  WHERE  user_id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  RAISE LOG 'buy_ticket_atomic: user=%, contest=%, ticket_price=%, balance_before=%',
    p_user_id, p_contest_id, v_ticket_price, v_balance;

  IF v_balance < v_ticket_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nedostatek miocoinů');
  END IF;

  -- Determine the next sequential ticket number (contest lock prevents races)
  SELECT number
  INTO   v_last_ticket
  FROM   public.tickets
  WHERE  contest_id = p_contest_id
  ORDER  BY number DESC
  LIMIT  1;

  v_next_ticket := coalesce(v_last_ticket, 0) + 1;

  IF v_next_ticket > v_ticket_count THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contest full');
  END IF;

  -- Deduct ticket price from wallet
  UPDATE public.wallets
  SET    balance_coins = v_balance - v_ticket_price
  WHERE  user_id = p_user_id;

  RAISE LOG 'buy_ticket_atomic: user=%, balance_after=%, deducted=%',
    p_user_id, (v_balance - v_ticket_price), v_ticket_price;

  -- Create the ticket and capture its generated UUID for later use
  INSERT INTO public.tickets (contest_id, user_id, number)
  VALUES (p_contest_id, p_user_id, v_next_ticket)
  RETURNING id INTO v_new_ticket_id;

  -- Look up the next upcoming bonus position for the response payload
  SELECT ticket_position
  INTO   v_next_bonus_position
  FROM   public.bonus_prizes
  WHERE  contest_id      = p_contest_id
    AND  ticket_position > v_next_ticket
    AND  status          = 'pending'
  ORDER  BY ticket_position ASC
  LIMIT  1;

  -- Assign bonus prize if this ticket lands on a bonus position
  SELECT *
  INTO   v_bonus
  FROM   public.bonus_prizes
  WHERE  contest_id      = p_contest_id
    AND  ticket_position = v_next_ticket
    AND  status          = 'pending'
  LIMIT  1;

  IF v_bonus.id IS NOT NULL THEN
    INSERT INTO public.winners (contest_id, user_id, prize_id, type, notes)
    VALUES (p_contest_id, p_user_id, v_bonus.id, 'bonus',
            'Bonusová výhra s tiketem #' || v_next_ticket);

    UPDATE public.bonus_prizes
    SET    status = 'won'
    WHERE  id     = v_bonus.id;
  END IF;

  -- If this is the last ticket: close the contest and crown the main winner.
  -- ticket_id is set to link the winner row back to the physical ticket.
  IF v_next_ticket = v_ticket_count THEN
    UPDATE public.contests
    SET    status = 'closed'
    WHERE  id     = p_contest_id;

    INSERT INTO public.winners (contest_id, user_id, ticket_id, type, notes)
    VALUES (p_contest_id, p_user_id, v_new_ticket_id, 'main',
            'Hlavní výhra s tiketem #' || v_next_ticket);
  END IF;

  v_result := jsonb_build_object(
    'success',              true,
    'ticket_number',        v_next_ticket,
    'ticket_price',         v_ticket_price,
    'won_prize',            CASE
                              WHEN v_bonus.id IS NOT NULL   THEN v_bonus.description
                              WHEN v_next_ticket = v_ticket_count THEN 'Hlavní výhra'
                              ELSE NULL
                            END,
    'won_type',             CASE
                              WHEN v_bonus.id IS NOT NULL   THEN 'bonus'
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
