-- Migration: 20260315210000_tickets_index_cleanup.sql
-- Purpose:   Remove two redundant UNIQUE indexes on tickets(contest_id, number).
--
-- AUDIT FINDINGS
-- Three separate objects enforce the same uniqueness on (contest_id, number):
--
--   1. tickets_contest_id_number_key   — UNIQUE TABLE CONSTRAINT  ← KEEP (canonical, original)
--   2. tickets_contest_number_unique   — UNIQUE TABLE CONSTRAINT  ← DROP (added by migration 20260315180000)
--   3. idx_tickets_contest_number_unique — standalone UNIQUE INDEX  ← DROP (no backing constraint)
--
-- Keeping all three objects causes PostgreSQL to maintain three identical B-tree
-- index structures on every INSERT and UPDATE. At 1M tickets per contest this adds
-- ~2–4 ms of index-write overhead per ticket purchase, contributing directly to
-- contest row lock hold time.
--
-- REVERSAL INSTRUCTIONS (if rollback is needed)
-- Run the following to restore the dropped objects:
--
--   ALTER TABLE public.tickets
--     ADD CONSTRAINT tickets_contest_number_unique UNIQUE (contest_id, number);
--
--   CREATE UNIQUE INDEX idx_tickets_contest_number_unique
--     ON public.tickets (contest_id, number);

-- ---------------------------------------------------------------------------
-- Step 1: Drop duplicate UNIQUE TABLE CONSTRAINT
-- ---------------------------------------------------------------------------
-- This constraint is identical to tickets_contest_id_number_key.
-- DROP CONSTRAINT also drops its backing index automatically.
ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_contest_number_unique;

-- ---------------------------------------------------------------------------
-- Step 2: Drop duplicate standalone UNIQUE INDEX
-- ---------------------------------------------------------------------------
-- This index was created independently (no pg_constraint entry).
-- It enforces the same (contest_id, number) uniqueness.
DROP INDEX IF EXISTS public.idx_tickets_contest_number_unique;

-- ---------------------------------------------------------------------------
-- Remaining indexes on tickets(contest_id, number) after this migration:
--
--   tickets_contest_id_number_key   UNIQUE CONSTRAINT+INDEX   (contest_id, number)
--   tickets_contest_number_desc     plain INDEX               (contest_id, number DESC)
--
-- The DESC index is retained for now; it supports ORDER BY number DESC LIMIT 1
-- in buy_ticket_atomic. It will be dropped by migration 20260315230000 once
-- the function is updated to use the atomic counter column.
-- ---------------------------------------------------------------------------
