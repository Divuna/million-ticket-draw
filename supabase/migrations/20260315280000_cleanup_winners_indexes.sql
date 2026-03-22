-- Migration: 20260315280000_cleanup_winners_indexes.sql
-- Purpose: Remove redundant UNIQUE indexes on winners table.
--          Add missing indexes for query patterns.
--
-- Background: The winners table accumulated 9+ UNIQUE indexes during iterative
-- hardening. Many overlap or are exact duplicates. Each INSERT into winners must
-- maintain all of them, causing unnecessary write amplification (~4-5x).
--
-- INDEXES KEPT (canonical, minimal set):
--   idx_winners_one_main_per_contest : UNIQUE (contest_id) WHERE type='main'
--   uniq_winner_bonus                : UNIQUE (contest_id, prize_id) WHERE type='bonus' AND prize_id IS NOT NULL
--
-- INDEXES DROPPED (redundant with the above):
--   ux_one_main_winner_per_contest   : identical to idx_winners_one_main_per_contest
--   winners_unique_main              : UNIQUE (contest_id, type) WHERE type='main' — superset of kept
--   uniq_main_winner_per_contest     : UNIQUE (contest_id) WHERE prize_id IS NULL — different semantics, weaker
--   uniq_winner_main                 : UNIQUE (contest_id) WHERE type='main' AND prize_id IS NULL — subset of kept
--   idx_winners_one_per_bonus_prize  : UNIQUE (prize_id) WHERE type='bonus' AND prize_id IS NOT NULL — superset
--   uniq_winner_per_prize            : UNIQUE (contest_id, prize_id) WHERE prize_id IS NOT NULL — no type filter
--   unique_contest_prize             : UNIQUE (contest_id, prize_id) — no WHERE clause, allows NULL,NULL duplicates
--
-- INDEXES ADDED:
--   idx_winners_ticket_id            : lookup by ticket_id (FK, no index exists)
--   idx_winners_undelivered          : admin prize delivery workflow

-- Remove redundant main winner indexes
DROP INDEX IF EXISTS public.ux_one_main_winner_per_contest;
DROP INDEX IF EXISTS public.winners_unique_main;
DROP INDEX IF EXISTS public.uniq_main_winner_per_contest;
DROP INDEX IF EXISTS public.uniq_winner_main;

-- Remove redundant bonus winner indexes
DROP INDEX IF EXISTS public.idx_winners_one_per_bonus_prize;
DROP INDEX IF EXISTS public.uniq_winner_per_prize;
-- unique_contest_prize is a TABLE CONSTRAINT — must use ALTER TABLE, not DROP INDEX
ALTER TABLE public.winners DROP CONSTRAINT IF EXISTS unique_contest_prize;

-- Also clean up bonus_prizes redundant index
-- Keep: bonus_prizes_unique_position (canonical)
DROP INDEX IF EXISTS public.idx_bonus_prizes_contest_position_unique;

-- Add missing functional indexes
CREATE INDEX IF NOT EXISTS idx_winners_ticket_id
  ON public.winners(ticket_id)
  WHERE ticket_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_winners_undelivered
  ON public.winners(user_id, contest_id)
  WHERE delivered = false;

-- Clean up other duplicate indexes
-- influencer_referrals_user_id_key is a TABLE CONSTRAINT — use ALTER TABLE
ALTER TABLE public.influencer_referrals DROP CONSTRAINT IF EXISTS influencer_referrals_user_id_key;
-- (keep influencer_referrals_user_id_uniq as canonical)

DROP INDEX IF EXISTS public.idx_payments_user;
-- (keep idx_payments_user_id as canonical)
