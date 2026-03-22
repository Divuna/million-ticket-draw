-- Migration: 20260315290000_audit_log_coverage.sql
-- Purpose:   Add structured audit_logs entries to three critical functions.
--            Only INSERT INTO audit_logs calls are added; all existing logic
--            is preserved byte-for-byte.
--
-- audit_logs schema (actual columns):
--   id          uuid  PK default gen_random_uuid()
--   user_id     uuid
--   event       text  NOT NULL   (used for event_type)
--   metadata    jsonb            (reference_id + context stored here)
--   created_at  timestamptz
--
-- Events added:
--   wallet_credit  -- update_wallet_after_payment trigger
--   wallet_debit   -- buy_ticket_atomic (after wallet_transactions insert)
--   winner_created -- buy_ticket_atomic (bonus + main) and close_contest
--   contest_closed -- buy_ticket_atomic (last ticket) and close_contest
--   admin_action   -- close_contest (via existing log_admin_action function)
--
-- What does NOT change:
--   Wallet balance logic
--   Ticket number allocation
--   Winner insertion
--   Contest status transitions
--   Rate limit guard
--   Bonus prize detection
--   All existing error messages

-- =============================================================================
-- 1. update_wallet_after_payment  (trigger function)
--    Adds: wallet_credit audit entry
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_wallet_after_payment()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_wallet_id      uuid;
  v_new_balance    numeric;
BEGIN
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.wallets (user_id, balance_coins, balance_vouchers, created_at)
  VALUES (NEW.user_id, NEW.amount, 0, now())
  ON CONFLICT (user_id) DO UPDATE
    SET balance_coins = wallets.balance_coins + NEW.amount
  RETURNING id, balance_coins INTO v_wallet_id, v_new_balance;

  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) VALUES (
    NEW.user_id,
    v_wallet_id,
    NEW.amount,
    v_new_balance,
    'payment_credit',
    'update_wallet_after_payment',
    NEW.id,
    jsonb_build_object(
      'stripe_session_id', NEW.stripe_session_id,
      'method',            NEW.method,
      'payment_status',    NEW.status
    )
  );

  -- AUDIT: wallet_credit
  INSERT INTO public.audit_logs (event, user_id, metadata, created_at)
  VALUES (
    'wallet_credit',
    NEW.user_id,
    jsonb_build_object(
      'reference_id',      NEW.id,
      'amount',            NEW.amount,
      'wallet_id',         v_wallet_id,
      'balance_after',     v_new_balance,
      'stripe_session_id', NEW.stripe_session_id
    ),
    now()
  );

  RETURN NEW;
END;
$$;

-- =============================================================================
-- 2. buy_ticket_atomic  (RPC — includes rate-limit guard from previous migration)
--    Adds: wallet_debit, winner_created (bonus), winner_created (main),
--          contest_closed audit entries
-- =============================================================================
CREATE OR REPLACE FUNCTION public.buy_ticket_atomic(p_contest_id uuid, p_user_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $func$
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
  v_bonus_prize_id      UUID;
  v_bonus_title         TEXT;
  v_bonus_description   TEXT;
  v_bonus_amount        NUMERIC;
  v_recent_count        INT;
BEGIN
  -- Auth guard
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Rate limit: max 5 tickets per user per 5 seconds
  SELECT COUNT(*)
  INTO   v_recent_count
  FROM   public.tickets
  WHERE  user_id    = auth.uid()
    AND  created_at > now() - interval '5 seconds';

  IF v_recent_count >= 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'rate_limit');
  END IF;

  -- Contest lock
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

  -- Wallet lock
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

  -- All guards passed: advance counter and write
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

  -- AUDIT: wallet_debit
  INSERT INTO public.audit_logs (event, user_id, metadata, created_at)
  VALUES (
    'wallet_debit',
    p_user_id,
    jsonb_build_object(
      'reference_id',  v_new_ticket_id,
      'amount',        -v_ticket_price,
      'balance_after', v_balance - v_ticket_price,
      'contest_id',    p_contest_id,
      'ticket_number', v_next_ticket
    ),
    now()
  );

  -- Next bonus position for response
  SELECT ticket_position INTO v_next_bonus_position
  FROM   public.bonus_prizes
  WHERE  contest_id      = p_contest_id
    AND  ticket_position > v_next_ticket
    AND  status          IN ('pending', 'won')
  ORDER  BY ticket_position ASC
  LIMIT  1;

  -- Bonus win detection: check winners table first (trigger may have fired)
  SELECT w.prize_id, bp.title, bp.description, bp.amount
  INTO   v_bonus_prize_id, v_bonus_title, v_bonus_description, v_bonus_amount
  FROM   public.winners w
  JOIN   public.bonus_prizes bp ON bp.id = w.prize_id
  WHERE  w.contest_id       = p_contest_id
    AND  w.user_id          = p_user_id
    AND  w.type             = 'bonus'
    AND  bp.ticket_position = v_next_ticket
  LIMIT  1;

  IF v_bonus_prize_id IS NOT NULL THEN
    -- Trigger handled winner insert; backfill ticket_id if missing
    UPDATE public.winners
    SET    ticket_id = v_new_ticket_id
    WHERE  contest_id = p_contest_id
      AND  prize_id   = v_bonus_prize_id
      AND  user_id    = p_user_id
      AND  ticket_id  IS NULL;
  ELSE
    -- Check bonus_prizes directly
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
              'Bonus win ticket #' || v_next_ticket);
      UPDATE public.bonus_prizes SET status = 'won' WHERE id = v_bonus_prize_id;
    END IF;
  END IF;

  -- AUDIT: winner_created (bonus)
  IF v_bonus_prize_id IS NOT NULL THEN
    INSERT INTO public.audit_logs (event, user_id, metadata, created_at)
    VALUES (
      'winner_created',
      p_user_id,
      jsonb_build_object(
        'reference_id',  v_bonus_prize_id,
        'contest_id',    p_contest_id,
        'ticket_id',     v_new_ticket_id,
        'ticket_number', v_next_ticket,
        'type',          'bonus'
      ),
      now()
    );
  END IF;

  -- Last ticket: close contest and crown main winner
  IF v_next_ticket = v_ticket_count THEN
    UPDATE public.contests SET status = 'closed' WHERE id = p_contest_id;

    INSERT INTO public.winners (contest_id, user_id, ticket_id, type, notes)
    VALUES (p_contest_id, p_user_id, v_new_ticket_id, 'main',
            'Main win ticket #' || v_next_ticket);

    -- AUDIT: winner_created (main)
    INSERT INTO public.audit_logs (event, user_id, metadata, created_at)
    VALUES (
      'winner_created',
      p_user_id,
      jsonb_build_object(
        'reference_id',  v_new_ticket_id,
        'contest_id',    p_contest_id,
        'ticket_number', v_next_ticket,
        'type',          'main'
      ),
      now()
    );

    -- AUDIT: contest_closed
    INSERT INTO public.audit_logs (event, user_id, metadata, created_at)
    VALUES (
      'contest_closed',
      p_user_id,
      jsonb_build_object(
        'reference_id',  p_contest_id,
        'ticket_number', v_next_ticket,
        'source',        'buy_ticket_atomic'
      ),
      now()
    );
  END IF;

  v_result := jsonb_build_object(
    'success',              true,
    'ticket_number',        v_next_ticket,
    'ticket_price',         v_ticket_price,
    'won_prize',            CASE
                              WHEN v_bonus_prize_id IS NOT NULL   THEN COALESCE(v_bonus_title, v_bonus_description)
                              WHEN v_next_ticket = v_ticket_count THEN 'Hlavni vyhra'
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
$func$;

-- =============================================================================
-- 3. close_contest  (admin RPC)
--    Adds: contest_closed, winner_created, admin_action audit entries
-- =============================================================================
CREATE OR REPLACE FUNCTION public.close_contest(p_contest_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $func$
DECLARE
  v_ticket record;
  v_status text;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- AUDIT: admin_action (log that admin initiated close)
  PERFORM log_admin_action(
    'admin_close_contest',
    'contest',
    p_contest_id,
    NULL,
    NULL
  );

  SELECT status INTO v_status
  FROM   public.contests
  WHERE  id = p_contest_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;
  IF v_status = 'closed' THEN RETURN; END IF;

  -- Main winner already exists: sync status only
  IF EXISTS (
    SELECT 1 FROM public.winners
    WHERE  contest_id = p_contest_id AND type = 'main'
  ) THEN
    UPDATE public.contests SET status = 'closed' WHERE id = p_contest_id;

    -- AUDIT: contest_closed (status sync path)
    INSERT INTO public.audit_logs (event, user_id, metadata, created_at)
    VALUES (
      'contest_closed',
      auth.uid(),
      jsonb_build_object(
        'reference_id', p_contest_id,
        'source',       'close_contest_sync',
        'admin_action', true
      ),
      now()
    );
    RETURN;
  END IF;

  -- Pick a random winning ticket
  SELECT * INTO v_ticket
  FROM   public.tickets
  WHERE  contest_id = p_contest_id
  ORDER  BY random()
  LIMIT  1;

  -- No tickets sold: close with no winner
  IF v_ticket IS NULL THEN
    UPDATE public.contests SET status = 'closed' WHERE id = p_contest_id;

    -- AUDIT: contest_closed (no winner path)
    INSERT INTO public.audit_logs (event, user_id, metadata, created_at)
    VALUES (
      'contest_closed',
      auth.uid(),
      jsonb_build_object(
        'reference_id', p_contest_id,
        'source',       'close_contest_no_tickets',
        'admin_action', true
      ),
      now()
    );
    RETURN;
  END IF;

  -- Insert main winner
  INSERT INTO public.winners (contest_id, user_id, ticket_id, type, created_at)
  VALUES (p_contest_id, v_ticket.user_id, v_ticket.id, 'main', now());

  -- AUDIT: winner_created
  INSERT INTO public.audit_logs (event, user_id, metadata, created_at)
  VALUES (
    'winner_created',
    v_ticket.user_id,
    jsonb_build_object(
      'reference_id', v_ticket.id,
      'contest_id',   p_contest_id,
      'ticket_number', v_ticket.number,
      'type',         'main',
      'admin_action', true
    ),
    now()
  );

  UPDATE public.contests SET status = 'closed' WHERE id = p_contest_id;

  -- AUDIT: contest_closed
  INSERT INTO public.audit_logs (event, user_id, metadata, created_at)
  VALUES (
    'contest_closed',
    auth.uid(),
    jsonb_build_object(
      'reference_id',  p_contest_id,
      'winner_user_id', v_ticket.user_id,
      'winner_ticket_id', v_ticket.id,
      'source',        'close_contest',
      'admin_action',  true
    ),
    now()
  );
END;
$func$;
