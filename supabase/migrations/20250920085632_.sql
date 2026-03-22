-- Create RPC function to get contests with ticket data in JSON format
CREATE OR REPLACE FUNCTION public.get_contests_json()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result json;
BEGIN
  SELECT json_agg(
    json_build_object(
      'id', c.id,
      'title', c.title,
      'description', c.description,
      'main_prize', c.main_prize,
      'main_image', c.main_image,
      'status', c.status,
      'tickets_played', COALESCE(ticket_counts.count, 0),
      'total_tickets', c.ticket_count,
      'main_prize_ticket', c.ticket_count,
      'bonus_tickets', COALESCE(bonus_data.bonus_tickets, '[]'::json),
      'created_at', c.created_at,
      'ticket_price', c.ticket_price
    )
  )
  INTO result
  FROM contests c
  LEFT JOIN (
    SELECT 
      contest_id,
      COUNT(*) as count
    FROM tickets
    GROUP BY contest_id
  ) ticket_counts ON c.id = ticket_counts.contest_id
  LEFT JOIN (
    SELECT 
      contest_id,
      json_agg(ticket_position ORDER BY ticket_position) as bonus_tickets
    FROM (
      SELECT 
        contest_id,
        ticket_position,
        ROW_NUMBER() OVER (PARTITION BY contest_id ORDER BY ticket_position) as rn
      FROM bonus_prizes
    ) ranked_bonus
    WHERE rn <= 50
    GROUP BY contest_id
  ) bonus_data ON c.id = bonus_data.contest_id
  ORDER BY c.created_at DESC;

  RETURN COALESCE(result, '[]'::json);
END;
$function$;;
