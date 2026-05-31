-- Migration: 20260504_add_remaining_and_bonus_distance_to_buy_ticket_atomic.sql
--
-- PROBLEM
-- buy_ticket_atomic does not return:
--   remaining_tickets      — tickets left until contest closes
--   next_bonus_position    — ticket_position of nearest pending bonus_prize
--   distance_to_next_bonus — next_bonus_position - current ticket_number
--
-- FIX
-- 1. Add local variable v_next_bonus_position integer.
-- 2. After all winner inserts/updates, SELECT the nearest pending bonus_prizes
--    row with ticket_position > v_next_ticket for this contest.
-- 3. Append the three fields to the existing jsonb_build_object call.
--
-- WHAT IS NOT CHANGED
-- Ticket purchase logic, wallet logic, winner inserts, Partner Offers,
-- contest status transition, bonus_prizes status update — all untouched.
--
-- SOURCE
-- Based on the live production definition retrieved 2026-05-04 via pg_get_functiondef.

CREATE OR REPLACE FUNCTION public.buy_ticket_atomic(p_user_id uuid, p_contest_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_ticket_price          numeric;
  v_ticket_count          integer;
  v_contest_status        text;
  v_next_ticket           integer;
  v_wallet_id             uuid;
  v_balance               numeric;
  v_new_ticket_id         uuid;
  v_bonus_prize_id        uuid;
  v_bonus_title           text;
  v_next_bonus_position   integer;   -- NEW: nearest pending bonus after this ticket
  v_result                jsonb;
BEGIN
  SELECT ticket_price, ticket_count, status, next_ticket_number
  INTO v_ticket_price, v_ticket_count, v_contest_status, v_next_ticket
  FROM public.contests WHERE id = p_contest_id FOR UPDATE;

  IF v_contest_status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contest not active');
  END IF;

  IF v_next_ticket > v_ticket_count THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contest full');
  END IF;

  SELECT id, balance_coins INTO v_wallet_id, v_balance
  FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_balance < v_ticket_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nedostatek miocoinu');
  END IF;

  UPDATE public.wallets SET balance_coins = v_balance - v_ticket_price WHERE id = v_wallet_id;
  UPDATE public.contests SET next_ticket_number = next_ticket_number + 1 WHERE id = p_contest_id;

  INSERT INTO public.tickets (contest_id, user_id, number)
  VALUES (p_contest_id, p_user_id, v_next_ticket)
  RETURNING id INTO v_new_ticket_id;

  -- Bonus check - hledat 'pending' status
  SELECT id, COALESCE(title, description)
  INTO v_bonus_prize_id, v_bonus_title
  FROM public.bonus_prizes
  WHERE contest_id = p_contest_id
    AND ticket_position = v_next_ticket
    AND status = 'pending'
  LIMIT 1;

  -- MAIN win
  IF v_next_ticket = v_ticket_count THEN
    INSERT INTO public.winners (user_id, contest_id, ticket_id, type)
    VALUES (p_user_id, p_contest_id, v_new_ticket_id, 'main');
    UPDATE public.contests SET status = 'closed' WHERE id = p_contest_id;
  END IF;

  -- BONUS win
  IF v_bonus_prize_id IS NOT NULL THEN
    INSERT INTO public.winners (user_id, contest_id, ticket_id, prize_id, type)
    VALUES (p_user_id, p_contest_id, v_new_ticket_id, v_bonus_prize_id, 'bonus');
    UPDATE public.bonus_prizes SET status = 'won' WHERE id = v_bonus_prize_id;
  END IF;

  -- NEW: find nearest pending bonus position strictly after the current ticket.
  -- This runs after the current bonus is marked 'won', so it correctly skips it
  -- and returns only a future pending bonus (or NULL if none exist).
  SELECT ticket_position
  INTO v_next_bonus_position
  FROM public.bonus_prizes
  WHERE contest_id = p_contest_id
    AND ticket_position > v_next_ticket
    AND status = 'pending'
  ORDER BY ticket_position ASC
  LIMIT 1;

  v_result := jsonb_build_object(
    'success',               true,
    'ticket_row_id',         v_new_ticket_id,
    'ticket_number',         v_next_ticket,
    'won_type',              CASE
                               WHEN v_next_ticket = v_ticket_count THEN 'main'
                               WHEN v_bonus_prize_id IS NOT NULL   THEN 'bonus'
                               ELSE NULL
                             END,
    'won_prize',             CASE
                               WHEN v_next_ticket = v_ticket_count THEN 'Hlavni vyhra'
                               WHEN v_bonus_prize_id IS NOT NULL   THEN v_bonus_title
                               ELSE NULL
                             END,
    -- NEW fields
    'remaining_tickets',     v_ticket_count - v_next_ticket,
    'next_bonus_position',   v_next_bonus_position,
    'distance_to_next_bonus', v_next_bonus_position - v_next_ticket
  );

  RETURN v_result;
END;
$function$;
