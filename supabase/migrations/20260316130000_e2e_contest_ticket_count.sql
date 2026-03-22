-- Migration: 20260316130000_e2e_contest_ticket_count.sql
-- Purpose: Allow smaller ticket_count for E2E contest testing.
--
-- The contests_ticket_count_check constraint (likely ticket_count = 1000000)
-- prevents creating test contests with 1000 tickets. This migration relaxes
-- it to ticket_count >= 100 so the E2E test can verify the full contest flow
-- (bonus at 50, main prize at 1000) without buying 1M tickets.
--
-- Production contests will continue to use ticket_count = 1000000 via Admin UI.
-- This does NOT modify contest engine logic.
--
-- To run manually: Supabase Dashboard → SQL Editor → paste and run.

ALTER TABLE public.contests
  DROP CONSTRAINT IF EXISTS contests_ticket_count_check;

DO $$
BEGIN
  ALTER TABLE public.contests
    ADD CONSTRAINT contests_ticket_count_check
    CHECK (ticket_count >= 100);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
