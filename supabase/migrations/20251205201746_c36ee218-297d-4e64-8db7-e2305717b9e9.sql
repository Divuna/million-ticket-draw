-- First drop the existing function
DROP FUNCTION IF EXISTS get_contest_management_data(uuid);

-- Recreate with fixed column references
CREATE OR REPLACE FUNCTION get_contest_management_data(p_contest_id_filter UUID DEFAULT NULL)
RETURNS TABLE (
  contest_id UUID,
  title TEXT,
  description TEXT,
  main_prize TEXT,
  main_image TEXT,
  status TEXT,
  ticket_count INT,
  ticket_price INT,
  tickets_sold BIGINT,
  progress_percentage NUMERIC,
  total_miocoin_bonus BIGINT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id AS contest_id,
    c.title,
    c.description,
    c.main_prize,
    c.main_image,
    c.status,
    c.ticket_count,
    c.ticket_price,
    COALESCE(t.sold_count, 0) AS tickets_sold,
    CASE 
      WHEN c.ticket_count > 0 THEN ROUND((COALESCE(t.sold_count, 0)::NUMERIC / c.ticket_count::NUMERIC) * 100, 1)
      ELSE 0
    END AS progress_percentage,
    COALESCE(b.total_bonus, 0) AS total_miocoin_bonus,
    c.created_at,
    c.updated_at
  FROM contests c
  LEFT JOIN (
    SELECT tk.contest_id AS cid, COUNT(*) AS sold_count
    FROM tickets tk
    GROUP BY tk.contest_id
  ) t ON t.cid = c.id
  LEFT JOIN (
    SELECT bp.contest_id AS cid, SUM(COALESCE(bp.amount, 0)) AS total_bonus
    FROM bonus_prizes bp
    GROUP BY bp.contest_id
  ) b ON b.cid = c.id
  WHERE (p_contest_id_filter IS NULL OR c.id = p_contest_id_filter)
  ORDER BY c.created_at DESC;
END;
$$;