-- Migration: 20260315290000_additional_safety_constraints.sql
-- Purpose: Add missing safety constraints identified in audit.
-- All constraints use NOT VALID + ALTER TABLE VALIDATE CONSTRAINT to avoid locking
-- existing rows while being checked — safe for production tables with data.

-- ============================================================
-- 1. wallets.bonus_balance_coins >= 0
-- ============================================================
-- balance_coins already has this constraint (from migration 20260315140000).
-- bonus_balance_coins does not, and can drift negative from bugs or concurrent ops.

DO $$ BEGIN
  ALTER TABLE public.wallets
    ADD CONSTRAINT wallets_bonus_balance_non_negative
    CHECK (bonus_balance_coins >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.wallets VALIDATE CONSTRAINT wallets_bonus_balance_non_negative;

-- ============================================================
-- 2. payments.amount > 0
-- ============================================================

DO $$ BEGIN
  ALTER TABLE public.payments
    ADD CONSTRAINT payments_amount_positive
    CHECK (amount > 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.payments VALIDATE CONSTRAINT payments_amount_positive;

-- ============================================================
-- 3. wallet_transactions.amount <> 0
-- ============================================================
-- A zero-amount ledger entry provides no information and could mask bugs.

DO $$ BEGIN
  ALTER TABLE public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_amount_nonzero
    CHECK (amount <> 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.wallet_transactions VALIDATE CONSTRAINT wallet_transactions_amount_nonzero;

-- ============================================================
-- 4. contests.next_ticket_number upper bound
-- ============================================================
-- next_ticket_number should never exceed ticket_count + 1.
-- The + 1 allows for the value after all tickets are sold (the "full" state).

DO $$ BEGIN
  ALTER TABLE public.contests
    ADD CONSTRAINT contests_next_ticket_bounded
    CHECK (next_ticket_number <= ticket_count + 1) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.contests VALIDATE CONSTRAINT contests_next_ticket_bounded;

-- ============================================================
-- 5. Add performance indexes for common query patterns
-- ============================================================

-- payments.status — frequently filtered in admin dashboard
CREATE INDEX IF NOT EXISTS idx_payments_status
  ON public.payments(status, created_at DESC);

-- notifications.status — push delivery queue polling
CREATE INDEX IF NOT EXISTS idx_notifications_status
  ON public.notifications(status, created_at)
  WHERE status IN ('queued', 'pending');

-- event_logs.user_id — user event history queries
CREATE INDEX IF NOT EXISTS idx_event_logs_user_id
  ON public.event_logs(user_id, "timestamp" DESC)
  WHERE user_id IS NOT NULL;

-- winners.delivered=false per contest — prize management
-- (already covered by idx_winners_undelivered from migration 20260315280000)
