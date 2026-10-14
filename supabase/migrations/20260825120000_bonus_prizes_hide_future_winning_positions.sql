-- F1 (critical) — a logged-in customer must not be able to learn FUTURE winning
-- ticket positions before buying.
--
-- Cause: public.bonus_prizes had two SELECT policies with USING (true)
--   * "Public can view bonus prizes"            (role public)
--   * "Authenticated users can read bonus prizes" (role authenticated)
-- Tickets are handed out sequentially (contests.next_ticket_number, which is
-- itself public), so reading the pending positions makes the contest
-- deterministically farmable: see the next pending position, buy exactly that
-- many tickets, take the prize.
--
-- Why not a GRANT revoke: admins sign in through the very same `authenticated`
-- Postgres role as customers, so REVOKE SELECT would blind the admin UI too.
-- The distinction has to happen inside RLS.
--
-- Fix:
--   1. Drop both USING (true) SELECT policies.
--   2. Admin read via the canonical public.is_admin() (user_roles based).
--      Deliberately NOT the pre-existing "Allow admin full access to bonus
--      prizes" ALL policy: that one reads public.users.role, and production has
--      drift (an account with user_roles.role='admin' but users.role='user')
--      which today only still sees the table because of USING (true). Using
--      is_admin() keeps that admin working.
--   3. Customers may read only ALREADY RESOLVED prizes (status <> 'pending').
--      A resolved position is worthless to an attacker — that ticket is gone.
--      This also keeps every legitimate customer read working, because
--      assign_contest_ticket_atomic flips the prize to 'won' in the same
--      transaction that creates the ticket, so the post-purchase result modal
--      and /wins still find the row.
--   4. New position-free catalogue RPC so the public contest page can keep
--      showing WHAT can be won without revealing WHERE.
--
-- Not touched: buy_ticket_atomic, assign_contest_ticket_atomic (SECURITY
-- DEFINER, reads bonus_prizes as owner — win evaluation is unaffected), any
-- write policy, wallets, ledger, contest_progress, admin write RPCs.

BEGIN;

-- 0. anon must not touch the table at all. Production already has this grant
--    revoked (so this is a no-op there); staging had drifted and still allowed
--    it. Without the revoke, an anon query still evaluates the pre-existing
--    "Allow admin full access to bonus prizes" ALL policy (role `public`),
--    whose subquery on public.users hits a users-RLS policy calling
--    is_superadmin() — which anon may not execute — so anon would get a
--    confusing 42501 instead of a clean deny. No data leaked either way.
REVOKE SELECT ON public.bonus_prizes FROM anon;

-- 1. remove the blanket read
DROP POLICY IF EXISTS "Public can view bonus prizes"            ON public.bonus_prizes;
DROP POLICY IF EXISTS "Authenticated users can read bonus prizes" ON public.bonus_prizes;

-- 2. admin/superadmin keep full visibility (canonical user_roles check)
DROP POLICY IF EXISTS bonus_prizes_select_admin ON public.bonus_prizes;
CREATE POLICY bonus_prizes_select_admin
  ON public.bonus_prizes
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 3. everyone else: resolved prizes only, never a pending (future) position
DROP POLICY IF EXISTS bonus_prizes_select_resolved ON public.bonus_prizes;
CREATE POLICY bonus_prizes_select_resolved
  ON public.bonus_prizes
  FOR SELECT
  TO authenticated
  USING (status IS DISTINCT FROM 'pending');

-- 4. Position-free public catalogue for the contest page.
--    Groups identical physical prizes and returns only a quantity, so the page
--    can render "Xbox Series X — 4x v soutěži" with no way back to a position.
--    MioCoin bonuses are returned only as aggregates.
CREATE OR REPLACE FUNCTION public.get_contest_bonus_catalogue(p_contest_id uuid)
RETURNS TABLE (
  description          text,
  detailed_description text,
  image_url            text,
  quantity             bigint,
  miocoin_positions    bigint,
  miocoin_total        numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH agg AS (
    SELECT
      count(*) FILTER (WHERE bp.amount > 0)                        AS mio_positions,
      COALESCE(sum(bp.amount) FILTER (WHERE bp.amount > 0), 0)     AS mio_total
    FROM public.bonus_prizes bp
    WHERE bp.contest_id = p_contest_id
  ),
  physical AS (
    SELECT
      bp.description                AS description,
      bp.detailed_description       AS detailed_description,
      min(bp.image_url)             AS image_url,
      count(*)                      AS quantity
    FROM public.bonus_prizes bp
    WHERE bp.contest_id = p_contest_id
      AND (bp.amount IS NULL OR bp.amount = 0)   -- physical prizes only
    GROUP BY bp.description, bp.detailed_description
  )
  -- LEFT JOIN from agg (always exactly one row) so a contest with only MioCoin
  -- bonuses still returns its aggregates; the caller ignores rows whose
  -- description IS NULL.
  SELECT p.description, p.detailed_description, p.image_url,
         COALESCE(p.quantity, 0) AS quantity,
         agg.mio_positions, agg.mio_total
  FROM agg
  LEFT JOIN physical p ON true
  ORDER BY COALESCE(p.quantity, 0) DESC, p.description;
$function$;

REVOKE ALL ON FUNCTION public.get_contest_bonus_catalogue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_contest_bonus_catalogue(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_contest_bonus_catalogue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contest_bonus_catalogue(uuid) TO service_role;

COMMIT;
