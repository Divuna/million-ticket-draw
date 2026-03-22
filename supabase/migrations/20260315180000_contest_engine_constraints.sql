-- =============================================================================
-- Contest engine safety: step 2 of 3 – add constraints.
-- MUST be run after 20260315170000_contest_engine_cleanup.sql.
-- All DDL uses IF NOT EXISTS / DO blocks so the migration is idempotent.
-- Run manually in Supabase SQL Editor. Do not run via CLI.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. tickets: UNIQUE (contest_id, number)
--    Prevents duplicate ticket numbers within a contest at the DB level.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_contest_number_unique
  ON public.tickets (contest_id, number);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. bonus_prizes: UNIQUE (contest_id, ticket_position)
--    Prevents two bonus slots at the same position within a contest.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_bonus_prizes_contest_position_unique
  ON public.bonus_prizes (contest_id, ticket_position);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. winners: one main winner per contest
--    Partial unique index; only one row per contest_id where type = 'main'.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_winners_one_main_per_contest
  ON public.winners (contest_id)
  WHERE type = 'main';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. winners: one winner per bonus prize
--    Partial unique index; only one row per prize_id where type = 'bonus'.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_winners_one_per_bonus_prize
  ON public.winners (prize_id)
  WHERE type = 'bonus' AND prize_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. winners.ticket_id → tickets.id (nullable FK, ON DELETE SET NULL)
--
--    5a. Add the column if it does not exist yet.
--        (close_contest already inserts into this column; buy_ticket_atomic
--         will start doing the same after the functions migration step 3.)
--    5b. Null out any stale ticket_id values that no longer exist in tickets
--        (prevents FK violation when the constraint is created).
--    5c. Create the FK constraint (idempotent via DO block).
-- ─────────────────────────────────────────────────────────────────────────────

-- 5a: add column
ALTER TABLE public.winners
  ADD COLUMN IF NOT EXISTS ticket_id uuid;

-- 5b: nullify orphan references
UPDATE public.winners
SET    ticket_id = NULL
WHERE  ticket_id IS NOT NULL
  AND  NOT EXISTS (
         SELECT 1
         FROM   public.tickets t
         WHERE  t.id = winners.ticket_id
       );

-- 5c: add FK constraint (skip if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname  = 'fk_winners_ticket_id'
      AND  conrelid = 'public.winners'::regclass
  ) THEN
    ALTER TABLE public.winners
      ADD CONSTRAINT fk_winners_ticket_id
        FOREIGN KEY (ticket_id)
        REFERENCES  public.tickets(id)
        ON DELETE   SET NULL;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. wallets: validate the non-negative CHECK constraint
--    The constraint 'wallets_balance_coins_non_negative' was added NOT VALID in
--    migration 20260315140000. Step 1 cleanup zeroed any negative balances, so
--    validation is now safe.
--    Skipped gracefully if the constraint does not exist in this environment.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname  = 'wallets_balance_coins_non_negative'
      AND  conrelid = 'public.wallets'::regclass
  ) THEN
    ALTER TABLE public.wallets
      VALIDATE CONSTRAINT wallets_balance_coins_non_negative;
  END IF;
END;
$$;
