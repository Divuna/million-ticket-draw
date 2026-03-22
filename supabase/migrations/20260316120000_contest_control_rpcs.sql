-- Contest control RPC functions for admin panel
-- Creates pause_contest, resume_contest, trigger_contest_draw if they do not exist.
-- Does NOT modify close_contest.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. pause_contest
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pause_contest(contest_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.contests
  SET status = 'paused'
  WHERE id = contest_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. resume_contest
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resume_contest(contest_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.contests
  SET status = 'active'
  WHERE id = contest_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. trigger_contest_draw
-- Uses close_contest (run_contest_draw does not exist; close_contest performs
-- the random draw among sold tickets).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_contest_draw(contest_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.close_contest(contest_id);
END;
$$;
