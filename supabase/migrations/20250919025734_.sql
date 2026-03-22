-- Enhanced contest bonus statistics function with all required aggregations
CREATE OR REPLACE FUNCTION public.get_contest_bonus_stats_enhanced(contest_id uuid)
RETURNS TABLE(
  total_positions bigint,
  total_miocoins numeric,
  pending_count bigint,
  physical_items bigint,
  won_count bigint,
  min_position integer,
  max_position integer,
  first_20_positions text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH distinct_positions AS (
    SELECT DISTINCT 
      bp.ticket_position,
      bp.amount,
      bp.status
    FROM bonus_prizes bp
    WHERE bp.contest_id = get_contest_bonus_stats_enhanced.contest_id
  ),
  aggregated_stats AS (
    SELECT 
      COUNT(DISTINCT dp.ticket_position)::bigint AS total_positions,
      COALESCE(SUM(DISTINCT 
        CASE 
          WHEN dp.amount IS NOT NULL AND dp.amount > 0 THEN dp.amount 
          ELSE 0 
        END
      ), 0) AS total_miocoins,
      COUNT(DISTINCT 
        CASE 
          WHEN dp.status = 'pending' THEN dp.ticket_position 
          ELSE NULL 
        END
      )::bigint AS pending_count,
      COUNT(DISTINCT 
        CASE 
          WHEN (dp.amount IS NULL OR dp.amount = 0) THEN dp.ticket_position 
          ELSE NULL 
        END
      )::bigint AS physical_items,
      COUNT(DISTINCT 
        CASE 
          WHEN dp.status = 'won' THEN dp.ticket_position 
          ELSE NULL 
        END
      )::bigint AS won_count,
      MIN(dp.ticket_position) AS min_position,
      MAX(dp.ticket_position) AS max_position
    FROM distinct_positions dp
  ),
  first_positions AS (
    SELECT STRING_AGG(
      dp.ticket_position::text, 
      ', ' 
      ORDER BY dp.ticket_position
    ) AS positions_list
    FROM (
      SELECT DISTINCT ticket_position
      FROM bonus_prizes bp
      WHERE bp.contest_id = get_contest_bonus_stats_enhanced.contest_id
      ORDER BY ticket_position
      LIMIT 20
    ) dp
  )
  SELECT 
    COALESCE(ag.total_positions, 0),
    COALESCE(ag.total_miocoins, 0),
    COALESCE(ag.pending_count, 0),
    COALESCE(ag.physical_items, 0),
    COALESCE(ag.won_count, 0),
    ag.min_position,
    ag.max_position,
    COALESCE(fp.positions_list, 'No bonuses')
  FROM aggregated_stats ag
  CROSS JOIN first_positions fp;
END;
$$;;
