-- Manual deploy: paste full file in Supabase SQL Editor (same as migration 20260322150000).
-- Fix UUID / BIGINT mismatches when tickets.id and winners.ticket_id are BIGINT:
-- 1) buy_ticket_atomic: BIGINT v_new_ticket_id; wallet_transactions.reference_id NULL; audit wallet_debit reference_id NULL.
-- 2) close_contest: audit winner_created reference_id NULL; ticket_row_id in metadata; event_logs include ticket_row_id.
-- 3) on_bonus_winner_add_to_bonus_wallet: reference_id NULL (winner id stays in metadata).
-- No schema changes.

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
  v_new_ticket_id       BIGINT;
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
    NULL,
    jsonb_build_object(
      'contest_id',     p_contest_id,
      'ticket_number',  v_next_ticket,
      'ticket_row_id',  v_new_ticket_id
    )
  );

  -- AUDIT: wallet_debit (reference_id is uuid; ticket pk is bigint â€” use NULL, id in metadata)
  INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
  VALUES (
    'wallet_debit',
    'wallet_debit',
    p_user_id,
    NULL,
    jsonb_build_object(
      'ticket_row_id', v_new_ticket_id,
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
    UPDATE public.winners
    SET    ticket_id = v_new_ticket_id
    WHERE  contest_id = p_contest_id
      AND  prize_id   = v_bonus_prize_id
      AND  user_id    = p_user_id
      AND  ticket_id  IS NULL;
  ELSE
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
    INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
    VALUES (
      'winner_created',
      'winner_created',
      p_user_id,
      v_bonus_prize_id,
      jsonb_build_object(
        'reference_id',  v_bonus_prize_id,
        'contest_id',    p_contest_id,
        'ticket_row_id', v_new_ticket_id,
        'ticket_number', v_next_ticket,
        'type',          'bonus'
      ),
      now()
    );

    INSERT INTO public.event_logs (event_name, user_id, contest_id, metadata, source_system)
    VALUES (
      'prize_won',
      p_user_id,
      p_contest_id,
      jsonb_build_object(
        'notes',         COALESCE(v_bonus_title, v_bonus_description, 'BonusovĂˇ vĂ˝hra'),
        'type',          'bonus',
        'ticket_number', v_next_ticket,
        'ticket_row_id', v_new_ticket_id,
        'source',        'buy_ticket_atomic'
      ),
      'onemil'
    );
  END IF;

  -- Last ticket: close contest and crown main winner
  IF v_next_ticket = v_ticket_count THEN
    UPDATE public.contests SET status = 'closed' WHERE id = p_contest_id;

    INSERT INTO public.winners (contest_id, user_id, ticket_id, type, notes)
    VALUES (p_contest_id, p_user_id, v_new_ticket_id, 'main',
            'Main win ticket #' || v_next_ticket);

    -- AUDIT: winner_created (main) â€” reference_id uuid vs ticket bigint: NULL + metadata
    INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
    VALUES (
      'winner_created',
      'winner_created',
      p_user_id,
      NULL,
      jsonb_build_object(
        'ticket_row_id', v_new_ticket_id,
        'contest_id',    p_contest_id,
        'ticket_number', v_next_ticket,
        'type',          'main'
      ),
      now()
    );

    INSERT INTO public.event_logs (event_name, user_id, contest_id, metadata, source_system)
    VALUES (
      'prize_won',
      p_user_id,
      p_contest_id,
      jsonb_build_object(
        'notes',         'Hlavni vyhra',
        'type',          'main',
        'ticket_number', v_next_ticket,
        'ticket_row_id', v_new_ticket_id,
        'source',        'buy_ticket_atomic'
      ),
      'onemil'
    );

    -- AUDIT: contest_closed
    INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
    VALUES (
      'contest_closed',
      'contest_closed',
      p_user_id,
      p_contest_id,
      jsonb_build_object(
        'reference_id',  p_contest_id,
        'ticket_number', v_next_ticket,
        'ticket_row_id', v_new_ticket_id,
        'source',        'buy_ticket_atomic'
      ),
      now()
    );

    INSERT INTO public.event_logs (event_name, user_id, contest_id, metadata, source_system)
    VALUES (
      'contest_closed',
      p_user_id,
      p_contest_id,
      jsonb_build_object(
        'source',        'buy_ticket_atomic',
        'ticket_number', v_next_ticket,
        'ticket_row_id', v_new_ticket_id
      ),
      'onemil'
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

-- close_contest: tickets.id is BIGINT. audit_logs.reference_id is UUID - do not store ticket row id there.
-- Ticket pk is stored in metadata.ticket_row_id (jsonb accepts bigint).

CREATE OR REPLACE FUNCTION public.close_contest(p_contest_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $func$
DECLARE
  v_ticket record;
  v_status text;
  v_main_winner_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- AUDIT: admin_action
  INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
  VALUES (
    'admin_action',
    'admin_action',
    auth.uid(),
    p_contest_id,
    jsonb_build_object(
      'reference_id',  p_contest_id,
      'action',        'close_contest',
      'admin_action',  true
    ),
    now()
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

    INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
    VALUES (
      'contest_closed',
      'contest_closed',
      auth.uid(),
      p_contest_id,
      jsonb_build_object(
        'reference_id', p_contest_id,
        'source',       'close_contest_sync',
        'admin_action', true
      ),
      now()
    );

    SELECT w.user_id INTO v_main_winner_id
    FROM   public.winners w
    WHERE  w.contest_id = p_contest_id AND w.type = 'main'
    LIMIT  1;

    IF v_main_winner_id IS NOT NULL THEN
      INSERT INTO public.event_logs (event_name, user_id, contest_id, metadata, source_system)
      VALUES (
        'contest_closed',
        v_main_winner_id,
        p_contest_id,
        jsonb_build_object('source', 'close_contest_sync'),
        'onemil'
      );
    END IF;

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

    INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
    VALUES (
      'contest_closed',
      'contest_closed',
      auth.uid(),
      p_contest_id,
      jsonb_build_object(
        'reference_id', p_contest_id,
        'source',       'close_contest_no_tickets',
        'admin_action', true
      ),
      now()
    );

    INSERT INTO public.event_logs (event_name, user_id, contest_id, metadata, source_system)
    VALUES (
      'contest_closed',
      auth.uid(),
      p_contest_id,
      jsonb_build_object('source', 'close_contest_no_tickets'),
      'onemil'
    );

    RETURN;
  END IF;

  -- Insert main winner
  INSERT INTO public.winners (contest_id, user_id, ticket_id, type, created_at)
  VALUES (p_contest_id, v_ticket.user_id, v_ticket.id, 'main', now());

  -- AUDIT: winner_created â€” reference_id stays NULL; ticket_row_id is BIGINT in metadata
  INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
  VALUES (
    'winner_created',
    'winner_created',
    v_ticket.user_id,
    NULL,
    jsonb_build_object(
      'ticket_row_id', v_ticket.id,
      'contest_id',    p_contest_id,
      'ticket_number', v_ticket.number,
      'type',          'main',
      'admin_action',  true
    ),
    now()
  );

  INSERT INTO public.event_logs (event_name, user_id, contest_id, metadata, source_system)
  VALUES (
    'prize_won',
    v_ticket.user_id,
    p_contest_id,
    jsonb_build_object(
      'notes',         'Hlavni vyhra',
      'type',          'main',
      'ticket_number', v_ticket.number,
      'ticket_row_id', v_ticket.id,
      'source',        'close_contest'
    ),
    'onemil'
  );

  UPDATE public.contests SET status = 'closed' WHERE id = p_contest_id;

  -- AUDIT: contest_closed
  INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
  VALUES (
    'contest_closed',
    'contest_closed',
    auth.uid(),
    p_contest_id,
    jsonb_build_object(
      'reference_id',      p_contest_id,
      'winner_user_id',    v_ticket.user_id,
      'winner_ticket_id',  v_ticket.id,
      'source',            'close_contest',
      'admin_action',      true
    ),
    now()
  );

  INSERT INTO public.event_logs (event_name, user_id, contest_id, metadata, source_system)
  VALUES (
    'contest_closed',
    v_ticket.user_id,
    p_contest_id,
    jsonb_build_object(
      'source',            'close_contest',
      'winner_ticket_id',  v_ticket.id
    ),
    'onemil'
  );
END;
$func$;

-- If wallet_transactions.reference_id is BIGINT, winner UUID must not be written there.
-- Keep linkage in metadata only.

CREATE OR REPLACE FUNCTION public.on_bonus_winner_add_to_bonus_wallet()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_bonus_amount  NUMERIC;
  v_wallet_id     UUID;
  v_new_balance   NUMERIC;
BEGIN
  IF NEW.type = 'bonus' AND NEW.delivered = false THEN
    SELECT COALESCE(amount, 0)
    INTO   v_bonus_amount
    FROM   public.bonus_prizes
    WHERE  id = NEW.prize_id;

    IF v_bonus_amount IS NULL OR v_bonus_amount = 0 THEN
      RETURN NEW;
    END IF;

    UPDATE public.wallets
    SET    bonus_balance_coins = COALESCE(bonus_balance_coins, 0) + v_bonus_amount
    WHERE  user_id = NEW.user_id
    RETURNING id, bonus_balance_coins INTO v_wallet_id, v_new_balance;

    IF v_wallet_id IS NOT NULL THEN
      INSERT INTO public.wallet_transactions (
        user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
      ) VALUES (
        NEW.user_id,
        v_wallet_id,
        v_bonus_amount,
        v_new_balance,
        'bonus_credit',
        'on_bonus_winner_add_to_bonus_wallet',
        NULL,
        jsonb_build_object(
          'contest_id', NEW.contest_id,
          'prize_id',   NEW.prize_id,
          'winner_id',  NEW.id
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';

