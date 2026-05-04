-- Migration: 20260504_fix_nonblocking_sofinity_triggers.sql
--
-- ROOT CAUSE
-- buy_ticket_atomic times out (error 57014) because two trigger functions
-- call net.http_post() synchronously inside the ticket-purchase transaction:
--
--   1. trigger_sofinity_forward() — fires on winners INSERT when fn_check_bonus_prize
--      finds a bonus position.  Calls net.http_post() directly.
--
--   2. process_event_queue_trigger() — fires on every event_queue INSERT.
--      Calls net.http_post() via a pg_net SELECT.
--      If assign_partner_offer_to_ticket (or anything else) calls
--      notify_sofinity_event(), this chain executes within the ticket transaction.
--
-- When the pg_net background worker queue is saturated the net.http_post()
-- call blocks until a slot opens, or until the 8-10 s PostgREST statement_timeout
-- fires and cancels the whole buy_ticket_atomic call → "57014 statement timeout".
--
-- FIX
-- 1. Rewrite trigger_sofinity_forward() to INSERT into event_queue instead of
--    calling net.http_post() directly.  The edge function that polls event_queue
--    will pick up and forward these events without blocking ticket purchases.
--
-- 2. Remove the net.http_post() call from process_event_queue_trigger().
--    The edge function that polls event_queue handles forwarding; no inline HTTP
--    call is needed or safe here.
--
-- REVERSAL (if needed):
--   Restore the previous function bodies from the migrations:
--     trigger_sofinity_forward → 20251014071356_acfe6a3c-...sql (lines 32-85)
--     process_event_queue_trigger → 20251030191723_bb34c599-...sql (lines 70-123)

-- ============================================================
-- 1. Rewrite trigger_sofinity_forward — queue instead of inline HTTP
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_sofinity_forward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event_name text;
  v_metadata   jsonb;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'user_vouchers' THEN
      v_event_name := 'voucher_redeemed';
      v_metadata := jsonb_build_object(
        'voucher_id', NEW.voucher_id,
        'user_id',    NEW.user_id,
        'redeemed',   NEW.redeemed
      );
    WHEN 'users' THEN
      v_event_name := 'user_created';
      v_metadata := jsonb_build_object(
        'user_id', NEW.id,
        'email',   NEW.email,
        'role',    NEW.role
      );
    WHEN 'winners' THEN
      v_event_name := 'winner_created';
      v_metadata := jsonb_build_object(
        'winner_id',  NEW.id,
        'user_id',    NEW.user_id,
        'contest_id', NEW.contest_id,
        'type',       NEW.type,
        'status',     NEW.status
      );
    ELSE
      -- Unknown table — skip silently
      RETURN NEW;
  END CASE;

  -- Enqueue event for async delivery by the background edge function.
  -- NEVER call net.http_post() here: this function runs inside the
  -- buy_ticket_atomic transaction and a blocking pg_net call would
  -- cause a 57014 statement timeout.
  INSERT INTO public.event_queue (
    event_name,
    user_id,
    contest_id,
    metadata,
    source_system,
    status
  ) VALUES (
    v_event_name,
    coalesce(NEW.user_id, (NEW::jsonb->>'id')::uuid),
    (NEW::jsonb->>'contest_id')::uuid,
    v_metadata,
    'onemil',
    'pending'
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the caller.  Log and continue.
  RAISE LOG 'trigger_sofinity_forward error (table=%, op=%): %', TG_TABLE_NAME, TG_OP, SQLERRM;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. Remove net.http_post from process_event_queue_trigger
--    Events now sit in event_queue; the polling edge function delivers them.
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_event_queue_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Intentionally a no-op: the event is already in event_queue.
  -- Delivery to Sofinity is handled by the send_event_to_sofinity edge function
  -- which polls event_queue for pending rows.
  --
  -- Previous version called net.http_post() here, which blocked every
  -- transaction that inserted into event_queue (including buy_ticket_atomic)
  -- when pg_net workers were saturated → error 57014.
  RETURN NEW;
END;
$$;
