-- Migration: 20260717190000_buy_ticket_atomic_auth_and_wallet_tx.sql
--
-- SECURITY FIX for public.buy_ticket_atomic(p_user_id uuid, p_contest_id uuid)
--
-- PROBLEMS FIXED
-- 1. Function was executable by anon and trusted the caller-supplied p_user_id,
--    so any caller could (in theory) spend another user's wallet.
-- 2. The MioCoin deduction created no wallet_transactions audit row.
-- 3. A user without a wallets row silently got a free ticket (NULL balance
--    comparison skipped the deduction guard).
--
-- FIX
-- * The purchase identity is ALWAYS auth.uid(). No JWT -> 'Unauthorized'.
-- * p_user_id is kept only for backward compatibility with existing callers
--   (frontend, purchase-ticket Edge Function, generated types). If provided,
--   it must equal auth.uid(), otherwise 'Forbidden'. It is never used as the
--   purchase identity.
-- * Missing wallet row -> 'Wallet not found' (no ticket created).
-- * Every successful deduction inserts one wallet_transactions row:
--   user_id = auth.uid(), wallet_id, amount = -ticket_price,
--   balance_after = new balance, type = 'ticket_purchase',
--   source = 'buy_ticket_atomic', reference_id = new ticket row id,
--   metadata = { contest_id, ticket_number }.
-- * SET search_path = public added (SECURITY DEFINER hardening).
-- * EXECUTE revoked from PUBLIC and anon; granted to authenticated and
--   service_role only.
--
-- WHAT IS NOT CHANGED
-- Contest FOR UPDATE lock, wallet FOR UPDATE lock, sequential ticket
-- numbering via next_ticket_number, duplicate-ticket protection, bonus win,
-- main win + contest close, returned JSON shape (success, ticket_row_id,
-- ticket_number, won_type, won_prize, remaining_tickets,
-- next_bonus_position, distance_to_next_bonus).

-- Drop the legacy trigger that unconditionally wiped reference_id on every
-- wallet_transactions INSERT (fix_wallet_transaction_reference). It exists
-- only in the live databases (schema drift, not in this repo) and would
-- silently erase the ticket reference written below. wallet_transactions has
-- no FK on reference_id, so keeping references is safe for all writers.
DROP TRIGGER IF EXISTS fix_wallet_transaction_reference_trigger ON public.wallet_transactions;
DROP FUNCTION IF EXISTS public.fix_wallet_transaction_reference();

CREATE OR REPLACE FUNCTION public.buy_ticket_atomic(p_user_id uuid, p_contest_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_uid              uuid;
  v_ticket_price          numeric;
  v_ticket_count          integer;
  v_contest_status        text;
  v_next_ticket           integer;
  v_wallet_id             uuid;
  v_balance               numeric;
  v_new_balance           numeric;
  v_new_ticket_id         uuid;
  v_bonus_prize_id        uuid;
  v_bonus_title           text;
  v_next_bonus_position   integer;
  v_result                jsonb;
BEGIN
  -- Identity: always the authenticated caller, never the parameter.
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF p_user_id IS NOT NULL AND p_user_id <> v_auth_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;

  SELECT ticket_price, ticket_count, status, next_ticket_number
  INTO v_ticket_price, v_ticket_count, v_contest_status, v_next_ticket
  FROM public.contests WHERE id = p_contest_id FOR UPDATE;

  IF v_contest_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contest not found');
  END IF;
  IF v_contest_status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contest not active');
  END IF;
  IF v_next_ticket > v_ticket_count THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contest full');
  END IF;

  SELECT id, balance_coins INTO v_wallet_id, v_balance
  FROM public.wallets WHERE user_id = v_auth_uid FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;
  IF v_balance IS NULL OR v_balance < v_ticket_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nedostatek miocoinu');
  END IF;

  v_new_balance := v_balance - v_ticket_price;
  UPDATE public.wallets SET balance_coins = v_new_balance WHERE id = v_wallet_id;
  UPDATE public.contests SET next_ticket_number = next_ticket_number + 1 WHERE id = p_contest_id;

  INSERT INTO public.tickets (contest_id, user_id, number)
  VALUES (p_contest_id, v_auth_uid, v_next_ticket)
  RETURNING id INTO v_new_ticket_id;

  -- Audit trail for the MioCoin deduction (skip zero-price contests:
  -- wallet_transactions_amount_nonzero CHECK forbids amount = 0).
  IF v_ticket_price <> 0 THEN
    INSERT INTO public.wallet_transactions
      (user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata)
    VALUES
      (v_auth_uid,
       v_wallet_id,
       -v_ticket_price,
       v_new_balance,
       'ticket_purchase',
       'buy_ticket_atomic',
       v_new_ticket_id,
       jsonb_build_object('contest_id', p_contest_id, 'ticket_number', v_next_ticket));
  END IF;

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
    VALUES (v_auth_uid, p_contest_id, v_new_ticket_id, 'main');
    UPDATE public.contests SET status = 'closed' WHERE id = p_contest_id;
  END IF;

  -- BONUS win
  IF v_bonus_prize_id IS NOT NULL THEN
    INSERT INTO public.winners (user_id, contest_id, ticket_id, prize_id, type)
    VALUES (v_auth_uid, p_contest_id, v_new_ticket_id, v_bonus_prize_id, 'bonus');
    UPDATE public.bonus_prizes SET status = 'won' WHERE id = v_bonus_prize_id;
  END IF;

  -- Nearest pending bonus strictly after the current ticket.
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
    'remaining_tickets',     v_ticket_count - v_next_ticket,
    'next_bonus_position',   v_next_bonus_position,
    'distance_to_next_bonus', v_next_bonus_position - v_next_ticket
  );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.buy_ticket_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.buy_ticket_atomic(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.buy_ticket_atomic(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buy_ticket_atomic(uuid, uuid) TO service_role;
