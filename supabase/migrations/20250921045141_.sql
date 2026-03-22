-- Fix the get_contest_management_data RPC function to resolve column name conflicts
DROP FUNCTION IF EXISTS public.get_contest_management_data(uuid);

CREATE OR REPLACE FUNCTION public.get_contest_management_data(p_contest_id_filter uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  contest_id uuid, 
  title text, 
  description text, 
  main_prize text, 
  main_image text, 
  status text, 
  ticket_count integer, 
  ticket_price numeric, 
  tickets_sold bigint, 
  progress_percentage numeric, 
  bonus_count bigint, 
  bonus_summary text, 
  created_at timestamp with time zone, 
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH contest_stats AS (
    SELECT 
      c.id as contest_id_val,
      c.title,
      c.description,
      c.main_prize,
      c.main_image,
      c.status,
      c.ticket_count,
      c.ticket_price,
      c.created_at,
      c.updated_at,
      COALESCE(t.tickets_sold, 0) as tickets_sold,
      ROUND((COALESCE(t.tickets_sold, 0)::numeric / c.ticket_count::numeric) * 100, 2) as progress_percentage,
      COALESCE(bp.bonus_count, 0) as bonus_count,
      bp.bonus_summary
    FROM contests c
    LEFT JOIN (
      SELECT 
        tk.contest_id,
        COUNT(*) as tickets_sold
      FROM tickets tk
      GROUP BY tk.contest_id
    ) t ON c.id = t.contest_id
    LEFT JOIN (
      SELECT 
        b.contest_id,
        COUNT(*) as bonus_count,
        STRING_AGG(
          CONCAT(b.ticket_position, ':', b.description, 
                 CASE WHEN b.amount IS NOT NULL AND b.amount > 0 
                      THEN CONCAT('(', b.amount, ' MioCoins)')
                      ELSE '(Fyzická)' END,
                 '[', b.status, ']'),
          ', ' ORDER BY b.ticket_position
        ) as bonus_summary
      FROM bonus_prizes b
      GROUP BY b.contest_id
    ) bp ON c.id = bp.contest_id
    WHERE p_contest_id_filter IS NULL OR c.id = p_contest_id_filter
  )
  SELECT 
    cs.contest_id_val,
    cs.title,
    cs.description,
    cs.main_prize,
    cs.main_image,
    cs.status,
    cs.ticket_count,
    cs.ticket_price,
    cs.tickets_sold,
    cs.progress_percentage,
    cs.bonus_count,
    cs.bonus_summary,
    cs.created_at,
    cs.updated_at
  FROM contest_stats cs
  ORDER BY cs.created_at DESC;
END;
$function$;;
