-- Run this in Supabase Dashboard → SQL Editor before running the E2E contest test.
-- Allows creating test contests with ticket_count >= 100 (e.g. 1000 for E2E).

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
