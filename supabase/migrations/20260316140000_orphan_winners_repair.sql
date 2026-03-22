-- =============================================================================
-- Orphan Winners Repair — 2026-03-16
-- Removes winners rows with ticket_id referencing non-existent tickets.
-- Backup created before deletion. No schema changes. No trigger changes.
--
-- Run in Supabase SQL Editor (Settings › SQL Editor).
-- Report appears in NOTICE output.
-- =============================================================================

DO $$
DECLARE
  v_before    INT;
  v_backup    INT;
  v_deleted   INT;
  v_remaining INT;
BEGIN
  -- 1. Count orphan winners before fix
  SELECT COUNT(*) INTO v_before
  FROM public.winners w
  WHERE w.ticket_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = w.ticket_id);

  -- 2. Create backup snapshot
  DROP TABLE IF EXISTS public.winners_orphan_backup;
  CREATE TABLE public.winners_orphan_backup AS
  SELECT *
  FROM public.winners
  WHERE ticket_id IS NOT NULL
    AND ticket_id NOT IN (SELECT id FROM public.tickets);

  SELECT COUNT(*) INTO v_backup FROM public.winners_orphan_backup;

  -- 3. Remove orphan winners from main table
  DELETE FROM public.winners
  WHERE ticket_id IS NOT NULL
    AND ticket_id NOT IN (SELECT id FROM public.tickets);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- 4. Verify result
  SELECT COUNT(*) INTO v_remaining
  FROM public.winners w
  LEFT JOIN public.tickets t ON w.ticket_id = t.id
  WHERE w.ticket_id IS NOT NULL
    AND t.id IS NULL;

  RAISE NOTICE 'Orphan winners before fix: %', v_before;
  RAISE NOTICE 'Rows backed up: %', v_backup;
  RAISE NOTICE 'Rows deleted: %', v_deleted;
  RAISE NOTICE 'Remaining orphan winners: %', v_remaining;
END $$;
