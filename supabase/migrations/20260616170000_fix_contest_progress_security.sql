-- Fix Supabase security advisor finding on public.contest_progress.
-- The view is a read-only aggregate over public.contests/public.tickets and
-- should always evaluate with the querying user's privileges, not the owner.
-- Also tighten grants so anon/authenticated only keep SELECT.

ALTER VIEW public.contest_progress
  SET (security_invoker = true);

REVOKE ALL PRIVILEGES
  ON TABLE public.contest_progress
  FROM anon, authenticated;

GRANT SELECT
  ON TABLE public.contest_progress
  TO anon, authenticated;
