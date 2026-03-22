-- Migration: 20260315260000_cleanup_duplicate_triggers.sql
-- Purpose: Remove duplicate/redundant triggers that cause event floods,
--          double user bootstrap on signup, and dead code.
--
-- Changes:
--   1. Voucher triggers: 5 triggers calling trg_voucher_purchased() reduced to 2 (1 INSERT, 1 UPDATE)
--   2. auth.users: remove trigger_handle_new_auth_user (exact duplicate of on_auth_user_created)
--   3. Disable/remove dead event_queue triggers that are already disabled
--   4. Fix fn_check_bonus_prize to set ticket_id on bonus winners

-- ============================================================
-- 1. VOUCHER TRIGGERS: Remove 3 of 5 (keep one INSERT, one UPDATE)
-- ============================================================

-- Keep: trg_voucher_purchased (AFTER INSERT)
-- Remove these duplicates:
DROP TRIGGER IF EXISTS after_voucher_insert ON public.vouchers;
DROP TRIGGER IF EXISTS trg_voucher_purchased_insert ON public.vouchers;

-- Keep: trg_voucher_purchased_update_user (AFTER UPDATE)
-- Remove this duplicate:
DROP TRIGGER IF EXISTS trigger_voucher_purchased ON public.vouchers;

-- ============================================================
-- 2. auth.users: Remove duplicate handle_new_auth_user trigger
-- ============================================================

-- keep: on_auth_user_created (calls handle_new_auth_user → creates profiles + wallets)
-- remove: trigger_handle_new_auth_user (identical trigger on same table calling same function)
DROP TRIGGER IF EXISTS trigger_handle_new_auth_user ON auth.users;

-- ============================================================
-- 3. Remove permanently-disabled dead event_queue triggers
-- ============================================================

DROP TRIGGER IF EXISTS onemil_messages_forward_to_sofinity ON public.event_queue;
DROP TRIGGER IF EXISTS process_event_queue_message_trigger ON public.event_queue;
DROP TRIGGER IF EXISTS trigger_debug_event_log ON public.event_queue;

-- ============================================================
-- 4. Fix fn_check_bonus_prize to include ticket_id
-- ============================================================

-- The trigger currently omits ticket_id from the winners INSERT.
-- This means all bonus winners created via this trigger have ticket_id = NULL,
-- breaking the FK link between winner and winning ticket.
-- migration 20260315240000 backfills ticket_id from buy_ticket_atomic,
-- but we fix the source trigger here too.

CREATE OR REPLACE FUNCTION public.fn_check_bonus_prize()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $func$
DECLARE
  v_bonus bonus_prizes%rowtype;
BEGIN
  SELECT * INTO v_bonus
  FROM bonus_prizes
  WHERE contest_id      = NEW.contest_id
    AND ticket_position = NEW.number
    AND status          = 'pending'
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO winners (contest_id, prize_id, user_id, ticket_id, type, notes)
    VALUES (NEW.contest_id, v_bonus.id, NEW.user_id, NEW.id, 'bonus',
            format('Bonus prize for ticket #%s', NEW.number))
    ON CONFLICT DO NOTHING;

    UPDATE bonus_prizes SET status = 'won'
    WHERE id = v_bonus.id;
  END IF;

  RETURN NEW;
END;
$func$;
