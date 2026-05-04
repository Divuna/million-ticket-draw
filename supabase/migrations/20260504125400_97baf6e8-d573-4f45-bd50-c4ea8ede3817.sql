-- Migration: 20260504_fix_remaining_blocking_http_in_ticket_chain.sql
--
-- ROOT CAUSE
-- Po předchozí opravě (20260504_fix_nonblocking_sofinity_triggers.sql) zůstaly
-- v trigger řetězci nákupu tiketu ještě dvě funkce, které dělají SYNCHRONNÍ
-- net.http_post() uvnitř transakce buy_ticket_atomic:
--
--   1) trigger_notification_sent  (AFTER INSERT na public.notifications)
--      → volá net.http_post('…/sofinity-event', …)
--      Spouští se v řetězci: tickets INSERT → winners INSERT → notify_winner
--      → event_logs INSERT → enqueue_notifications_from_event_logs
--      → notifications INSERT → trigger_notification_sent → net.http_post  ⛔
--
--   2) call_event_forward_log_listener (volaná z případného INSERTU
--      do event_forward_log) → net.http_post('…/event_forward_log_listener', …, 5000)
--
-- Při saturaci pg_net workerů blokují tyto volání transakci, dokud nevyprší
-- statement_timeout PostgRESTu (8 s) → error 57014.
--
-- FIX
-- Obě funkce přepsat tak, aby místo přímého HTTP volání zapsaly událost do
-- public.event_queue (status='pending'). Doručení obstará polling edge funkce,
-- která už dnes event_queue čte a forwarduje do Sofinity.
--
-- ŽÁDNÉ změny: schémat, tabulek, RLS, grantů, buy_ticket_atomic, ekonomiky.
--
-- ROLLBACK
-- Předchozí těla funkcí jsou uložena v Supabase audit / starších dumpech;
-- pro návrat stačí CREATE OR REPLACE s původním tělem (volajícím net.http_post).

-- ============================================================
-- 1) trigger_notification_sent — async přes event_queue
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_notification_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'event_name', 'notification_sent',
    'user_id', NEW.user_id,
    'contest_id', NULL,
    'metadata', jsonb_build_object(
      'type', NEW.type,
      'message', NEW.message,
      'status', NEW.status,
      'notification_id', NEW.id
    ),
    'timestamp', now()
  );

  -- Audit zůstává (rychlý lokální INSERT, neblokuje).
  BEGIN
    INSERT INTO public.audit_logs (event, user_id, metadata)
    VALUES ('notification_sent', NEW.user_id, payload);
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'trigger_notification_sent audit insert failed: %', SQLERRM;
  END;

  -- Asynchronní doručení do Sofinity přes event_queue (NIKDY ne net.http_post zde).
  BEGIN
    INSERT INTO public.event_queue (
      event_name,
      user_id,
      contest_id,
      metadata,
      source_system,
      status
    ) VALUES (
      'notification_sent',
      NEW.user_id,
      NULL,
      jsonb_build_object(
        'type', NEW.type,
        'message', NEW.message,
        'status', NEW.status,
        'notification_id', NEW.id
      ),
      'onemil',
      'pending'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'trigger_notification_sent enqueue failed (notification_id=%): %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 2) call_event_forward_log_listener — async přes event_queue
-- ============================================================
CREATE OR REPLACE FUNCTION public.call_event_forward_log_listener()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    INSERT INTO public.event_queue (
      event_name,
      user_id,
      contest_id,
      metadata,
      source_system,
      status
    ) VALUES (
      'event_forward_log_listener',
      NULL,
      NULL,
      jsonb_build_object('id', NEW.id),
      'onemil',
      'pending'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'call_event_forward_log_listener enqueue failed (id=%): %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;