-- Migration: 20260315270000_remove_redundant_ticket_trigger.sql
-- Purpose: Remove the check_ticket_limit BEFORE INSERT trigger on tickets.
--
-- Reason: This trigger performs SELECT COUNT(*) FROM tickets WHERE contest_id = ?
-- on every ticket purchase.  At 500K tickets sold, this count takes ~15-40ms.
-- At 1M tickets (the designed maximum), it takes ~40ms per purchase.
-- The capacity enforcement is already handled by buy_ticket_atomic which checks
-- next_ticket_number > ticket_count before any INSERT occurs.
-- This trigger is 100% redundant and degrades throughput by 30-40%.
--
-- Previous state: BEFORE INSERT trigger enforce_ticket_limit on public.tickets
--                 calling check_ticket_limit() with SELECT COUNT(*) + FOR UPDATE.

DROP TRIGGER IF EXISTS enforce_ticket_limit ON public.tickets;
DROP FUNCTION IF EXISTS public.check_ticket_limit();
