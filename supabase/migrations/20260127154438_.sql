DROP FUNCTION IF EXISTS public.get_latest_winners(integer);

CREATE OR REPLACE FUNCTION public.get_latest_winners(winners_limit integer DEFAULT 50)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  contest_id uuid,
  prize_id uuid,
  type text,
  created_at timestamptz,
  user_name text,
  user_nickname text,
  prize_name text,
  prize_image_url text,
  contest_title text,
  user_avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.id,
    w.user_id,
    w.contest_id,
    w.prize_id,
    w.type,
    w.created_at,
    COALESCE(
      u.nickname,
      u.name,
      CASE WHEN u.first_name IS NOT NULL AND u.last_name IS NOT NULL 
           THEN u.first_name || ' ' || u.last_name 
           ELSE NULL END,
      u.email,
      'Uživatel'
    ) AS user_name,
    u.nickname AS user_nickname,
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
    p.avatar_url AS user_avatar_url
  FROM winners w
  LEFT JOIN users u ON u.id = w.user_id
  LEFT JOIN profiles p ON p.id = w.user_id
  LEFT JOIN contests c ON c.id = w.contest_id
  LEFT JOIN bonus_prizes bp ON bp.id = w.prize_id AND w.type = 'bonus'
  ORDER BY w.created_at DESC
  LIMIT winners_limit;
END;
$$;;
