-- Restore own-ticket visibility and remove direct public access to private winner rows.

-- A signed-in user may read only their own tickets.
DROP POLICY IF EXISTS tickets_select_own ON public.tickets;
CREATE POLICY tickets_select_own
ON public.tickets
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Remove broad winner policies that exposed internal identifiers and notes.
DROP POLICY IF EXISTS "Allow read winners" ON public.winners;
DROP POLICY IF EXISTS winners_public_read ON public.winners;
DROP POLICY IF EXISTS winners_select_authenticated ON public.winners;

-- Keep authenticated users limited to their own wins; admins keep existing admin policies.
DROP POLICY IF EXISTS winners_select_own ON public.winners;
CREATE POLICY winners_select_own
ON public.winners
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

REVOKE SELECT ON public.winners FROM anon;
GRANT SELECT ON public.winners TO authenticated;

-- Public feed with no user, contest, prize, ticket or winner UUIDs and no admin notes.
DROP FUNCTION IF EXISTS public.get_latest_winners_public(integer);
CREATE FUNCTION public.get_latest_winners_public(winners_limit integer DEFAULT 50)
RETURNS TABLE(
  public_id text,
  type text,
  created_at timestamptz,
  user_name text,
  user_nickname text,
  prize_name text,
  prize_image_url text,
  contest_title text,
  user_avatar_url text,
  ticket_number integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    md5(w.id::text) AS public_id,
    w.type,
    w.created_at,
    COALESCE(
      NULLIF(u.nickname, ''),
      CASE
        WHEN NULLIF(u.first_name, '') IS NOT NULL AND NULLIF(u.last_name, '') IS NOT NULL
          THEN u.first_name || ' ' || left(u.last_name, 1) || '.'
        WHEN NULLIF(u.first_name, '') IS NOT NULL THEN u.first_name
        WHEN NULLIF(u.name, '') IS NOT NULL THEN u.name
        ELSE 'Výherce'
      END
    ) AS user_name,
    NULLIF(u.nickname, '') AS user_nickname,
    CASE
      WHEN w.type = 'main' THEN COALESCE(c.main_prize, 'Hlavní výhra')
      WHEN w.type = 'bonus' THEN
        CASE
          WHEN bp.amount IS NOT NULL THEN bp.amount || ' MioCoins'
          ELSE COALESCE(bp.description, 'Bonus')
        END
      ELSE 'Výhra'
    END AS prize_name,
    CASE
      WHEN w.type = 'main' THEN c.main_image
      WHEN w.type = 'bonus' THEN bp.image_url
      ELSE NULL
    END AS prize_image_url,
    COALESCE(c.title, 'Soutěž') AS contest_title,
    p.avatar_url AS user_avatar_url,
    t.number AS ticket_number
  FROM public.winners w
  LEFT JOIN public.users u ON u.id = w.user_id
  LEFT JOIN public.profiles p ON p.id = w.user_id
  LEFT JOIN public.contests c ON c.id = w.contest_id
  LEFT JOIN public.bonus_prizes bp ON bp.id = w.prize_id AND w.type = 'bonus'
  LEFT JOIN public.tickets t ON t.id = w.ticket_id
  ORDER BY w.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(winners_limit, 50), 1), 100);
$function$;

REVOKE ALL ON FUNCTION public.get_latest_winners_public(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_latest_winners_public(integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_latest_winners_public(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_winners_public(integer) TO service_role;