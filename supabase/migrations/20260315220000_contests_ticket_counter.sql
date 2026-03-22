-- Migration: 20260315220000_contests_ticket_counter.sql
-- Purpose:   Add an atomic ticket counter column to the contests table.
--
-- BACKGROUND
-- buy_ticket_atomic currently generates the next ticket number by querying:
--
--   SELECT number FROM tickets WHERE contest_id = ?
--   ORDER BY number DESC LIMIT 1
--
-- This requires an index probe into the tickets table on every purchase.
-- Replacing it with an integer counter stored directly on the contest row
-- eliminates this read and makes the generation logic explicit and auditable.
--
-- The counter records the next ticket number to be assigned. Its value
-- equals MAX(tickets.number) + 1 for all existing contests, and 1 for any
-- contest that has not yet sold a ticket.
--
-- REVERSAL INSTRUCTIONS (if rollback is needed)
-- Run the following to undo this migration:
--
--   ALTER TABLE public.contests
--     DROP COLUMN IF EXISTS next_ticket_number;

-- ---------------------------------------------------------------------------
-- Step 1: Add the column
-- ---------------------------------------------------------------------------
-- NOT NULL DEFAULT 1 ensures every contest starts with a valid counter.
-- Existing rows receive DEFAULT 1 initially; Step 2 corrects them.
ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS next_ticket_number INTEGER NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- Step 2: Initialize counter from existing ticket data
-- ---------------------------------------------------------------------------
-- For each contest set next_ticket_number = MAX(ticket.number) + 1.
--
-- Formula breakdown:
--   COALESCE(MAX(t.number), 0) + 1
--     MAX = NULL when no tickets exist  → COALESCE gives 0  → counter = 1
--     MAX = 12 (12 tickets sold)        → counter = 13
--     MAX = ticket_count (contest full) → counter = ticket_count + 1
--
-- This is safe to run on active contests: the contests table is not locked
-- during this UPDATE, and buy_ticket_atomic still uses ORDER BY DESC LIMIT 1
-- until migration 20260315230000 is applied. The counter column is ignored by
-- the current function and becomes active only after that migration.
UPDATE public.contests c
SET    next_ticket_number = COALESCE(
         (SELECT MAX(t.number) FROM public.tickets t WHERE t.contest_id = c.id),
         0
       ) + 1;

-- ---------------------------------------------------------------------------
-- Step 3: Add a check constraint to prevent the counter going below 1
-- ---------------------------------------------------------------------------
ALTER TABLE public.contests
  ADD CONSTRAINT contests_next_ticket_number_positive
    CHECK (next_ticket_number >= 1);

-- ---------------------------------------------------------------------------
-- Verification query (run after applying):
--
--   SELECT c.id, c.status, c.ticket_count,
--          c.next_ticket_number,
--          COALESCE((SELECT MAX(t.number) FROM tickets t
--                    WHERE t.contest_id = c.id), 0) + 1 AS expected
--   FROM contests c
--   WHERE c.next_ticket_number <>
--         COALESCE((SELECT MAX(t.number) FROM tickets t
--                   WHERE t.contest_id = c.id), 0) + 1;
--
-- Expected: 0 rows (all counters correctly initialized).
-- ---------------------------------------------------------------------------
