-- Performance regression introduced by the F1 fix (20260825120000).
--
-- Cause, proven with EXPLAIN ANALYZE on a 126 327-row staging fixture that
-- mirrors the production BMW contest:
--
--   Filter: ((status IS DISTINCT FROM 'pending') OR is_admin() OR is_superadmin(...))
--   Execution Time: 26630.189 ms
--
-- Postgres folds every RLS policy into one per-row Filter. Before F1 the
-- USING (true) policy made that filter trivially true, so the expensive terms
-- were never reached. With USING (true) gone, is_admin() runs once PER ROW —
-- and is_admin() is not SECURITY DEFINER, so each call re-reads public.user_roles
-- under ITS own RLS, whose policy in turn calls is_superadmin() and
-- has_admin_permission(). 126 327 rows x that nest = 26 s / statement timeout.
--
-- Fix (two parts, both minimal):
--
-- 1. public.is_admin_for_rls() — SECURITY DEFINER, so the user_roles lookup is a
--    single cheap index probe instead of a nested-RLS evaluation. Semantics are
--    identical to is_admin(): admin OR superadmin, resolved through user_roles,
--    which keeps working for role-drift accounts (user_roles.role='admin' while
--    users.role='user') — exactly the production account F1 was careful about.
--
-- 2. The policy uses (SELECT public.is_admin_for_rls()) rather than a bare call.
--    The scalar subquery makes the planner hoist it into an InitPlan evaluated
--    ONCE per statement, which is what actually removes the per-row cost:
--
--      InitPlan 1 -> Result (actual rows=1 loops=1)
--      Filter: (... OR (InitPlan 1).col1 OR ...)
--      Execution Time: 541.534 ms      (49x faster)
--
-- Deliberately NOT touched: the pre-existing "Allow admin full access to bonus
-- prizes" ALL policy. It contributes the remaining per-row term, but its
-- expression differs between environments (staging: is_superadmin(); production:
-- EXISTS over public.users.role), and rewriting it would change who has admin
-- WRITE access — on production it would newly grant writes to the drifted admin.
-- Instead the last unbounded customer-side scan was removed in the same commit:
-- ContestDetail no longer calls get_contest_miocoin_bonus (not SECURITY DEFINER,
-- so it inherited the whole per-row cost) and reads miocoin_total from the
-- SECURITY DEFINER catalogue RPC it already fetches. After that, every remaining
-- customer read of bonus_prizes is a bounded lookup by id or by
-- (contest_id, ticket_position).
--
-- Security is unchanged: customers still see no 'pending' row. Only the cost of
-- the admin branch changes.
--
-- get_contest_miocoin_bonus is left in place (now unused by the app; verified to
-- have zero other callers in src/, supabase/, tests/ and zero DB-side
-- dependencies) — dropping it is a separate decision.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_admin_for_rls()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'superadmin')
  );
$function$;

REVOKE ALL ON FUNCTION public.is_admin_for_rls() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin_for_rls() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin_for_rls() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_for_rls() TO service_role;

ALTER POLICY bonus_prizes_select_admin ON public.bonus_prizes
  USING ((SELECT public.is_admin_for_rls()));

-- 3. get_contest_miocoin_bonus becomes SECURITY DEFINER.
--    The app no longer calls it, but leaving it as an invoker function means any
--    future/leftover caller inherits the per-row RLS cost (seconds for an
--    authenticated user, a hard 42501 for anon). It returns a pure aggregate —
--    a single SUM of MioCoin amounts, no ticket_position — and that exact number
--    is already public through get_contest_bonus_catalogue and
--    contests.total_miocoin_bonus, so running it as definer discloses nothing new.
--    Its sibling get_contest_miocoin_sum is already SECURITY DEFINER.
--    NOTE: the signature must stay RETURNS integer with the ::int cast — the
--    existing function returns integer and CREATE OR REPLACE cannot change a
--    return type. Only SECURITY DEFINER + search_path are added; the body is
--    otherwise the original one.
CREATE OR REPLACE FUNCTION public.get_contest_miocoin_bonus(p_contest_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(SUM(bp.amount), 0)::int
  FROM public.bonus_prizes bp
  WHERE bp.contest_id = p_contest_id
    AND bp.amount > 0;
$function$;

COMMIT;
