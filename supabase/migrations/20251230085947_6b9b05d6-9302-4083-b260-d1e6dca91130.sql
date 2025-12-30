-- Update get_prizes_delivery_summary to count only actual wins (won + delivered), not pending positions
CREATE OR REPLACE FUNCTION public.get_prizes_delivery_summary(p_contest_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(contest_title text, total_prizes bigint, delivered_count bigint, pending_count bigint, won_count bigint, prize_positions text, summary_text text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH prize_stats AS (
    SELECT 
      c.title as contest_title,
      -- Count only actual wins (won + delivered), not pending bonus positions
      COUNT(CASE WHEN bp.status IN ('won', 'delivered') THEN 1 END) as total_prizes,
      COUNT(CASE WHEN bp.status = 'delivered' THEN 1 END) as delivered_count,
      -- pending_count now means "waiting for delivery" = won status only
      COUNT(CASE WHEN bp.status = 'won' THEN 1 END) as pending_count,
      COUNT(CASE WHEN bp.status = 'won' THEN 1 END) as won_count,
      STRING_AGG(
        CASE WHEN bp.status IN ('won', 'delivered') THEN
          CONCAT(bp.ticket_position, ':', bp.status, 
                 CASE WHEN bp.admin_notes IS NOT NULL 
                      THEN CONCAT('(', bp.admin_notes, ')') 
                      ELSE '' END)
        END,
        ', ' ORDER BY bp.ticket_position
      ) as prize_positions
    FROM contests c
    LEFT JOIN bonus_prizes bp ON c.id = bp.contest_id
    WHERE (p_contest_id IS NULL OR c.id = p_contest_id)
    GROUP BY c.id, c.title
  )
  SELECT 
    ps.contest_title,
    ps.total_prizes,
    ps.delivered_count,
    ps.pending_count,
    ps.won_count,
    ps.prize_positions,
    CONCAT(ps.contest_title, ': ', ps.total_prizes, ' výher celkem, ',
           ps.delivered_count, ' předáno, ', ps.pending_count, ' čeká na předání') as summary_text
  FROM prize_stats ps;
END;
$function$;