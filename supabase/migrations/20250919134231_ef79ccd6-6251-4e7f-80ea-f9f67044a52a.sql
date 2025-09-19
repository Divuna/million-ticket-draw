-- Create function to get contest bonus statistics with proper aggregation
CREATE OR REPLACE FUNCTION public.get_contest_bonus_stats(contest_id uuid)
RETURNS TABLE (
  total_bonus_units bigint,
  total_miocoins numeric,
  physical_items bigint,
  pending_bonuses bigint,
  won_bonuses bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT bp.ticket_position)::bigint AS total_bonus_units,
    COALESCE(SUM(DISTINCT 
      CASE 
        WHEN bp.amount IS NOT NULL AND bp.amount > 0 THEN bp.amount 
        ELSE 0 
      END
    ), 0) AS total_miocoins,
    COUNT(DISTINCT 
      CASE 
        WHEN (bp.amount IS NULL OR bp.amount = 0) THEN bp.ticket_position 
        ELSE NULL 
      END
    )::bigint AS physical_items,
    COUNT(DISTINCT 
      CASE 
        WHEN bp.status = 'pending' THEN bp.ticket_position 
        ELSE NULL 
      END
    )::bigint AS pending_bonuses,
    COUNT(DISTINCT 
      CASE 
        WHEN bp.status = 'won' THEN bp.ticket_position 
        ELSE NULL 
      END
    )::bigint AS won_bonuses
  FROM bonus_prizes bp
  WHERE bp.contest_id = get_contest_bonus_stats.contest_id;
END;
$$;